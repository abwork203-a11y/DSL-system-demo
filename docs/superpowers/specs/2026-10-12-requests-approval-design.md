# Requests & Approval Workflow — Design Spec

Date: 2026-10-12
Status: Design approved in conversation; awaiting written-spec review
Depends on: Zones RLS (branch `zones-rls-implementation`) — this design reuses its `withRls` / `req.afterCommit` / `req.respond` patterns and its zone-scoped RLS policies.

## 1. Goal

Sales reps must not be able to change money-affecting state on their own. They submit **requests**; an admin approves or rejects them; **nothing changes until approval**. Admin actions stay immediate.

Three request types, one mechanism:

| Type | Rep asks for | Effect on approval |
|---|---|---|
| `order` | An order to be created | Order + ledger entry created, attributed to the requesting rep |
| `credit_extension` | A higher credit limit for a distributor | `distributors.credit_limit` updated |
| `price_override` | A special price for one distributor + product | Row upserted in `price_overrides`; selectable on future orders |

## 2. Scope decisions (made during brainstorming)

- Every rep-created order needs admin approval. Admin-created orders go live immediately.
- Discount override is **not** a separate type: every order is already reviewed, and the discount is visible on it.
- Credit limit is a **soft guardrail**: if approving an order would push a distributor past `credit_limit`, the admin sees a warning but may still approve. Admin is the final authority.
- Price override is scoped to one distributor + product pair. It does not change the catalog price.
- **Out of scope this round:** recording payments and cancelling orders by reps stay as they are today. Only order *creation* is gated. These are a natural follow-up request type.
- `POST /api/orders` stays the single entry point (no frontend route change). Behaviour branches on role:
  - `admin` → unchanged (live order, `201`)
  - `sales_rep` → inserts a `requests` row, returns `202 Accepted` with the pending request

## 3. Data model

```sql
CREATE TABLE IF NOT EXISTS requests (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('order', 'credit_extension', 'price_override')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by    INTEGER NOT NULL REFERENCES users(id),
  distributor_id  INTEGER NOT NULL REFERENCES distributors(id),
  payload         JSONB NOT NULL,
  reason          TEXT,
  reviewed_by     INTEGER REFERENCES users(id),
  review_note     TEXT,
  result_id       INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2); -- NULL = no limit

CREATE TABLE IF NOT EXISTS price_overrides (
  id              SERIAL PRIMARY KEY,
  distributor_id  INTEGER NOT NULL REFERENCES distributors(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  approved_by     INTEGER NOT NULL REFERENCES users(id),
  request_id      INTEGER NOT NULL REFERENCES requests(id),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (distributor_id, product_id)
);
```

Payload shapes (validated per type at submission time):

- `order`: the exact body `POST /api/orders` accepts today (`distributor_id`, `items[]`, `discount`, `discount_type`, `freight_cost`, `payment_term`, `amount_paid`, `notes`; items may carry an optional `price_override_id`).
- `credit_extension`: `{ "new_limit": <number >= 0> }`
- `price_override`: `{ "product_id": <int>, "price": <number >= 0> }`

