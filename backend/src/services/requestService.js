const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { createOrderWithLedger } = require('./ledgerService');

// Business logic for the requests/approval workflow (see
// docs/superpowers/specs/2026-10-12-requests-approval-design.md).
// Every function takes `db` (the transaction-scoped client from withRls) as its
// first argument, same convention as ledgerService.js, so callers control the
// transaction and RLS context.

const REQUEST_TYPES = ['order', 'credit_extension', 'price_override', 'distributor_create'];

// Validates a sales rep's "add this distributor" submission (arrives through
// POST /api/distributors) and returns the sanitized payload. A rep may only
// place the distributor in one of THEIR zones — otherwise it would be invisible
// to them after approval.
async function normalizeDistributorPayload(db, user, body) {
  const clean = (v, max = 200) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (s.length > max) throw new ApiError(400, 'One of the fields is too long.');
    return s || null;
  };

  const name = clean(body.name);
  if (!name) throw new ApiError(400, 'name is required.');

  let zoneId = null;
  if (body.zone_id !== undefined && body.zone_id !== null && body.zone_id !== '') {
    zoneId = Number(body.zone_id);
    if (!Number.isInteger(zoneId) || zoneId < 1) throw new ApiError(400, 'zone_id must be a valid zone.');
    if (user.role !== 'admin') {
      const allowed = await db.query('SELECT 1 FROM user_zones WHERE user_id = $1 AND zone_id = $2', [user.id, zoneId]);
      if (allowed.rows.length === 0) throw new ApiError(403, 'You can only add distributors in your own zones.');
    }
  }

  return {
    name,
    contact_name: clean(body.contact_name),
    contact_phone: clean(body.contact_phone, 50),
    contact_email: clean(body.contact_email),
    zone_id: zoneId,
    region: clean(body.region),
    city: clean(body.city),
    area: clean(body.area),
    address: clean(body.address, 500),
  };
}

// Validates and normalizes the type-specific payload for the two request types
// that are submitted through POST /api/requests. (Order payloads are validated
// by orderRoutes.js's createRules, since they arrive through POST /api/orders.)
async function normalizePayload(db, type, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'payload must be an object.');
  }

  if (type === 'credit_extension') {
    const raw = payload.new_limit;
    const limit = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(limit) || limit < 0) {
      throw new ApiError(400, 'payload.new_limit must be a number >= 0.');
    }
    return { new_limit: limit };
  }

  if (type === 'price_override') {
    const productId = Number(payload.product_id);
    const price = Number(payload.price);
    if (!Number.isInteger(productId) || productId < 1) {
      throw new ApiError(400, 'payload.product_id must be a valid product id.');
    }
    if (payload.price === undefined || payload.price === null || payload.price === '' || !Number.isFinite(price) || price < 0) {
      throw new ApiError(400, 'payload.price must be a number >= 0.');
    }
    const product = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      throw new ApiError(400, `Product ${productId} not found.`);
    }
    return { product_id: productId, price };
  }

  throw new ApiError(400, `Unsupported request type: ${type}`);
}

