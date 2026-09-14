const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const list = asyncHandler(async (req, res) => {
  const { search, manufacturer_id, is_active } = req.query;
  const { page, pageSize, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`p.name ILIKE $${params.length}`);
  }
  if (manufacturer_id) {
    params.push(manufacturer_id);
    clauses.push(`p.manufacturer_id = $${params.length}`);
  }
  if (is_active !== undefined) {
    params.push(is_active === 'true');
    clauses.push(`p.is_active = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM products p ${where}`,
    params
  );
  const total = Number(countResult.rows[0].count);

  const result = await pool.query(
    `SELECT p.*, m.name AS manufacturer_name
     FROM products p
     JOIN manufacturers m ON m.id = p.manufacturer_id
     ${where}
     ORDER BY p.name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  res.json(paginatedResponse(result.rows, total, page, pageSize));
});

const getOne = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, m.name AS manufacturer_name FROM products p
     JOIN manufacturers m ON m.id = p.manufacturer_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Product not found.');
  res.json(result.rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const {
  manufacturer_id,
  name,
  size_packaging,
  price,
  retail_price = 0
} = req.body;
  if (!manufacturer_id || !name || price === undefined) {
    throw new ApiError(400, 'manufacturer_id, name, and price are required.');
  }
 const result = await pool.query(
  `INSERT INTO products (
     manufacturer_id,
     name,
     size_packaging,
     price,
     retail_price
   )
   VALUES ($1, $2, $3, $4, $5)
   RETURNING *`,
  [
    manufacturer_id,
    name,
    size_packaging || null,
    price,
    retail_price
  ]
);
  await recordAudit(pool, { userId: req.user.id, action: 'CREATE', entityType: 'product', entityId: result.rows[0].id, after: result.rows[0] });
  res.status(201).json(result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
  manufacturer_id,
  name,
  size_packaging,
  price,
  retail_price,
  is_active
} = req.body;

  const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Product not found.');

 const result = await pool.query(
  `UPDATE products SET
     manufacturer_id = COALESCE($1, manufacturer_id),
     name = COALESCE($2, name),
     size_packaging = COALESCE($3, size_packaging),
     price = COALESCE($4, price),
     retail_price = COALESCE($5, retail_price),
     is_active = COALESCE($6, is_active)
   WHERE id = $7
   RETURNING *`,
  [
    manufacturer_id || null,
    name || null,
    size_packaging || null,
    price ?? null,
    retail_price ?? null,
    is_active ?? null,
    id
  ]
);
  await recordAudit(pool, { userId: req.user.id, action: 'UPDATE', entityType: 'product', entityId: id, before: existing.rows[0], after: result.rows[0] });
  res.json(result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Product not found.');

  await pool.query('DELETE FROM products WHERE id = $1', [id]);
  await recordAudit(pool, { userId: req.user.id, action: 'DELETE', entityType: 'product', entityId: id, before: existing.rows[0] });
  res.status(204).send();
});

module.exports = { list, getOne, create, update, remove };