`distributor_id` is always set (for an order it is the order's distributor) so RLS can reuse the zone pattern.

### RLS on the new tables

Enable and FORCE RLS, same idiom as the zones work (`current_setting('app.user_id', true)` / `app.role`):

- `requests`: admin → all rows. Rep → SELECT rows for distributors in one of their zones (via `user_zones`); INSERT `WITH CHECK` requires `requested_by` = own id and distributor in their zones; UPDATE (cancel) only on their own rows.
- `price_overrides`: admin → all. Rep → SELECT only, for distributors in their zones. Writes only via admin approval.

Idempotent via `CREATE TABLE IF NOT EXISTS` and the existing `DO $$ ... EXCEPTION WHEN duplicate_object` wrapper for policies, matching `schema.sql` conventions. No one-time backfill is needed.

## 4. API

New `backend/src/routes/requestRoutes.js` mounted at `/api/requests`, all handlers wrapped in `withRls`, using `req.respond` / `req.afterCommit`.

| Method + path | Who | Behaviour |
|---|---|---|
| `GET /api/requests?status=&type=` | any role | RLS-scoped list. Admin = approval inbox; rep = "my requests" |
| `GET /api/requests/:id` | any role | Detail (RLS-scoped) |
| `POST /api/requests` | sales_rep (and admin) | Create `credit_extension` / `price_override` requests. `order` type is created through `POST /api/orders` |
| `POST /api/requests/:id/approve` | admin | Runs the type-specific effect + marks approved, in one transaction |
| `POST /api/requests/:id/reject` | admin | Body `{ review_note }`; no side effects |
| `POST /api/requests/:id/cancel` | requester | Withdraw own request while `pending` |

### Approve flow (single transaction)

1. `UPDATE requests SET status='approved', reviewed_by=$admin, reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING *` — zero rows → `409 "Already reviewed."` (handles two admins racing).
2. Dispatch on `type`:
   - `order` → `createOrderWithLedger(req.db, { ...payload, created_by: request.requested_by })`; store the new order id in `result_id`. If `distributors.credit_limit` is set and would be exceeded, the request detail response includes a `warnings` array (computed on read), but approval is not blocked.
   - `credit_extension` → `UPDATE distributors SET credit_limit = $new WHERE id = $d`
   - `price_override` → `INSERT ... ON CONFLICT (distributor_id, product_id) DO UPDATE SET price, approved_by, request_id, active=true`
3. If the effect throws (e.g. the order fails against current data), the transaction rolls back and the request stays `pending`. Never "approved without effect".
4. Cache invalidation / Socket.IO emits go in `req.afterCommit`.

### `POST /api/orders` change

In `orderController.create`: if `req.user.role === 'sales_rep'`, insert a `requests` row (`type='order'`, `payload=req.body`) and `req.respond(202, request)`; otherwise existing behaviour. Existing express-validator `createRules` still run first, so malformed orders are rejected at submission rather than at approval.

### Price override usage

An order line item may include `price_override_id`. `createOrderWithLedger` must verify that id is an `active` override for that same distributor + product and use its price; otherwise reject. A rep can never type an arbitrary unit price.

## 5. Frontend

- Order stepper: handle `202` → show "Submitted for approval" (not "Order created"); no navigation to a non-existent order.
- New **Requests** page: admin sees the pending inbox with approve/reject (+ note) and credit-limit warnings; rep sees their own requests with status.
- Rep-facing forms to raise a credit extension and a price override from the distributor / order screens.
- Order stepper line items: when an active override exists for the chosen distributor + product, offer it as the price.
- Reuse the existing status-modal system (no `window.confirm`) and existing design tokens only.

## 6. Edge cases

- Rep edits a pending request → not allowed; cancel and resubmit.
- Two admins approve concurrently → second gets 409 (approve step 1).
- Rep's zones change after submitting → irrelevant; `distributor_id` is fixed at submission.
- Approving an order whose products/prices changed since submission → the order is created with *current* data; the effect either succeeds or rolls back and the request stays pending with the error shown to the admin.
- Discount applies as in the submitted payload; the admin is expected to review it before approving.

## 7. Known gaps / follow-ups (explicitly not in this round)

- Payment recording and order cancellation approvals.
- `distributors.zone_id` can't be cleared via `COALESCE` (pre-existing).
- `ledger.type` CHECK constraint (`'Cash','credit'` vs code inserting `'debit'`) blocks **every** order creation, including approved ones. This must be fixed before this feature can be exercised end-to-end.
- No notifications; admins find requests via the inbox (a Socket.IO "request created" event is a cheap later add).

## 8. Testing

The repo has no automated test framework; verification is manual (curl/SQL against a local Postgres), matching the zones work. Key checks: rep `POST /api/orders` returns 202 and changes no order/ledger rows; admin approve creates the order attributed to the rep; double-approve returns 409; rep cannot see another zone's requests; rep cannot approve; a price override cannot be used unless active and matching.
