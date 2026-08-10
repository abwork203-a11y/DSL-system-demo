const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { isPasswordBreached } = require('../utils/passwordBreachCheck');

const list = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, email, role, assigned_zone, is_active, mfa_enabled, created_at
     FROM users ORDER BY name`
  );
  res.json(result.rows);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role, assigned_zone } = req.body;
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
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, assigned_zone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, assigned_zone, is_active, mfa_enabled, created_at`,
    [name, email, hash, role, assigned_zone || null]
  );

  await recordAudit(pool, { userId: req.user.id, action: 'CREATE', entityType: 'user', entityId: result.rows[0].id, after: result.rows[0] });
  res.status(201).json(result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, assigned_zone, is_active, password } = req.body;
  if (role && !['admin', 'sales_rep'].includes(role)) {
    throw new ApiError(400, 'role must be "admin" or "sales_rep".');
  }

  const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'User not found.');

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

  const result = await pool.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       role = COALESCE($2, role),
       assigned_zone = COALESCE($3, assigned_zone),
       is_active = COALESCE($4, is_active),
       password_hash = COALESCE($5, password_hash),
       token_version = token_version + $6
     WHERE id = $7
     RETURNING id, name, email, role, assigned_zone, is_active, mfa_enabled, created_at`,
    [name || null, role || null, assigned_zone || null, is_active ?? null, passwordHash, bumpTokenVersion ? 1 : 0, id]
  );

  await recordAudit(pool, { userId: req.user.id, action: 'UPDATE', entityType: 'user', entityId: id, before: existing.rows[0], after: result.rows[0] });
  res.json(result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }
  const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'User not found.');

  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  await recordAudit(pool, { userId: req.user.id, action: 'DELETE', entityType: 'user', entityId: id, before: existing.rows[0] });
  res.status(204).send();
});

module.exports = { list, create, update, remove };
