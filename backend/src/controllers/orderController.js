const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { createOrderWithLedger, recordPayment } = require('../services/ledgerService');
const { recordAudit } = require('../utils/audit');

const list = asyncHandler(async (req, res) => {
  const { distributor_id, order_status, payment_status, date_from, date_to, search } = req.query;
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
  const result = await pool.query(
    `SELECT o.*, d.name AS distributor_name, u.name AS created_by_name
     FROM orders o
     JOIN distributors d ON d.id = o.distributor_id
     LEFT JOIN users u ON u.id = o.created_by
     ${where}
     ORDER BY o.order_date DESC`,
    params
  );
  res.json(result.rows);
});

const getOne = asyncHandler(async (req, res) => {
  const orderResult = await pool.query(
    `SELECT o.*, d.name AS distributor_name, u.name AS created_by_name
     FROM orders o
     JOIN distributors d ON d.id = o.distributor_id
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = $1`,
    [req.params.id]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Order not found.');

  const itemsResult = await pool.query(
    `SELECT oi.*, p.name AS product_name, p.size_packaging, m.name AS manufacturer_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN manufacturers m ON m.id = oi.manufacturer_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [req.params.id]
  );

  res.json({ ...orderResult.rows[0], items: itemsResult.rows });
});

const create = asyncHandler(async (req, res) => {
  const { distributor_id, items, discount, freight_cost, payment_term, payment_status, amount_paid, notes } = req.body;
  if (!distributor_id) throw new ApiError(400, 'distributor_id is required.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await createOrderWithLedger(client, {
      distributorId: distributor_id,
      createdBy: req.user.id,
      items,
      discount,
      freightCost: freight_cost,
      paymentTerm: payment_term,
      paymentStatus: payment_status,
      amountPaid: amount_paid || 0,
      notes,
    });
    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.emit('order:created', { orderId: order.id, distributorId: distributor_id });

    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { order_status } = req.body;
  if (!['pending', 'current', 'completed', 'cancelled'].includes(order_status)) {
    throw new ApiError(400, 'Invalid order_status.');
  }

  const existing = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new ApiError(404, 'Order not found.');

  const result = await pool.query(
    'UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *',
    [order_status, id]
  );
  await recordAudit(pool, {
    userId: req.user.id,
    action: 'UPDATE',
    entityType: 'order',
    entityId: id,
    before: { order_status: existing.rows[0].order_status },
    after: { order_status },
  });

  const io = req.app.get('io');
  if (io) io.emit('order:updated', { orderId: Number(id) });

  res.json(result.rows[0]);
});

const pay = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, note } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await recordPayment(client, { orderId: id, amount, note, userId: req.user.id });
    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.emit('order:payment', { orderId: Number(id) });

    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { list, getOne, create, updateStatus, pay };
