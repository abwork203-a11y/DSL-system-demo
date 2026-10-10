require('dotenv').config();
const { pool } = require('../config/db');

// Every application table, in no particular order — TRUNCATE ... CASCADE
// handles foreign-key dependencies regardless of the order they're listed in,
// since it's evaluated as a single statement across all of them at once.
const TABLES = ['audit_log', 'ledger', 'order_items', 'orders', 'products', 'distributors', 'manufacturers', 'users', 'zones', 'user_zones', 'order_drafts', 'backups'];

function maskConnectionString(url) {
  if (!url) return '(DATABASE_URL not set)';
  try {
    const u = new URL(url);
    const maskedPassword = u.password ? '****' : '';
    return `${u.protocol}//${u.username}${maskedPassword ? ':' + maskedPassword : ''}@${u.host}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function reset() {
  if (!process.argv.includes('--yes')) {
    console.log('This PERMANENTLY DELETES every row in every table — all users, orders,');
    console.log('distributors, products, and the entire ledger history. This cannot be undone.');
    console.log('');
    console.log(`Target database: ${maskConnectionString(process.env.DATABASE_URL)}`);
    console.log('');
    console.log('Re-run with --yes to actually do this:');
    console.log('  npm run reset -- --yes');
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    console.log('Truncating all tables...');
    // RESTART IDENTITY also resets every SERIAL/id sequence back to 1, so a
    // fresh seed afterward gets clean, predictable IDs instead of continuing
    // from wherever the deleted data left off.
    await client.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('✔ All tables truncated and ID sequences reset.');
    console.log('');
    console.log('Now run: npm run seed');
    console.log('(to recreate the admin login and baseline sample data)');
  } catch (err) {
    console.error('✗ Reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

reset();
