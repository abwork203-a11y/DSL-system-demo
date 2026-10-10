-- ============================================================
-- OPTIONAL — only needed if `node src/db/checkRlsRole.js` reports that the
-- role in DATABASE_URL has rolsuper or rolbypassrls = true. In that case
-- every RLS policy is silently ignored for that connection.
--
-- Run AFTER 2026-10-zones-rls.sql, as the owner. Replace the password with a
-- generated secret and DO NOT commit the real value.
-- ============================================================
CREATE ROLE app_runtime WITH LOGIN PASSWORD 'CHANGE_ME_GENERATE_A_REAL_SECRET'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_runtime;

-- IMPORTANT: app_runtime is NOT the table owner, so it cannot run the
-- ALTER TABLE statements in schema.sql. docker-entrypoint.sh runs
-- `migrate.js` on every start, so point migrations at the owner instead:
-- set MIGRATION_DATABASE_URL (owner credentials) next to DATABASE_URL
-- (app_runtime credentials).
