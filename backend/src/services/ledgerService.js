const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');

/**
 * Posts a single ledger entry for a distributor and keeps distributors.balance
 * in sync, atomically. Must be called with a `client` that is inside an
 * active transaction (BEGIN already issued by the caller).
 *
 * Convention: balance = total the distributor OWES us.
 *   - type 'debit'  -> balance increases (an order was placed / invoiced)
 *   - type 'credit' -> balance decreases (a payment was received)
 *
 * Locks the distributor row FOR UPDATE first so concurrent order/payment
 * writes for the same distributor can't race and produce a wrong running
 * balance.
 */
async function postLedgerEntry(client, { distributorId, orderId = null, type, amount, note = null, userId = null }) {
  if (!['debit', 'credit'].includes(type)) {
    throw new ApiError(400, `Invalid ledger entry type: ${type}`);
  }
  if (!(amount > 0)) {
    throw new ApiError(400, 'Ledger entry amount must be greater than zero.');
  }

  const distResult = await client.query(
    'SELECT id, balance FROM distributors WHERE id = $1 FOR UPDATE',
    [distributorId]
  );
  if (distResult.rows.length === 0) {
    throw new ApiError(404, `Distributor ${distributorId} not found.`);
  }

  const currentBalance = Number(distResult.rows[0].balance);
  const delta = type === 'debit' ? Number(amount) : -Number(amount);
  const newBalance = Number((currentBalance + delta).toFixed(2));

  const ledgerResult = await client.query(
    `INSERT INTO ledger (distributor_id, order_id, type, amount, running_balance, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [distributorId, orderId, type, amount, newBalance, note, userId]
  );

  await client.query('UPDATE distributors SET balance = $1 WHERE id = $2', [newBalance, distributorId]);

  return ledgerResult.rows[0];
}

/**
 * Creates an order + its line items + the resulting ledger debit (and, if the
 * order was paid at creation time, the offsetting credit) as a single
 * transaction. Caller is responsible for BEGIN/COMMIT/ROLLBACK.
 *
 * items: [{ product_id, quantity }]
 */
async function createOrderWithLedger(client, {
  distributorId,
  createdBy,
  items,
  discount = 0,
  discountType = 'fixed',
  freightCost = 0,
  paymentTerm,
  paymentStatus = 'unpaid',
  amountPaid = 0,
  notes = null,
}) {
  if (!items || items.length === 0) {
    throw new ApiError(400, 'An order must have at least one line item.');
  }
  if (!['cash', 'credit'].includes(paymentTerm)) {
    throw new ApiError(400, `Invalid payment term: ${paymentTerm}`);
  }
  if (!['fixed', 'percentage'].includes(discountType)) {
    throw new ApiError(400, `Invalid discount_type: ${discountType}`);
  }

  // Lock + validate distributor
  const distResult = await client.query('SELECT id, status FROM distributors WHERE id = $1 FOR UPDATE', [distributorId]);
  if (distResult.rows.length === 0) {
    throw new ApiError(404, `Distributor ${distributorId} not found.`);
  }
  if (distResult.rows[0].status !== 'active') {
    throw new ApiError(400, 'Cannot place an order for an inactive distributor.');
  }

  // Resolve product prices + manufacturers as of right now (snapshotted onto order_items)
  const productIds = items.map((i) => i.product_id);
  const productResult = await client.query(
    `SELECT id, manufacturer_id, price, retail_price, is_active FROM products WHERE id = ANY($1::int[])`,
    [productIds]
  );
  const productMap = new Map(productResult.rows.map((p) => [p.id, p]));

  let subtotal = 0;
  const resolvedItems = items.map((item) => {
    const product = productMap.get(item.product_id);
    if (!product) {
      throw new ApiError(400, `Product ${item.product_id} not found.`);
    }
    if (!product.is_active) {
      throw new ApiError(400, `Product ${item.product_id} is inactive and cannot be ordered.`);
    }
    if (!(item.quantity > 0)) {
      throw new ApiError(400, `Quantity for product ${item.product_id} must be greater than zero.`);
    }
    const lineTotal = Number(product.price) * Number(item.quantity);
    subtotal += lineTotal;
    return {
      product_id: product.id,
      manufacturer_id: product.manufacturer_id,
      quantity: item.quantity,
      price_at_time_of_order: product.price,
      retail_price_at_time_of_order: product.retail_price,
    };
  });

  subtotal = Number(subtotal.toFixed(2));

  // Turn the raw `discount` value into an actual dollar amount to subtract.
  // 'fixed' is unchanged existing behavior — the number IS the dollar amount.
  // 'percentage' means `discount` is e.g. 10 for "10%", not $10 — so it has
  // to be validated as a 0-100 range and converted against the subtotal.
  let discountAmount;
  if (discountType === 'percentage') {
    if (Number(discount) < 0 || Number(discount) > 100) {
      throw new ApiError(400, 'Percentage discount must be between 0 and 100.');
    }
    discountAmount = Number((subtotal * (Number(discount) / 100)).toFixed(2));
  } else {
    discountAmount = Number(discount);
  }

  const total = Number((subtotal - discountAmount + Number(freightCost)).toFixed(2));
  if (total < 0) {
    throw new ApiError(400, 'Discount cannot exceed subtotal + freight.');
  }
  if (Number(amountPaid) > total) {
    throw new ApiError(400, 'Amount paid cannot exceed order total.');
  }

  // Derive a consistent payment_status from amountPaid rather than trusting the client blindly
  let resolvedPaymentStatus = 'unpaid';
  if (Number(amountPaid) >= total && total > 0) resolvedPaymentStatus = 'paid';
  else if (Number(amountPaid) > 0) resolvedPaymentStatus = 'partial';
  else resolvedPaymentStatus = paymentStatus === 'paid' && total === 0 ? 'paid' : 'unpaid';

  const orderInsert = await client.query(
    `INSERT INTO orders
       (order_number, distributor_id, created_by, subtotal, discount, discount_type, freight_cost, total,
        payment_term, payment_status, amount_paid, order_status, notes)
     VALUES ('PENDING', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
     RETURNING *`,
    [distributorId, createdBy, subtotal, discount, discountType, freightCost, total, paymentTerm, resolvedPaymentStatus, amountPaid, notes]
  );
  const order = orderInsert.rows[0];

  const orderNumber = `ORD-${String(order.id).padStart(6, '0')}`;
  await client.query('UPDATE orders SET order_number = $1 WHERE id = $2', [orderNumber, order.id]);
  order.order_number = orderNumber;

  for (const item of resolvedItems) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, manufacturer_id, quantity, price_at_time_of_order, retail_price_at_time_of_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.id, item.product_id, item.manufacturer_id, item.quantity, item.price_at_time_of_order, item.retail_price_at_time_of_order]
    );
  }

  // Post the debit for the full order total (distributor now owes this)
  if (total > 0) {
    await postLedgerEntry(client, {
      distributorId,
      orderId: order.id,
      type: 'debit',
      amount: total,
      note: `Order ${orderNumber}`,
      userId: createdBy,
    });
  }

  // If some/all of it was paid at the point of sale, post the offsetting credit
  if (Number(amountPaid) > 0) {
    await postLedgerEntry(client, {
      distributorId,
      orderId: order.id,
      type: 'credit',
      amount: amountPaid,
      note: `Payment at time of order ${orderNumber}`,
      userId: createdBy,
    });
  }

  await recordAudit(client, {
    userId: createdBy,
    action: 'CREATE',
    entityType: 'order',
    entityId: order.id,
    after: order,
  });

  return { ...order, items: resolvedItems };
}

/**
 * Records an additional payment against an existing order (e.g. a distributor
 * paying down a credit order later). Updates order.amount_paid/payment_status
 * and posts the matching ledger credit.
 */
async function recordPayment(client, { orderId, amount, note = null, userId = null }) {
  if (!(amount > 0)) {
    throw new ApiError(400, 'Payment amount must be greater than zero.');
  }

  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (orderResult.rows.length === 0) {
    throw new ApiError(404, `Order ${orderId} not found.`);
  }
  const order = orderResult.rows[0];

  const newAmountPaid = Number((Number(order.amount_paid) + Number(amount)).toFixed(2));
  if (newAmountPaid > Number(order.total)) {
    throw new ApiError(400, 'Payment would exceed the order total.');
  }

  const newStatus = newAmountPaid >= Number(order.total) ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

  await client.query(
    'UPDATE orders SET amount_paid = $1, payment_status = $2 WHERE id = $3',
    [newAmountPaid, newStatus, orderId]
  );

  const entry = await postLedgerEntry(client, {
    distributorId: order.distributor_id,
    orderId: order.id,
    type: 'credit',
    amount,
    note: note || `Payment for ${order.order_number}`,
    userId,
  });

  await recordAudit(client, {
    userId,
    action: 'PAYMENT',
    entityType: 'order',
    entityId: order.id,
    before: { amount_paid: order.amount_paid, payment_status: order.payment_status },
    after: { amount_paid: newAmountPaid, payment_status: newStatus },
  });

  return { order: { ...order, amount_paid: newAmountPaid, payment_status: newStatus }, ledgerEntry: entry };
}

/**
 * Cancels an order WITHOUT deleting any history. If the order still has a net
 * outstanding balance (total - amount_paid), posts an offsetting credit so the
 * distributor's balance goes back to what it was before this order existed —
 * this is the append-only-safe way to "undo" an order's effect on the ledger.
 */
async function cancelOrder(client, { orderId, userId }) {
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (orderResult.rows.length === 0) {
    throw new ApiError(404, `Order ${orderId} not found.`);
  }
  const order = orderResult.rows[0];

  if (order.order_status === 'cancelled') {
    throw new ApiError(400, 'This order is already cancelled.');
  }

  const netOutstanding = Number((Number(order.total) - Number(order.amount_paid)).toFixed(2));
  if (netOutstanding > 0) {
    await postLedgerEntry(client, {
      distributorId: order.distributor_id,
      orderId: order.id,
      type: 'credit',
      amount: netOutstanding,
      note: `Cancellation reversal for ${order.order_number}`,
      userId,
    });
  }

  const updateResult = await client.query(
    `UPDATE orders SET order_status = 'cancelled' WHERE id = $1 RETURNING *`,
    [orderId]
  );

  await recordAudit(client, {
    userId,
    action: 'CANCEL',
    entityType: 'order',
    entityId: orderId,
    before: { order_status: order.order_status },
    after: { order_status: 'cancelled' },
  });

  return updateResult.rows[0];
}

/**
 * A hard delete — actually removes the order and its ledger entries, rather
 * than just marking it cancelled. Only ever safe if NOTHING has happened to
 * this distributor's ledger since this order's entries were posted, because
 * every later ledger row's stored running_balance was computed assuming this
 * order's entries came before it. Deleting out from under that would leave
 * every later running_balance silently wrong.
 */
async function deleteOrder(client, { orderId, userId }) {
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (orderResult.rows.length === 0) {
    throw new ApiError(404, `Order ${orderId} not found.`);
  }
  const order = orderResult.rows[0];

  // Lock the distributor row too — we're about to directly overwrite its
  // balance, so no concurrent order/payment for this distributor should be
  // able to interleave with this delete.
  await client.query('SELECT id FROM distributors WHERE id = $1 FOR UPDATE', [order.distributor_id]);

  const ledgerEntries = await client.query('SELECT * FROM ledger WHERE order_id = $1', [orderId]);

  if (ledgerEntries.rows.length > 0) {
    const highestOwnEntryId = Math.max(...ledgerEntries.rows.map((r) => r.id));
    const newerActivity = await client.query(
      'SELECT id FROM ledger WHERE distributor_id = $1 AND id > $2 LIMIT 1',
      [order.distributor_id, highestOwnEntryId]
    );
    if (newerActivity.rows.length > 0) {
      throw new ApiError(
        409,
        "This order can't be safely deleted because the distributor has newer ledger activity since it — deleting it now would corrupt their running balance history. Use Cancel instead, which is always safe."
      );
    }
  }

  // Safe to proceed: unwind this order's exact net effect on the balance,
  // then remove its ledger trail and the order itself.
  const netEffect = ledgerEntries.rows.reduce((sum, entry) => {
    const amount = Number(entry.amount);
    return sum + (entry.type === 'debit' ? amount : -amount);
  }, 0);

  if (netEffect !== 0) {
    const distResult = await client.query('SELECT balance FROM distributors WHERE id = $1', [order.distributor_id]);
    const newBalance = Number((Number(distResult.rows[0].balance) - netEffect).toFixed(2));
    await client.query('UPDATE distributors SET balance = $1 WHERE id = $2', [newBalance, order.distributor_id]);
  }

  await client.query('DELETE FROM ledger WHERE order_id = $1', [orderId]);

  await recordAudit(client, {
    userId,
    action: 'DELETE',
    entityType: 'order',
    entityId: orderId,
    before: order,
  });

  // order_items rows are removed automatically via ON DELETE CASCADE on
  // order_items.order_id — confirm this exists in schema.sql before relying
  // on it; if it doesn't, order_items must be deleted explicitly here first.
  await client.query('DELETE FROM orders WHERE id = $1', [orderId]);

  return { deleted: true, orderId };
}

module.exports = { postLedgerEntry, createOrderWithLedger, recordPayment, cancelOrder, deleteOrder };
