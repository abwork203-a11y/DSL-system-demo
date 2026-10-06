const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE name ILIKE $${params.length}`;
  }
  const result = await pool.query(
    `SELECT * FROM manufacturers ${where} ORDER BY name`,
    params
  );
  res.json(result.rows);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM manufacturers WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Manufacturer not found.');
  res.json(result.rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { name, contact_name, contact_phone, contact_email, balance } = req.body;
  if (!name) throw new ApiError(400, 'name is required.');

  const result = await pool.query(
    `INSERT INTO manufacturers (name, contact_name, contact_phone, contact_email, balance)
     VALUES ($1, $2, $3, $4, COALESCE($5, 0))
     RETURNING *`,
    [name, contact_name || null, contact_phone || null, contact_email || null, balance]
  );
  await recordAudit(pool, { userId: req.user.id, action: 'CREATE', entityType: 'manufacturer', entityId: result.rows[0].id, after: result.rows[0] });
  res.status(201).json(result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, contact_name, contact_phone, contact_email, balance, is_active } = req.body;

  const existing = await pool.query('SELECT * FROM manufacturers WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Manufacturer not found.');

  const result = await pool.query(
    `UPDATE manufacturers SET
       name = COALESCE($1, name),
       contact_name = COALESCE($2, contact_name),
       contact_phone = COALESCE($3, contact_phone),
       contact_email = COALESCE($4, contact_email),
       balance = COALESCE($5, balance),
       is_active = COALESCE($6, is_active)
     WHERE id = $7
     RETURNING *`,
    [name || null, contact_name || null, contact_phone || null, contact_email || null, balance ?? null, is_active ?? null, id]
  );
  await recordAudit(pool, { userId: req.user.id, action: 'UPDATE', entityType: 'manufacturer', entityId: id, before: existing.rows[0], after: result.rows[0] });
  res.json(result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await pool.query('SELECT * FROM manufacturers WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Manufacturer not found.');

  await pool.query('DELETE FROM manufacturers WHERE id = $1', [id]);
  await recordAudit(pool, { userId: req.user.id, action: 'DELETE', entityType: 'manufacturer', entityId: id, before: existing.rows[0] });
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
