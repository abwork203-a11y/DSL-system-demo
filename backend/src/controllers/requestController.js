const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { invalidatePrefix } = require('../utils/cache');
const { normalizePayload, createRequest, applyRequest, computeWarnings } = require('../services/requestService');

// All handlers run inside withRls (see requestRoutes.js), so req.db is the
// RLS-scoped transaction client: a rep only ever sees requests for distributors
// in their zones, admin sees everything. Responses go through req.respond so
// nothing is sent until COMMIT has succeeded.

const REQUEST_SELECT = `
  SELECT r.*, COALESCE(d.name, r.payload->>'name') AS distributor_name, u.name AS requested_by_name, rv.name AS reviewed_by_name
  FROM requests r
  LEFT JOIN distributors d ON d.id = r.distributor_id
  LEFT JOIN users u ON u.id = r.requested_by
  LEFT JOIN users rv ON rv.id = r.reviewed_by`;

function emit(req, event, data) {
  const io = req.app.get('io');
  if (io) io.emit(event, data);
}

const list = asyncHandler(async (req, res) => {
  const { status, type, mine, distributor_id } = req.query;
  const { page, pageSize, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`r.status = $${params.length}`);
  }
  if (type) {
    params.push(type);
    clauses.push(`r.type = $${params.length}`);
  }
  if (distributor_id) {
    params.push(distributor_id);
    clauses.push(`r.distributor_id = $${params.length}`);
  }
  if (mine === 'true' || mine === '1') {
    params.push(req.user.id);
    clauses.push(`r.requested_by = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const countResult = await req.db.query(`SELECT COUNT(*)::int AS total FROM requests r ${where}`, params);

  const dataParams = [...params, pageSize, offset];
  const result = await req.db.query(
    `${REQUEST_SELECT}
     ${where}
     ORDER BY (r.status = 'pending') DESC, r.created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  req.respond(200, paginatedResponse(result.rows, countResult.rows[0].total, page, pageSize));
});

const getOne = asyncHandler(async (req, res) => {
  const result = await req.db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Request not found.');

  const request = result.rows[0];
  const warnings = await computeWarnings(req.db, request);
  req.respond(200, { ...request, warnings });
});

// credit_extension / price_override requests. Order requests are created by
// orderController.create when a non-admin calls POST /api/orders.
const create = asyncHandler(async (req, res) => {
  const { type, distributor_id, payload, reason } = req.body;
  if (type === 'order') {
    throw new ApiError(400, 'Order requests are submitted through POST /api/orders.');
  }
  if (type === 'distributor_create') {
    throw new ApiError(400, 'New-distributor requests are submitted through POST /api/distributors.');
  }

  const normalized = await normalizePayload(req.db, type, payload);
  const request = await createRequest(req.db, {
    type,
    requestedBy: req.user.id,
    distributorId: distributor_id,
    payload: normalized,
    reason: reason || null,
  });

  req.afterCommit(() => emit(req, 'request:created', { requestId: request.id, type }));
  req.respond(201, request);
});

// Explains why a pending-only UPDATE matched nothing: the request either
// doesn't exist (or isn't visible to this user) or was already actioned.
async function explainNotPending(db, id) {
  const existing = await db.query('SELECT status FROM requests WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Request not found.');
  throw new ApiError(409, `This request was already ${existing.rows[0].status}.`);
}

// Admin only (see requestRoutes.js). The UPDATE ... WHERE status = 'pending' is
// the concurrency guard: if two admins approve at once, the second blocks on the
// row lock, then re-checks the WHERE and matches nothing -> 409.
const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const note = req.body.review_note || null;

  const claimed = await req.db.query(
    `UPDATE requests
     SET status = 'approved', reviewed_by = $2, reviewed_at = now(), review_note = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, req.user.id, note]
  );
  if (claimed.rows.length === 0) await explainNotPending(req.db, id);
  const request = claimed.rows[0];

  // If this throws, withRls rolls everything back — including the status
  // change above — so a request is never "approved" without its effect.
  const { resultId, order } = await applyRequest(req.db, request, req.user.id);

  // For a new-distributor request, also link the request to the distributor it created.
  const updated = await req.db.query(
    `UPDATE requests
     SET result_id = $2::int,
         distributor_id = COALESCE(distributor_id, CASE WHEN type = 'distributor_create' THEN $2::int END)
     WHERE id = $1
     RETURNING *`,
    [id, resultId]
  );

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'APPROVE',
    entityType: 'request',
    entityId: Number(id),
    before: request,
    after: updated.rows[0],
  });

  req.afterCommit(() => {
    invalidatePrefix('route:/api/reports');
    emit(req, 'request:reviewed', { requestId: Number(id), status: 'approved' });
    if (order) emit(req, 'order:created', { orderId: order.id, distributorId: request.distributor_id });
  });

  req.respond(200, updated.rows[0]);
});

const reject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const note = req.body.review_note || null;

  const rejected = await req.db.query(
    `UPDATE requests
     SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, req.user.id, note]
  );
  if (rejected.rows.length === 0) await explainNotPending(req.db, id);

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'REJECT',
    entityType: 'request',
    entityId: Number(id),
    after: rejected.rows[0],
  });

  req.afterCommit(() => emit(req, 'request:reviewed', { requestId: Number(id), status: 'rejected' }));
  req.respond(200, rejected.rows[0]);
});

