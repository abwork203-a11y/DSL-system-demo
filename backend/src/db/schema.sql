-- Distribution Sales & Ledger Management System
-- PostgreSQL schema (v1)
-- Run via: npm run migrate

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid if ever needed

-- ─────────────────────────────────────────────────────────────
-- Users (Admin / Sales Rep)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'sales_rep')),
  assigned_zone   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Manufacturers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturers (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0, -- amount owed TO this manufacturer (manual entry, v1)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Products (linked to a manufacturer)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  manufacturer_id   INTEGER NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  size_packaging    TEXT,          -- e.g. "500ml x 24", "1kg bag"
  price             NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer_id);

-- ─────────────────────────────────────────────────────────────
-- Distributors ("Customers")
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distributors (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  zone            TEXT,
  region          TEXT,
  city            TEXT,
  area            TEXT,
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0, -- kept in sync by ledger service, never edit directly
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  date_added      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distributors_status ON distributors(status);
CREATE INDEX IF NOT EXISTS idx_distributors_zone ON distributors(zone);

-- ─────────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,
  distributor_id  INTEGER NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  freight_cost    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  total           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_term    TEXT NOT NULL CHECK (payment_term IN ('cash', 'credit')),
  payment_status  TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
  amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  order_status    TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'current', 'completed', 'cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_distributor ON orders(distributor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);

-- ─────────────────────────────────────────────────────────────
-- Order Items (line items — manufacturer resolved per line via product)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id                      SERIAL PRIMARY KEY,
  order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id              INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  manufacturer_id         INTEGER NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT, -- snapshot at order time
  quantity                NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  price_at_time_of_order  NUMERIC(12,2) NOT NULL CHECK (price_at_time_of_order >= 0),
  line_total              NUMERIC(14,2) GENERATED ALWAYS AS (quantity * price_at_time_of_order) STORED,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_manufacturer ON order_items(manufacturer_id);

-- ─────────────────────────────────────────────────────────────
-- Ledger (running balance per distributor)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger (
  id                SERIAL PRIMARY KEY,
  distributor_id    INTEGER NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  entry_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  type              TEXT NOT NULL CHECK (type IN ('Cash', 'credit')), -- debit = owes more (order), credit = payment received
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  running_balance   NUMERIC(14,2) NOT NULL,
  note              TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_distributor ON ledger(distributor_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON ledger(order_id);

-- ─────────────────────────────────────────────────────────────
-- Audit Log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,        -- CREATE / UPDATE / DELETE / PAYMENT / STATUS_CHANGE ...
  entity_type   TEXT NOT NULL,        -- 'order', 'distributor', 'product', 'manufacturer', 'user'
  entity_id     INTEGER,
  changes       JSONB,                -- { before: {...}, after: {...} }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

-- ─────────────────────────────────────────────────────────────
-- Backup Log
-- Records that a Google Drive backup happened — never the files
-- themselves. Backups upload directly from the browser to the user's own
-- Drive (see BackupPage.jsx / googleDrive.js); this server never sees the
-- files or a Google token. This table is purely a receipt, written by the
-- client after a backup finishes, so "Backup History" and the month-end
-- reminder have something to check against.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  folder_name     TEXT NOT NULL,
  folder_url      TEXT NOT NULL,
  period_start    DATE,             -- NULL when the backup covered all-time data, not one month
  period_end      DATE,
  file_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);

-- ─────────────────────────────────────────────────────────────
-- Order Drafts
-- Server-persisted in-progress orders — replaces the earlier localStorage-
-- only version so a draft follows the user across devices/browsers instead
-- of being tied to one machine.
--
-- id is CLIENT-generated (a UUID, assigned the moment there's something
-- worth saving — see frontend/src/utils/orderDrafts.js), not server-
-- assigned. This is deliberate: the tab-close autosave path uses
-- navigator.sendBeacon(), which is fire-and-forget with no response the
-- client can read — it has to already know the id it's saving under
-- *before* sending, so a server-assigned id would be unreachable from that
-- code path. Ownership is still enforced in every query via user_id, so a
-- guessed/colliding id can't let one user touch another's draft.
--
-- `data` holds everything the wizard needs to resume (step, items,
-- discount, freight, payment fields, notes, etc.) as one flexible JSONB
-- blob rather than a column per field — this mirrors the same "receipt/blob,
-- not a rigid schema" choice made for `backups`, and means adding a new
-- field to the order wizard later doesn't require a migration here.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_drafts (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distributor_id  INTEGER REFERENCES distributors(id) ON DELETE SET NULL,
  data            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_drafts_user ON order_drafts(user_id);

-- ─────────────────────────────────────────────────────────────
-- updated_at auto-touch trigger (generic, applied per table)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','manufacturers','products','distributors','orders','order_drafts']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t, t, t
    );
  END LOOP;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Security hardening additions (added post-v1 — idempotent, so
-- re-running this file against an existing database is safe and
-- just adds what's missing rather than erroring or duplicating).
-- ─────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Session/token & MFA hardening (this pass) — also idempotent.
-- ─────────────────────────────────────────────────────────────
BEGIN;

-- Bumped on password change or an explicit "log out everywhere" action.
-- Embedded in every JWT at login time; requireAuth rejects any token whose
-- embedded version doesn't match the current DB value — the mechanism that
-- makes "invalidate all other sessions" possible without a server-side
-- session store (see backend/src/middleware/auth.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- How many times this account has *entered* a lockout state, consecutively.
-- Drives exponential backoff on repeated lockouts (15min, 30min, 60min, ...)
-- rather than a flat duration every time — see authController.js.
ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;

-- TOTP secret (base32), never sent back to the client after initial setup.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
-- Bcrypt-hashed one-time backup codes (never stored in plain text, same as
-- passwords) — each array element is consumed (removed) on use.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[] NOT NULL DEFAULT '{}';

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Performance indexes (this pass) — covers query patterns that were
-- previously unindexed: sorting/filtering the full (unfiltered-by-distributor)
-- ledger view, and the sales-rep performance report's join on orders.created_by.
-- ─────────────────────────────────────────────────────────────
BEGIN;

CREATE INDEX IF NOT EXISTS idx_ledger_entry_date ON ledger(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);

COMMIT;

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS retail_price_at_time_of_order NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'fixed'
CHECK (discount_type IN ('fixed', 'percentage'));

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security: order_drafts, backups (this pass)
--
-- Both tables were already scoped by user_id / role at the app layer
-- (see order_drafts comment above, and Layout.jsx's adminOnly route for
-- /backup). This makes that the DB's own last line of defense too, so a
-- bug or a future route that forgets a WHERE clause can't leak another
-- user's draft or expose backup history to a non-admin.
--
-- FORCE ROW LEVEL SECURITY matters here: without it, the table's OWNER
-- (whichever role ran this migration) bypasses RLS entirely, which would
-- make these policies a no-op if the backend ever connects using that
-- same owner role. It does NOT protect against a superuser connection —
-- Postgres superusers always bypass RLS, FORCE or not. If DATABASE_URL
-- points at Supabase's default `postgres` role (a superuser), these
-- policies will not apply and this section does nothing. See the note
-- in the chat reply for how to check/fix that.
--
-- Every query against these two tables must now run through
-- backend/src/middleware/rls.js's withRls(), which sets app.user_id /
-- app.role per-transaction — a plain pool.query() will have neither
-- session var set, and with FORCE RLS + a default-deny policy, that
-- means it will just return zero rows / fail the WITH CHECK, not
-- silently ignore RLS.
-- ─────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_drafts_owner ON order_drafts;
CREATE POLICY order_drafts_owner ON order_drafts
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::integer)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::integer);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backups_admin_only ON backups;
CREATE POLICY backups_admin_only ON backups
  USING (current_setting('app.role', true) = 'admin')
  WITH CHECK (current_setting('app.role', true) = 'admin');

COMMIT;


-- ─────────────────────────────────────────────────────────────
-- Zone-scoped access: zones, user_zones, distributors.zone_id,
-- and RLS on distributors / orders / order_items / ledger.
--
-- Sales reps see only distributors in their assigned zone(s) — and
-- everything that flows from a distributor (its orders, those orders'
-- line items, its ledger entries) — while admins see everything,
-- unscoped. Fails closed on both ends: a distributor with no zone_id,
-- or a rep with no rows in user_zones, is invisible to every rep,
-- not just under-visible. Only `role = 'admin'` bypasses this.
--
-- Zone list confirmed from live data before writing this: exactly two
-- zones in use ("North": 7 distributors, "Central": 2), both spelled
-- consistently, 0 unzoned distributors. So this backfill is exact, not
-- a best-effort guess at messy data.
-- ─────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS zones (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: a rep can cover zero, one, or several zones.
CREATE TABLE IF NOT EXISTS user_zones (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id    INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, zone_id)
);
CREATE INDEX IF NOT EXISTS idx_user_zones_zone ON user_zones(zone_id);

-- Nullable on purpose — NULL is a real, admin-only-visible state (see
-- policy below), not an error state to be prevented at the DB level.
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id);
CREATE INDEX IF NOT EXISTS idx_distributors_zone_id ON distributors(zone_id);

