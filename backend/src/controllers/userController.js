const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { isPasswordBreached } = require('../utils/passwordBreachCheck');

// Attaches each user's zones as [{id, name}, ...], sorted by name.
// assigned_zone is deliberately no longer selected here — it's
// frozen/deprecated in favor of user_zones (see schema.sql); still
// present in the DB for now, but nothing in this controller reads or
// writes it going forward.
const list = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.mfa_enabled, u.created_at,
            COALESCE(
              (SELECT json_agg(json_build_object('id', z.id, 'name', z.name) ORDER BY z.name)
               FROM user_zones uz
               JOIN zones z ON z.id = uz.zone_id
               WHERE uz.user_id = u.id),
              '[]'
            ) AS zones
     FROM users u
     ORDER BY u.name`
  );
  req.respond(200, result.rows);
});

// Shared by create/update: replaces a user's zone_ids wholesale (delete
// then insert) rather than diffing — simplest correct option at the scale
// of "a handful of zones per rep," and atomic either way since it always
// runs inside withRls's transaction.
async function setUserZones(db, userId, zoneIds) {
  await db.query('DELETE FROM user_zones WHERE user_id = $1', [userId]);
  if (zoneIds.length === 0) return;

  const values = zoneIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await db.query(
    `INSERT INTO user_zones (user_id, zone_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [userId, ...zoneIds]
  );
}

// Normalizes the incoming zone_ids field: undefined means "not provided,
// leave alone" (distinct from [] meaning "explicitly clear all zones") —
// same optional-field convention the rest of this controller already uses
// for name/role/etc via COALESCE, just not expressible through COALESCE
// itself since this is a whole related-table replace, not a column update.
function parseZoneIds(body) {
  if (body.zone_ids === undefined) return undefined;
  if (!Array.isArray(body.zone_ids)) throw new ApiError(400, 'zone_ids must be an array.');
  return body.zone_ids.map(Number);
}

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    throw new ApiError(400, 'name, email, password, and role are required.');
  }
  if (!['admin', 'sales_rep'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "sales_rep".');
  }
  const zoneIds = parseZoneIds(req.body) || [];

  const { breached, checked } = await isPasswordBreached(password);
  if (checked && breached) {
    throw new ApiError(400, 'This password has appeared in known data breaches. Please choose a different one.');
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await req.db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, is_active, mfa_enabled, created_at`,
    [name, email, hash, role]
  );
  const user = result.rows[0];

  await setUserZones(req.db, user.id, zoneIds);

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'CREATE',
    entityType: 'user',
    entityId: user.id,
    after: { ...user, zone_ids: zoneIds },
  });

  req.respond(201, { ...user, zone_ids: zoneIds });
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, is_active, password } = req.body;
  if (role && !['admin', 'sales_rep'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "sales_rep".');
  }
  const zoneIds = parseZoneIds(req.body); // undefined if not provided — left alone below

  const existing = await req.db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'User not found.');
  const targetUser = existing.rows[0];

  const isSelf = Number(id) === req.user.id;
  const losingAdminAccess = targetUser.role === 'admin' && (
    (role && role !== 'admin') || is_active === false
  );

  // Self-demotion/self-deactivation is blocked outright, regardless of how
  // many other admins exist — requireAuth re-checks role from the DB on
  // every request (see middleware/auth.js), so this would take effect on
  // this admin's own very next request, an easy way to accidentally lock
  // yourself out mid-session with no warning.
  if (isSelf && losingAdminAccess) {
    throw new ApiError(400, 'You cannot remove your own admin access. Have another admin make this change.');
  }

  // Separately, demoting or deactivating any OTHER admin is blocked if they're
  // the last one standing — otherwise the app can end up with zero active
  // admins and no way to create or restore one short of a direct DB edit.
  if (losingAdminAccess) {
    const otherActiveAdmins = await req.db.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true AND id != $1`,
      [id]
    );
    if (otherActiveAdmins.rows[0].count === 0) {
      throw new ApiError(400, 'Cannot remove admin access from the last remaining active admin.');
    }
  }

  let passwordHash = null;
  if (password) {
    const { breached, checked } = await isPasswordBreached(password);
    if (checked && breached) {
      throw new ApiError(400, 'This password has appeared in known data breaches. Please choose a different one.');
    }
    passwordHash = await bcrypt.hash(password, 10);
  }

  // An admin resetting someone's password should invalidate that person's
  // existing sessions too — same reasoning as self-service password change
  // (accountController.js), just triggered by an admin instead of the user.
  const bumpTokenVersion = !!password;

  const result = await req.db.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       role = COALESCE($2, role),
       is_active = COALESCE($3, is_active),
       password_hash = COALESCE($4, password_hash),
       token_version = token_version + $5
     WHERE id = $6
     RETURNING id, name, email, role, is_active, mfa_enabled, created_at`,
    [name || null, role || null, is_active ?? null, passwordHash, bumpTokenVersion ? 1 : 0, id]
  );

  if (zoneIds !== undefined) {
    await setUserZones(req.db, id, zoneIds);
  }

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: id,
    before: existing.rows[0],
    after: { ...result.rows[0], zone_ids: zoneIds },
  });

  req.respond(200, result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }
  const existing = await req.db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'User not found.');

  // user_zones rows are cleaned up automatically — ON DELETE CASCADE on
  // user_zones.user_id (see schema.sql), no extra query needed here.
  await req.db.query('DELETE FROM users WHERE id = $1', [id]);
  await recordAudit(req.db, { userId: req.user.id, action: 'DELETE', entityType: 'user', entityId: id, before: existing.rows[0] });
  req.respondEnd(204);
});

module.exports = { list, create, update, remove };
