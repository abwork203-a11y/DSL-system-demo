require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// schema.sql runs ALTER TABLE ... which only the table OWNER may do. If the
// app itself connects as a restricted, non-owner role (needed so RLS
// applies — see migrations/2026-10-zones-rls-app-role.sql), run migrations
// with separate owner credentials via MIGRATION_DATABASE_URL. Falls back to
// DATABASE_URL, so nothing changes for setups that don't set it.
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('Applying schema.sql ...');
    await client.query(sql);
    console.log('✔ Migration complete.');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