INSERT INTO zones (name) VALUES ('North'), ('Central')
  ON CONFLICT (name) DO NOTHING;

UPDATE distributors d
SET zone_id = z.id
FROM zones z
WHERE d.zone = z.name
  AND d.zone_id IS NULL;

-- distributors.zone (free text) stays for now — nothing reads zone_id
-- yet. Drop it in a later migration once distributorController.js and
-- the frontend form are fully off it (tracked separately, not here).

ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS distributors_zone_scope ON distributors;
CREATE POLICY distributors_zone_scope ON distributors
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM user_zones uz
      WHERE uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
        AND uz.zone_id = distributors.zone_id
    )
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1 FROM user_zones uz
      WHERE uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
        AND uz.zone_id = distributors.zone_id
    )
  );

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_zone_scope ON orders;
CREATE POLICY orders_zone_scope ON orders
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = orders.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = orders.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  );

-- Defense-in-depth: order_items has no zone of its own, only order_id.
-- Any read that always joins through `orders` is already covered
-- transitively by the policy above — this just means a route that
-- somehow queries order_items directly, bypassing that join, still
-- can't see line items on an order it has no zone access to.
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_zone_scope ON order_items;
CREATE POLICY order_items_zone_scope ON order_items
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM orders o
      JOIN distributors d ON d.id = o.distributor_id
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE o.id = order_items.order_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM orders o
      JOIN distributors d ON d.id = o.distributor_id
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE o.id = order_items.order_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  );

ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_zone_scope ON ledger;
CREATE POLICY ledger_zone_scope ON ledger
  USING (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = ledger.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM distributors d
      JOIN user_zones uz ON uz.zone_id = d.zone_id
      WHERE d.id = ledger.distributor_id
        AND uz.user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Backfill user_zones from the old users.assigned_zone column.
--
-- Turns out not dead: one existing rep (id 7, "Sales") already had
-- assigned_zone = 'North'. Carrying that into the new many-to-many
-- table so this migration doesn't silently drop a real assignment.
-- assigned_zone itself stays in place for now, same as
-- distributors.zone — dropping it is a later, separate cleanup once
-- nothing reads it anymore.
-- ─────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO user_zones (user_id, zone_id)
SELECT u.id, z.id
FROM users u
JOIN zones z ON z.name = u.assigned_zone
WHERE u.assigned_zone IS NOT NULL
  AND TRIM(u.assigned_zone) <> ''
ON CONFLICT (user_id, zone_id) DO NOTHING;

COMMIT;
