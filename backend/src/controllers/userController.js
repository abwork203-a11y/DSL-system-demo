const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { isPasswordBreached } = require('../utils/passwordBreachCheck');

// Replaces all of a user's zone assignments with exactly the given set.
// Delete-then-reinsert is simplest and correct here because zone counts per
// user are small (a handful at most) — no need for a diff/merge.
async function setUserZones(db, userId, zoneIds) {
  await db.query('DELETE FROM user_zones WHERE user_id = $1', [userId]);
  if (zoneIds.length > 0) {
    const values = zoneIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    await db.query(
      `INSERT INTO user_zones (user_id, zone_id) VALUES ${values}`,
      [userId, ...zoneIds]
    );
  }
}

// Distinguishes "zone_ids not present in the request body at all" (meaning:
// don't touch this user's zones) from "zone_ids: []" (meaning: explicitly
// clear all zones) from a real array of ids to set. Duplicates are dropped
// so a repeated id can't trip user_zones' uniqueness.
function parseZoneIds(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'zone_ids')) return undefined;
  if (!Array.isArray(body.zone_ids)) return [];
  return [...new Set(body.zone_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

// Same shape list() returns per user, so create/update responses match it.
async function fetchUserZones(db, userId) {
  const result = await db.query(
    `SELECT z.id, z.name FROM user_zones uz JOIN zones z ON z.id = uz.zone_id
     WHERE uz.user_id = $1 ORDER BY z.name`,
    [userId]
  );
  return result.rows;
}

const list = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT u.id, u.name, u.email, u.role, u.assigned_zone, u.is_active, u.mfa_enabled, u.created_at,
       COALESCE(
         (SELECT json_agg(json_build_object('id', z.id, 'name', z.name) ORDER BY z.name)
          FROM user_zones uz JOIN zones z ON z.id = uz.zone_id
          WHERE uz.user_id = u.id),
         '[]'
       ) AS zones
     FROM users u ORDER BY u.name`
  );
  req.respond(200, result.rows);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    throw new ApiError(400, 'name, email, password, and role are required.');
  }
  if (!['admin', 'sales_rep'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "sales_rep".');
  }

  const { breached, checked } = await isPasswordBreached(password);
  if (checked && breached) {
    throw new ApiError(400, 'This password has appeared in known data breaches. Please choose a different one.');
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await req.db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, assigned_zone, is_active, mfa_enabled, created_at`,
    [name, email, hash, role]
  );

  // undefined (field omitted) on create just means "no zones assigned".
  const zoneIds = parseZoneIds(req.body);
  if (zoneIds !== undefined) {
    await setUserZones(req.db, result.rows[0].id, zoneIds);
  }
  result.rows[0].zones = await fetchUserZones(req.db, result.rows[0].id);

  await recordAudit(req.db, { userId: req.user.id, action: 'CREATE', entityType: 'user', entityId: result.rows[0].id, after: result.rows[0] });
  req.respond(201, result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, is_active, password } = req.body;
  if (role && !['admin', 'sales_rep'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "sales_rep".');
  }

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
     RETURNING id, name, email, role, assigned_zone, is_active, mfa_enabled, created_at`,
    [name || null, role || null, is_active ?? null, passwordHash, bumpTokenVersion ? 1 : 0, id]
  );

  // undefined (field omitted) leaves existing zones untouched; [] clears them.
  const zoneIds = parseZoneIds(req.body);
  if (zoneIds !== undefined) {
    await setUserZones(req.db, id, zoneIds);
  }
  result.rows[0].zones = await fetchUserZones(req.db, id);

  await recordAudit(req.db, { userId: req.user.id, action: 'UPDATE', entityType: 'user', entityId: id, before: existing.rows[0], after: result.rows[0] });
  req.respond(200, result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }
  const existing = await req.db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'User not found.');

  await req.db.query('DELETE FROM users WHERE id = $1', [id]);
  await recordAudit(req.db, { userId: req.user.id, action: 'DELETE', entityType: 'user', entityId: id, before: existing.rows[0] });
  req.respondEnd(204);
});

module.exports = { list, create, update, remove };
