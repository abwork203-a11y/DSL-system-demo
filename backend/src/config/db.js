const { Pool } = require('pg');

// Without explicit timeouts, pg's defaults mean none of this ever times
// out — a network stall (Supabase connectivity blip, packet loss, etc.)
// leaves a query waiting forever: no error, no timeout, just a
// permanently stuck request. That's always been true, but it's much more
// visible now that middleware/rls.js holds one connection open for an
// entire request's transaction — a single hung query keeps that
// connection checked out indefinitely (it's only released once the query
// settles, which without a timeout it never does), and a handful of those
// in a row exhausts the whole pool, so even unrelated, healthy requests
// start hanging too, waiting for a connection slot that will never free up.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // How long to wait when acquiring a connection — a new TCP connection,
  // or a free one from the pool — before giving up with a clean error
  // instead of hanging indefinitely.
  connectionTimeoutMillis: 10_000,

  // Client-side safety net: cancel any single query running longer than
  // this and throw, rather than wait forever for a response that may
  // never come.
  query_timeout: 15_000,

  // Belt-and-suspenders server-side enforcement of the same idea — tells
  // Postgres itself to cancel a statement past this long, independent of
  // whether the client-side timeout above ever actually fires (e.g. if
  // the stall is severe enough that even the cancel signal has trouble
  // getting through).
  options: '-c statement_timeout=15000',
});

pool.on('error', (err) => {
  // Unexpected errors on idle clients shouldn't crash the whole process silently.
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = { pool };