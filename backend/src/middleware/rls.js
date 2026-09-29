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

    const client = await pool.connect();
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

module.exports = { withRls };
