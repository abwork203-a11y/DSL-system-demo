const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { entity_type, entity_id, user_id, limit } = req.query;
  const clauses = [];
  const params = [];

  if (entity_type) {
    params.push(entity_type);
    clauses.push(`a.entity_type = $${params.length}`);
  }
  if (entity_id) {
    params.push(entity_id);
    clauses.push(`a.entity_id = $${params.length}`);
  }
  if (user_id) {
    params.push(user_id);
    clauses.push(`a.user_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Number(limit) || 200);

  const result = await pool.query(
    `SELECT a.*, u.name AS user_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  res.json(result.rows);
});

module.exports = { list };
