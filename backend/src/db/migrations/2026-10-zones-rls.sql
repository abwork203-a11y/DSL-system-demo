-- ============================================================
-- Zones + Row-Level Security — ONE-TIME migration.
-- Run in the Supabase SQL Editor as the table OWNER (not as the
-- restricted app role), BEFORE creating the app role (see
-- 2026-10-zones-rls-app-role.sql).
-- Safe to re-run: every statement is idempotent, EXCEPT that Part A's
-- backfill re-reads the legacy users.assigned_zone column — so do not
-- re-run Part A after admins have started editing zone assignments
-- (it would restore assignments they cleared). schema.sql therefore
-- contains Part A's structure and Part B only, never the backfill.
-- ============================================================

-- ============================================================
-- Part A: New tables + backfill
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS zones (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_zones (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, zone_id)
);
CREATE INDEX IF NOT EXISTS idx_user_zones_zone ON user_zones(zone_id);

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id);
CREATE INDEX IF NOT EXISTS idx_distributors_zone_id ON distributors(zone_id);

-- Backfill: create a zone row for every distinct non-null legacy zone value
-- seen on either distributors.zone or users.assigned_zone, then point the
-- new FK columns at the matching zone row.
INSERT INTO zones (name)
SELECT DISTINCT zone FROM distributors WHERE zone IS NOT NULL AND zone <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO zones (name)
SELECT DISTINCT assigned_zone FROM users WHERE assigned_zone IS NOT NULL AND assigned_zone <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE distributors d
SET zone_id = z.id
FROM zones z
WHERE d.zone = z.name AND d.zone_id IS NULL;

INSERT INTO user_zones (user_id, zone_id)
SELECT u.id, z.id
FROM users u
JOIN zones z ON z.name = u.assigned_zone
WHERE u.assigned_zone IS NOT NULL AND u.assigned_zone <> ''
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- Part B: Row-Level Security
-- ============================================================
BEGIN;

-- distributors: admin sees all; rep sees only distributors in one of their zones
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY distributors_zone_scoped ON distributors
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM user_zones uz
      WHERE uz.user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
        AND uz.zone_id = distributors.zone_id
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- orders: scoped via the order's distributor's zone
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY orders_zone_scoped ON orders
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = orders.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- order_items: scoped via its parent order's distributor's zone
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY order_items_zone_scoped ON order_items
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM orders o
      JOIN distributors d ON d.id = o.distributor_id
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE o.id = order_items.order_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ledger: scoped via the entry's distributor's zone
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY ledger_zone_scoped ON ledger
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = ledger.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- order_drafts: ownership (admin unscoped, per global constraint 1) — re-adding what was lost in rollback
ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_drafts FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY order_drafts_owner ON order_drafts
  USING (
    current_setting('app.role', true) = 'admin'
    OR user_id = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- backups: admin-only — re-adding what was lost in rollback
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups FORCE ROW LEVEL SECURITY;

-- Guarded so re-running this file (or schema.sql) doesn't fail on an existing policy.
DO $$ BEGIN
  CREATE POLICY backups_admin_only ON backups
  USING (current_setting('app.role', true) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
