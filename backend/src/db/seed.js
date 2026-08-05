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

    await client.query(
      `INSERT INTO distributors (name, contact_name, zone, city, status)
       VALUES ('Sample Distributor Co.', 'Jane Doe', 'North', 'Springfield', 'active')
       ON CONFLICT DO NOTHING`
    );

    console.log('✔ Seed complete.');
  } catch (err) {
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
