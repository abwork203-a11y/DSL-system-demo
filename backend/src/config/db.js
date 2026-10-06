const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Unexpected errors on idle clients shouldn't crash the whole process silently.
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = { pool };
