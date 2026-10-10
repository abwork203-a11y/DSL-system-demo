const { pool } = require('../config/db');

/**
 * Wraps a route handler so its queries run inside one Postgres transaction
 * with `app.user_id` / `app.role` set via SET LOCAL — the session variables
 * every zone/ownership RLS policy in schema.sql keys off.
 *
 * SET LOCAL is scoped to the current transaction only. That matters because
 * `pool` hands out pooled connections that get reused across unrelated
 * requests — a session-level SET would leak this user's id onto whichever
 * request grabs the same physical connection next. Wrapping every request
 * in its own BEGIN...COMMIT (or ROLLBACK) means the setting is gone the
 * moment this request's transaction ends, regardless of who gets the
 * connection after.
 *
 * Controllers here are wrapped in asyncHandler, which catches a rejected
 * controller promise itself and calls next(err) rather than letting the
 * rejection propagate. So the handler is given our own `finish` in place of
 * Express's real `next` — asyncHandler's `.catch(next)` calls finish(err)
 * with it, and since finish is async, asyncHandler's own returned promise
 * won't settle until finish(err) has fully run. That's what lets the plain
 * `await handler(...)` below reliably detect an error either way, whether
 * the handler threw directly or reported it via next().
 *
 * DEFERRED RESPONSE — this is the important part for anything that writes:
 * a handler must NOT call res.json/res.send/res.end directly. It calls
 * req.respond(status, body) or req.respondEnd(status) instead, which only
 * *records* what to send. The actual response is sent from here, strictly
 * after COMMIT has succeeded — never before. Same idea for req.afterCommit
 * (fn) — for side effects like cache invalidation or a socket emit that
 * announce a write happened; queued, and only run once that write is
 * actually durable, in the order they were registered.
 *
 * requireAuth must run before this — it depends on req.user.
 */
function withRls(handler) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new Error('withRls used without requireAuth running first.'));
    }

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      // Acquiring a connection itself failed — e.g. config/db.js's
      // connectionTimeoutMillis fired under a network stall. Nothing to
      // roll back or release, since no client was ever obtained. This MUST
      // be caught right here: left to reject on its own, this becomes an
      // unhandled promise rejection — which crashes the entire Node
      // process, not just this one request. That's a far worse failure
      // than a clean error response: every other in-flight or incoming
      // request gets hit with a 502 while Render restarts the process,
      // which looks exactly like what we've been chasing — inconsistent,
      // table-agnostic failures that depend on timing rather than on
      // which route was actually called.
      return next(err);
    }

    let settled = false;
    let pendingResponse = null; // { status, body?, hasBody }
    const afterCommitCallbacks = [];

    req.db = client;

    req.respond = (status, body) => {
      pendingResponse = { status, body, hasBody: true };
    };
    req.respondEnd = (status) => {
      pendingResponse = { status, hasBody: false };
    };
    req.afterCommit = (fn) => {
      afterCommitCallbacks.push(fn);
    };

    const finish = async (err) => {
      if (settled) return;
      settled = true;

      try {
        if (err) {
          await client.query('ROLLBACK').catch(() => {});
        } else {
          await client.query('COMMIT');
        }
      } catch (commitErr) {
        err = err || commitErr;
      } finally {
        client.release();
      }

      if (err) {
        return next(err);
      }

      // Only reachable once COMMIT has actually succeeded — everything
      // below is safe to treat as "this write really happened."
      for (const fn of afterCommitCallbacks) {
        try {
          fn();
        } catch (callbackErr) {
          // A cache-invalidation or socket-emit failure here shouldn't turn
          // an otherwise-successful, already-committed write into an error
          // response — the write stands either way. Log and move on.
          // eslint-disable-next-line no-console
          console.error('withRls afterCommit callback failed:', callbackErr);
        }
      }

      if (pendingResponse) {
        if (pendingResponse.hasBody) {
          res.status(pendingResponse.status).json(pendingResponse.body);
        } else {
          res.status(pendingResponse.status).end();
        }
      }
    };

    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.role', $2, true)`,
        [String(req.user.id), req.user.role]
      );

      // `finish` stands in for `next` here — see comment above for why.
      await handler(req, res, finish);
      await finish();
    } catch (err) {
      // Reached if the handler isn't asyncHandler-wrapped and threw/rejected
      // directly, rather than routing the error through the `next` we gave it.
      await finish(err);
    }
  };
}

/**
 * Variant for routes that STREAM a file response (xlsx/pdf exports) rather
 * than returning JSON. Nothing is deferred here: the handler writes to `res`
 * itself. We still run on one transaction-scoped client with app.user_id /
 * app.role set, so RLS applies to every query the handler makes.
 *
 * Release ordering matters. The client may only go back to the pool once BOTH
 * (a) our COMMIT/ROLLBACK has finished and (b) the response has finished or
 * closed. Releasing earlier would let another request grab the connection
 * while we still have a statement to send on it. 'finish' and 'close' both
 * fire for a normal response, and pg throws if a client is released twice
 * (an uncaught throw inside an event handler would crash the process), so
 * release is guarded to run exactly once.
 *
 * As in withRls, the handler is expected to be asyncHandler-wrapped, so its
 * errors arrive through the `next` we pass in rather than as a rejection.
 */
function withRlsReadOnly(handler) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new Error('withRlsReadOnly used without requireAuth running first.'));
    }

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      // See withRls: an unhandled rejection here would crash the process.
      return next(err);
    }

    req.db = client;

    let txDone = false;
    let resDone = false;
    let released = false;
    const maybeRelease = () => {
      if (released || !txDone || !resDone) return;
      released = true;
      client.release();
    };
    res.on('finish', () => { resDone = true; maybeRelease(); });
    res.on('close', () => { resDone = true; maybeRelease(); });

    let handlerError = null;
    const handlerNext = (err) => { if (err && !handlerError) handlerError = err; };

    let failure = null;
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.role', $2, true)`,
        [String(req.user.id), req.user.role]
      );
      await handler(req, res, handlerNext);
      failure = handlerError;
    } catch (err) {
      failure = err;
    }

    try {
      await client.query(failure ? 'ROLLBACK' : 'COMMIT'); // read-only; closes the transaction cleanly
    } catch (txErr) {
      failure = failure || txErr;
      await client.query('ROLLBACK').catch(() => {});
    }
    txDone = true;
    maybeRelease();

    if (failure) {
      if (res.headersSent) {
        // Already streaming — the error handler can't change the response now.
        // eslint-disable-next-line no-console
        console.error('withRlsReadOnly failed after the response started:', failure);
      } else {
        next(failure);
      }
    }
  };
}

module.exports = { withRls, withRlsReadOnly };