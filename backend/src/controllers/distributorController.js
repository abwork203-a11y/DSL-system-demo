const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const list = asyncHandler(async (req, res) => {
  const { search, status, zone_id } = req.query;
  const { page, pageSize, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`name ILIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (zone_id) {
    params.push(zone_id);
    clauses.push(`zone_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const countResult = await req.db.query(`SELECT COUNT(*) FROM distributors ${where}`, params);
  const total = Number(countResult.rows[0].count);

  const result = await req.db.query(
    `SELECT * FROM distributors ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  req.respond(200, paginatedResponse(result.rows, total, page, pageSize));
});

const getOne = asyncHandler(async (req, res) => {
  const result = await req.db.query('SELECT * FROM distributors WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Distributor not found.');
  req.respond(200, result.rows[0]);
});

const create = asyncHandler(async (req, res) => {
  const { name, contact_name, contact_phone, contact_email, zone_id, region, city, area, address } = req.body; 
  if (!name) throw new ApiError(400, 'name is required.');

 const result = await req.db.query(
  `INSERT INTO distributors (
     name, contact_name, contact_phone, contact_email,
     zone_id, region, city, area, address
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
   RETURNING *`,
  [
    name,
    contact_name || null,
    contact_phone || null,
    contact_email || null,
    zone_id || null,
    region || null,
    city || null,
    area || null,
    address || null
  ]
);
  await recordAudit(req.db, { userId: req.user.id, action: 'CREATE', entityType: 'distributor', entityId: result.rows[0].id, after: result.rows[0] });
  req.respond(201, result.rows[0]);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
  name,
  contact_name,
  contact_phone,
  contact_email,
  zone_id,
  region,
  city,
  area,
  address,
  status
} = req.body;
  if (status && !['active', 'inactive'].includes(status)) {
    throw new ApiError(400, 'status must be "active" or "inactive".');
  }

  const existing = await req.db.query('SELECT * FROM distributors WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Distributor not found.');

  const result = await req.db.query(
  `UPDATE distributors SET
     name = COALESCE($1, name),
     contact_name = COALESCE($2, contact_name),
     contact_phone = COALESCE($3, contact_phone),
     contact_email = COALESCE($4, contact_email),
     zone_id = COALESCE($5, zone_id),
     region = COALESCE($6, region),
     city = COALESCE($7, city),
     area = COALESCE($8, area),
     address = COALESCE($9, address),
     status = COALESCE($10, status)
   WHERE id = $11
   RETURNING *`,
  [
    name || null,
    contact_name || null,
    contact_phone || null,
    contact_email || null,
    zone_id || null,
    region || null,
    city || null,
    area || null,
    address || null,
    status || null,
    id
  ]
);
  await recordAudit(req.db, { userId: req.user.id, action: 'UPDATE', entityType: 'distributor', entityId: id, before: existing.rows[0], after: result.rows[0] });
  req.respond(200, result.rows[0]);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await req.db.query('SELECT * FROM distributors WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Distributor not found.');

  await req.db.query('DELETE FROM distributors WHERE id = $1', [id]);
  await recordAudit(req.db, { userId: req.user.id, action: 'DELETE', entityType: 'distributor', entityId: id, before: existing.rows[0] });
  req.respondEnd(204);
});

module.exports = { list, getOne, create, update, remove };
