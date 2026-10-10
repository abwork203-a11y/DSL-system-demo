const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { createOrderWithLedger, recordPayment, cancelOrder, deleteOrder } = require('../services/ledgerService');
const { recordAudit } = require('../utils/audit');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { invalidatePrefix } = require('../utils/cache');

const list = asyncHandler(async (req, res) => {
  const { distributor_id, order_status, payment_status, date_from, date_to, search } = req.query;
  const { page, pageSize, offset } = parsePagination(req.query);
  const clauses = [];
  const params = [];

  if (distributor_id) {
    params.push(distributor_id);
    clauses.push(`o.distributor_id = $${params.length}`);
  }
  if (order_status) {
    params.push(order_status);
    clauses.push(`o.order_status = $${params.length}`);
  }
  if (payment_status) {
    params.push(payment_status);
    clauses.push(`o.payment_status = $${params.length}`);
  }
  if (date_from) {
    params.push(date_from);
    clauses.push(`o.order_date >= $${params.length}`);
  }
  if (date_to) {
    params.push(date_to);
    clauses.push(`o.order_date <= $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(o.order_number ILIKE $${params.length} OR d.name ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // Two queries (count + page) rather than a window function — simpler to
  // read, and at this app's realistic data volumes the extra round-trip
  // costs nothing worth optimizing away yet.
  const countResult = await req.db.query(
    `SELECT COUNT(*)::int AS total FROM orders o JOIN distributors d ON d.id = o.distributor_id ${where}`,
    params
  );

  const dataParams = [...params, pageSize, offset];
  const result = await req.db.query(
    `SELECT o.*, d.name AS distributor_name, u.name AS created_by_name
     FROM orders o
     JOIN distributors d ON d.id = o.distributor_id
     LEFT JOIN users u ON u.id = o.created_by
     ${where}
     ORDER BY o.order_date DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  req.respond(200, paginatedResponse(result.rows, countResult.rows[0].total, page, pageSize));
});

const getOne = asyncHandler(async (req, res) => {
  const orderResult = await req.db.query(
    `SELECT o.*, d.name AS distributor_name, u.name AS created_by_name
     FROM orders o
     JOIN distributors d ON d.id = o.distributor_id
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = $1`,
    [req.params.id]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Order not found.');

  const itemsResult = await req.db.query(
    `SELECT oi.*, p.name AS product_name, p.size_packaging, m.name AS manufacturer_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN manufacturers m ON m.id = oi.manufacturer_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [req.params.id]
  );

  req.respond(200, { ...orderResult.rows[0], items: itemsResult.rows });
});

const create = asyncHandler(async (req, res) => {
  const { distributor_id, items, discount, discount_type, freight_cost, payment_term, payment_status, amount_paid, notes } = req.body;
  if (!distributor_id) throw new ApiError(400, 'distributor_id is required.');

  const order = await createOrderWithLedger(req.db, {
    distributorId: distributor_id,
    createdBy: req.user.id,
    items,
    discount,
    discountType: discount_type || 'fixed',
    freightCost: freight_cost,
    paymentTerm: payment_term,
    paymentStatus: payment_status,
    amountPaid: amount_paid || 0,
    notes,
  });

  req.afterCommit(() => {
    invalidatePrefix('route:/api/reports'); // dashboard/report numbers just went stale
    const io = req.app.get('io');
    if (io) io.emit('order:created', { orderId: order.id, distributorId: distributor_id });
  });

  req.respond(201, order);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { order_status } = req.body;
  // 'cancelled' is deliberately NOT one of the allowed values here — cancelling
  // an order has a real ledger side effect (reversing whatever's still
  // outstanding), which only cancelOrder()/the PATCH /:id/cancel route does.
  // Allowing 'cancelled' through this generic status-update endpoint would
  // let an order be marked cancelled with its debit still fully in effect on
  // the distributor's balance — silently wrong books with no error raised.
  if (!['pending', 'current', 'completed'].includes(order_status)) {
    throw new ApiError(
      400,
      "Invalid order_status. To cancel an order, use the Cancel action instead — it also reverses the order's effect on the distributor's ledger balance, which this status field does not."
    );
  }

  const existing = await req.db.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Order not found.');

  // Once cancelled (via the proper Cancel action), the ledger has already
  // been reversed for this order — changing the status field back to
  // 'active' here wouldn't restore that debit, leaving an order that looks
  // active with no matching ledger entry. Cancelled is terminal.
  if (existing.rows[0].order_status === 'cancelled') {
    throw new ApiError(400, 'This order is cancelled and its status can no longer be changed.');
  }

  const result = await req.db.query(
    'UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *',
    [order_status, id]
  );
  await recordAudit(req.db, {
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'order',
    entityId: id,
    before: { order_status: existing.rows[0].order_status },
    after: { order_status },
  });

  req.afterCommit(() => {
    const io = req.app.get('io');
    if (io) io.emit('order:updated', { orderId: Number(id) });
  });

  req.respond(200, result.rows[0]);
});

const pay = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, note } = req.body;

  const result = await recordPayment(req.db, { orderId: id, amount, note, userId: req.user.id });

  req.afterCommit(() => {
    invalidatePrefix('route:/api/reports'); // outstanding-receivables figure just changed
    const io = req.app.get('io');
    if (io) io.emit('order:payment', { orderId: Number(id) });
  });

  req.respond(200, result);
});

const cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await cancelOrder(req.db, { orderId: id, userId: req.user.id });

  req.afterCommit(() => {
    invalidatePrefix('route:/api/reports'); // outstanding-receivables figure just changed
    const io = req.app.get('io');
    if (io) io.emit('order:cancelled', { orderId: Number(id) });
  });

  req.respond(200, order);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Errors (including the 409 "unsafe to delete" case) propagate to
  // withRls, which rolls back and hands them to the error middleware.
  await deleteOrder(req.db, { orderId: id, userId: req.user.id });

  req.afterCommit(() => invalidatePrefix('route:/api/reports'));

  req.respondEnd(204);
});

// Scoped, narrow read of this one order's history — deliberately not a
// wrapper around the general /api/audit browsing endpoint (which stays
// admin-only, since it can query *any* entity type/id). Any authenticated
// role that can view an order at all can see its own activity trail; that's
// a much narrower surface than being able to browse the whole audit log.
const getActivity = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT a.*, u.name AS user_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'order' AND a.entity_id = $1
     ORDER BY a.created_at DESC`,
    [req.params.id]
  );
  req.respond(200, result.rows);
});

module.exports = { list, getOne, create, updateStatus, pay, cancel, remove, getActivity };
