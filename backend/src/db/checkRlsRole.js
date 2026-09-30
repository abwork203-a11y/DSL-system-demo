require('dotenv').config();
const { pool } = require('../config/db');

// RLS is bypassed by two independent things, and FORCE ROW LEVEL SECURITY
// (already set on order_drafts/backups) only ever protects against the
// second one:
//   - rolsuper: true  → superuser. Always bypasses RLS. FORCE cannot change this.
//   - rolbypassrls: true → a role explicitly granted BYPASSRLS. Also always
//     bypasses RLS, superuser or not. Supabase sometimes grants this to
//     admin-ish roles even when they aren't flagged rolsuper.
async function check() {
  const { rows } = await pool.query(
    `SELECT current_user, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = current_user`
  );
  const info = rows[0];

  console.log('Connected as:', info.current_user);
  console.log('rolsuper:    ', info.rolsuper);
  console.log('rolbypassrls:', info.rolbypassrls);

  if (info.rolsuper || info.rolbypassrls) {
    console.log('\n✗ This role bypasses RLS. The order_drafts/backups policies');
    console.log('  will NOT be enforced against it, regardless of FORCE ROW');
    console.log('  LEVEL SECURITY. You need a role without either flag — see');
    console.log('  the reply for the CREATE ROLE script.');
  } else {
    console.log('\n✔ This role is subject to RLS. The policies will apply.');
  }

  await pool.end();
}

check().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
