const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const list = asyncHandler(async (req, res) => {
  const { distributor_id, type, date_from, date_to } = req.query;
  const { page, pageSize, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (distributor_id) {
    params.push(distributor_id);
    clauses.push(`l.distributor_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    clauses.push(`l.type = $${params.length}`);
  }
  if (date_from) {
    params.push(date_from);
    clauses.push(`l.entry_date >= $${params.length}`);
  }
  if (date_to) {
    params.push(date_to);
    clauses.push(`l.entry_date <= $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM ledger l ${where}`, params);

  const dataParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT l.*, d.name AS distributor_name, o.order_number
     FROM ledger l
     JOIN distributors d ON d.id = l.distributor_id
     LEFT JOIN orders o ON o.id = l.order_id
     ${where}
     ORDER BY l.entry_date DESC, l.id DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  res.json(paginatedResponse(result.rows, countResult.rows[0].total, page, pageSize));
});

// A single distributor's full ledger history stays unpaginated for now —
// scoped to one business relationship rather than the whole company's
// activity, so it's naturally bounded in a way the global view above isn't.
// Worth revisiting with the same pagination treatment if any one
// distributor's history grows large enough to matter.
const distributorSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const distResult = await pool.query('SELECT id, name, balance FROM distributors WHERE id = $1', [id]);
  if (distResult.rows.length === 0) throw new ApiError(404, 'Distributor not found.');

  const entriesResult = await pool.query(
    `SELECT l.*, o.order_number
     FROM ledger l
     LEFT JOIN orders o ON o.id = l.order_id
     WHERE l.distributor_id = $1
     ORDER BY l.entry_date DESC, l.id DESC`,
    [id]
  );

  res.json({ distributor: distResult.rows[0], entries: entriesResult.rows });
});

module.exports = { list, distributorSummary };