// Only the person who submitted a still-pending request can withdraw it.
// (An admin who wants to turn one down uses reject.)
const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await req.db.query('SELECT requested_by, status FROM requests WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Request not found.');
  if (existing.rows[0].requested_by !== req.user.id) {
    throw new ApiError(403, 'Only the person who submitted a request can cancel it.');
  }

  const cancelled = await req.db.query(
    `UPDATE requests SET status = 'cancelled', reviewed_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  if (cancelled.rows.length === 0) {
    throw new ApiError(409, `This request was already ${existing.rows[0].status}.`);
  }

  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'CANCEL',
    entityType: 'request',
    entityId: Number(id),
    after: cancelled.rows[0],
  });

  req.afterCommit(() => emit(req, 'request:reviewed', { requestId: Number(id), status: 'cancelled' }));
  req.respond(200, cancelled.rows[0]);
});

// ── Approved special prices (read by the order form; revoked by admin) ──

const listOverrides = asyncHandler(async (req, res) => {
  const { distributor_id, product_id, include_inactive } = req.query;
  const clauses = [];
  const params = [];

  if (include_inactive !== 'true' && include_inactive !== '1') clauses.push('po.active = true');
  if (distributor_id) {
    params.push(distributor_id);
    clauses.push(`po.distributor_id = $${params.length}`);
  }
  if (product_id) {
    params.push(product_id);
    clauses.push(`po.product_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await req.db.query(
    `SELECT po.*, p.name AS product_name, p.price AS catalog_price, d.name AS distributor_name
     FROM price_overrides po
     JOIN products p ON p.id = po.product_id
     JOIN distributors d ON d.id = po.distributor_id
     ${where}
     ORDER BY po.created_at DESC`,
    params
  );
  req.respond(200, result.rows);
});

// Admin only: revoke (active=false) or re-enable an override.
const setOverrideActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active must be true or false.');

  const result = await req.db.query('UPDATE price_overrides SET active = $2 WHERE id = $1 RETURNING *', [id, active]);
  if (result.rows.length === 0) throw new ApiError(404, 'Price override not found.');

  await recordAudit(req.db, {
    userId: req.user.id,
    action: active ? 'ENABLE' : 'REVOKE',
    entityType: 'price_override',
    entityId: Number(id),
    after: result.rows[0],
  });

  req.respond(200, result.rows[0]);
});

module.exports = { list, getOne, create, approve, reject, cancel, listOverrides, setOverrideActive };
