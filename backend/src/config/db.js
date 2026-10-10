const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000, // fail fast if the pool can't hand out a client
  query_timeout: 15_000,           // fail fast on a hung query rather than hanging the request forever
  options: '-c statement_timeout=15000', // belt-and-suspenders: enforce server-side too
});

pool.on('error', (err) => {
  // Unexpected errors on idle clients shouldn't crash the whole process silently.
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = { pool };
