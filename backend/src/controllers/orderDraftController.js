const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

// Flattens the stored { id, user_id, distributor_id, data, created_at,
// updated_at } row back into the flat shape the frontend already works
// with (see utils/orderDrafts.js) — everything in `data` spreads out to
// top-level fields, same as when this was a localStorage record.
function toClientShape(row) {
  return {
    id: row.id,
    distributorId: row.distributor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...row.data,
  };
}

// Most-recently-edited first — matches the old localStorage listDrafts()
// ordering, which the Drafts tab's "recent work" framing depends on.
const list = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM order_drafts WHERE user_id = $1 ORDER BY updated_at DESC`,
    [req.user.id]
  );
  res.json(result.rows.map(toClientShape));
});

// Upsert, shared by both the normal (CSRF-protected) route and the
// tab-close beacon route — see routes/orderDraftRoutes.js and
// middleware/csrf.js for why the beacon path is exempted from CSRF.
//
// id is client-generated (a UUID assigned the moment there's something
// worth saving) rather than server-assigned — required so the fire-and-
// forget beacon call already knows what id it's saving under, since it
// has no response to read one back from. The WHERE clause on the DO
// UPDATE guards against a (practically impossible, but not worth trusting
// blindly) id collision letting one user's request touch another user's
// draft: if the existing row belongs to someone else, the update is
// silently skipped rather than applied.
const save = asyncHandler(async (req, res) => {
  const { id, distributorId, ...rest } = req.body;

  if (!id || typeof id !== 'string') {
    throw new ApiError(400, 'id is required.');
  }

  const result = await pool.query(
    `INSERT INTO order_drafts (id, user_id, distributor_id, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET distributor_id = EXCLUDED.distributor_id,
           data = EXCLUDED.data
       WHERE order_drafts.user_id = EXCLUDED.user_id
     RETURNING *`,
    [id, req.user.id, distributorId || null, rest]
  );

  if (result.rows.length === 0) {
    // Only reachable via an id collision with another user's draft — see
    // comment above. Not a normal-use error path.
    throw new ApiError(409, 'This draft could not be saved.');
  }

  res.json(toClientShape(result.rows[0]));
});

const remove = asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM order_drafts WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  res.status(204).end();
});

module.exports = { list, save, remove };