// Inserts a pending request. For a rep, RLS (requests_insert) additionally
// guarantees requested_by is themselves and the distributor is in their zones;
// the explicit distributor lookup here just turns "not visible to you" into a
// clean 404 instead of an RLS violation.
async function createRequest(db, { type, requestedBy, distributorId, payload, reason = null }) {
  if (!REQUEST_TYPES.includes(type)) {
    throw new ApiError(400, `Invalid request type: ${type}`);
  }

  if (type === 'distributor_create') {
    distributorId = null; // the distributor doesn't exist until an admin approves
  } else {
    const distributor = await db.query('SELECT id FROM distributors WHERE id = $1', [distributorId]);
    if (distributor.rows.length === 0) {
      throw new ApiError(404, `Distributor ${distributorId} not found.`);
    }
  }

  const result = await db.query(
    `INSERT INTO requests (type, requested_by, distributor_id, payload, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [type, requestedBy, distributorId, JSON.stringify(payload), reason]
  );
  const request = result.rows[0];

  await recordAudit(db, {
    userId: requestedBy,
    action: 'CREATE',
    entityType: 'request',
    entityId: request.id,
    after: request,
  });

  return request;
}

// Carries out the real-world effect of an approved request. Runs inside the
// approve transaction: if anything here throws, the whole approval (including
// the status change) rolls back and the request stays pending.
// Returns { resultId, order? } — resultId is stored on the request.
async function applyRequest(db, request, approverId) {
  const p = request.payload;

  if (request.type === 'order') {
    const order = await createOrderWithLedger(db, {
      distributorId: request.distributor_id,
      createdBy: request.requested_by, // attributed to the rep who asked, not the approving admin
      items: p.items,
      discount: p.discount,
      discountType: p.discount_type || 'fixed',
      freightCost: p.freight_cost,
      paymentTerm: p.payment_term,
      paymentStatus: p.payment_status,
      amountPaid: p.amount_paid || 0,
      notes: p.notes,
    });
    return { resultId: order.id, order };
  }

  if (request.type === 'distributor_create') {
    const inserted = await db.query(
      `INSERT INTO distributors (name, contact_name, contact_phone, contact_email, zone_id, region, city, area, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [p.name, p.contact_name, p.contact_phone, p.contact_email, p.zone_id, p.region, p.city, p.area, p.address]
    );
    await recordAudit(db, {
      userId: approverId,
      action: 'CREATE',
      entityType: 'distributor',
      entityId: inserted.rows[0].id,
      after: inserted.rows[0],
    });
    return { resultId: inserted.rows[0].id };
  }

  if (request.type === 'credit_extension') {
    const updated = await db.query(
      'UPDATE distributors SET credit_limit = $1 WHERE id = $2 RETURNING id',
      [p.new_limit, request.distributor_id]
    );
    if (updated.rows.length === 0) throw new ApiError(404, 'Distributor not found.');
    return { resultId: updated.rows[0].id };
  }

  if (request.type === 'price_override') {
    const upserted = await db.query(
      `INSERT INTO price_overrides (distributor_id, product_id, price, approved_by, request_id, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (distributor_id, product_id)
       DO UPDATE SET price = EXCLUDED.price,
                     approved_by = EXCLUDED.approved_by,
                     request_id = EXCLUDED.request_id,
                     active = true,
                     created_at = now()
       RETURNING id`,
      [request.distributor_id, p.product_id, p.price, approverId, request.id]
    );
    return { resultId: upserted.rows[0].id };
  }

  throw new ApiError(400, `Unsupported request type: ${request.type}`);
}

// Rough order total from CURRENT prices (honouring any price overrides), used
// only to warn an admin that approving would exceed a credit limit. The
// authoritative total is still computed by createOrderWithLedger at approval.
async function estimateOrderTotal(db, payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return 0;

  const productIds = items.map((i) => Number(i.product_id)).filter(Number.isInteger);
  const prices = await db.query('SELECT id, price FROM products WHERE id = ANY($1::int[])', [productIds]);
  const priceMap = new Map(prices.rows.map((p) => [p.id, Number(p.price)]));

  const overrideIds = items
    .map((i) => i.price_override_id)
    .filter((id) => id !== undefined && id !== null)
    .map(Number)
    .filter(Number.isInteger);
  const overrideMap = new Map();
  if (overrideIds.length > 0) {
    const overrides = await db.query(
      'SELECT id, price, active FROM price_overrides WHERE id = ANY($1::int[])',
      [overrideIds]
    );
    for (const row of overrides.rows) overrideMap.set(row.id, row);
  }

  let subtotal = 0;
  for (const item of items) {
    const override = item.price_override_id != null ? overrideMap.get(Number(item.price_override_id)) : null;
    const unit = override && override.active ? Number(override.price) : priceMap.get(Number(item.product_id)) || 0;
    subtotal += unit * Number(item.quantity || 0);
  }

  const discount = Number(payload.discount || 0);
  const discountAmount = payload.discount_type === 'percentage' ? (subtotal * discount) / 100 : discount;
  return Math.max(0, subtotal - discountAmount + Number(payload.freight_cost || 0));
}

// Soft guardrail (never blocks approval): flags a pending order request that
// would push the distributor past their credit_limit.
async function computeWarnings(db, request) {
  if (request.status !== 'pending' || request.type !== 'order') return [];

  const result = await db.query('SELECT balance, credit_limit FROM distributors WHERE id = $1', [request.distributor_id]);
  const distributor = result.rows[0];
  if (!distributor || distributor.credit_limit === null) return [];

  const total = await estimateOrderTotal(db, request.payload);
  const projected = Number((Number(distributor.balance) + total - Number(request.payload.amount_paid || 0)).toFixed(2));
  const limit = Number(distributor.credit_limit);

  if (projected > limit) {
    return [
      {
        code: 'credit_limit_exceeded',
        message: `Approving this order would put the distributor's balance at ${projected.toFixed(2)}, over their credit limit of ${limit.toFixed(2)}.`,
        projected_balance: projected,
        credit_limit: limit,
      },
    ];
  }
  return [];
}

module.exports = {
  REQUEST_TYPES,
  normalizePayload,
  normalizeDistributorPayload,
  createRequest,
  applyRequest,
  estimateOrderTotal,
  computeWarnings,
};
