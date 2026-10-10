require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    const name = process.env.SEED_ADMIN_NAME || 'Admin';
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`Admin user ${email} already exists — skipping user creation.`);
    } else {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, 'admin', true)`,
        [name, email, hash]
      );
      console.log(`✔ Created admin user: ${email} / ${password} (change this password after first login)`);
    }

    // Sample manufacturer + product + distributor so the app isn't empty on first run.
    const mfg = await client.query(
      `INSERT INTO manufacturers (name, contact_name)
       VALUES ('Sample Manufacturer Ltd.', 'Sample Contact')
       ON CONFLICT (name) DO NOTHING
       RETURNING id`
    );
    const mfgId = mfg.rows[0]?.id;

    if (mfgId) {
      await client.query(
        `INSERT INTO products (manufacturer_id, name, size_packaging, price)
         VALUES ($1, 'Sample Product 500ml', '500ml x 24', 12.50)`,
        [mfgId]
      );
    }

    // distributors is under FORCE ROW LEVEL SECURITY: with no app.role set,
    // the insert is rejected for any role subject to RLS. Seed as admin, in
    // one transaction so the setting is local to it.
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.role', 'admin', true), set_config('app.user_id', '', true)`);
    const zone = await client.query(
      `INSERT INTO zones (name) VALUES ('North')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    await client.query(
      `INSERT INTO distributors (name, contact_name, zone_id, city, status)
       VALUES ('Sample Distributor Co.', 'Jane Doe', $1, 'Springfield', 'active')
       ON CONFLICT DO NOTHING`,
      [zone.rows[0].id]
    );
    await client.query('COMMIT');

    console.log('✔ Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
