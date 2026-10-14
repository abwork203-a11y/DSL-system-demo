# Notifications — Implementation Plan

Status: DRAFT for review (nothing built yet). Written so several people/AIs can work in parallel.
Depends on: Requests & Approval (already built — see `docs/superpowers/specs/2026-10-12-requests-approval-design.md`).

## 1. Goal

Tell the right person, in the app, when something needs their attention or has changed — without them refreshing pages or being polled by hand.

Real-world analogy: a shop's notice board per person. When a rep submits an order, a note is pinned on the **admin's** board; when the admin decides, a note is pinned on the **rep's** board. Each person only ever sees their own board.

## 2. Scope (v1) — proposed, confirm before building

| Event | Who is notified |
|---|---|
| Request submitted (order / credit limit / special price) | all active admins |
| Request approved / rejected (with admin's note) | the rep who submitted it |
| Order created from an approved request | the rep (link to the order) |
| Credit-limit extension approved | the rep |
| Special price approved / revoked | the rep |
| Distributor balance exceeds credit limit (soft warning) | all admins |

Out of scope for v1 (listed so nobody builds them by accident): email / SMS / push, per-user notification preferences, quiet hours, notifying on payments or cancellations (not gated by approval yet), digest emails.

## 3. Findings that shape the design (verified in the code)

1. **Sockets are unauthenticated and everything is broadcast.** `server.js` accepts any connection and controllers call `io.emit(...)` to *everyone*. Fine for "refresh the orders list"; not acceptable for per-person notifications. The existing `request:created` / `request:reviewed` events (added with Requests & Approval) also go to every connected client — they only carry ids/status, but they should move to targeted delivery too.
2. **RLS is the app's security model.** A `notifications` table must follow it: a user can only read/update their own rows.
3. **Notification rows must be written in the same transaction as the business change** (same rule as `afterCommit` for emits): if approval rolls back, no notification exists.
4. The existing pattern `req.afterCommit(fn)` is the correct place to push the live socket event after COMMIT.

## 4. Design

### Data model
```
notifications
  id            SERIAL PK
  user_id       INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE   -- recipient
  type          TEXT NOT NULL          -- 'request_submitted' | 'request_approved' | 'request_rejected' | 'order_created' | 'credit_limit_exceeded' | ...
  title         TEXT NOT NULL
  body          TEXT
  link          TEXT                   -- in-app route, e.g. '/requests' or '/orders/42'
  entity_type   TEXT, entity_id INT    -- what it is about (request / order / distributor)
  read_at       TIMESTAMPTZ            -- NULL = unread
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
INDEX (user_id, read_at, created_at DESC)
```
RLS (ENABLE + FORCE): SELECT/UPDATE/DELETE only where `user_id = current_setting('app.user_id')::int`. INSERT: any authenticated context may insert **for any user** (a rep's action notifies admins), so INSERT policy is `WITH CHECK (true)` for the app role, and the *service* decides recipients. Retention: delete rows older than 90 days (cron-style cleanup, or on read).

### API (all under `requireAuth` + `withRls`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications?unread=true&page=` | my notifications, newest first (paginated) |
| GET | `/api/notifications/unread-count` | number for the bell badge |
| PATCH | `/api/notifications/:id/read` | mark one read |
| POST | `/api/notifications/read-all` | mark all mine read |
| DELETE | `/api/notifications/:id` | dismiss one |

### Service: `services/notificationService.js`
- `notifyUsers(db, userIds, { type, title, body, link, entityType, entityId })` — inserts rows (bulk insert), returns them.
- `notifyAdmins(db, payload)` — looks up active admins (users table has no RLS) then `notifyUsers`.
- Callers pass the same `db` transaction client; the caller does `req.afterCommit(() => pushToUsers(...))`.

### Live delivery
- **Prerequisite:** authenticate the socket handshake with the same session cookie / JWT as `requireAuth`, and have each socket `join('user:<id>')` (and `role:admin`).
- `pushToUsers(io, userIds, event, data)` emits to `user:<id>` rooms only: event `notification:new` with the row.
- Frontend `SocketContext` listens for `notification:new`, bumps the badge, shows a toast.
- Switch `request:created` / `request:reviewed` to targeted rooms as part of the same task.
- If the socket is down, nothing is lost: the bell fetches the unread count on load, on window focus, and every 60 s as a fallback.

### Frontend
- Bell icon with unread badge in `Layout` top bar; dropdown of latest 10 with "Mark all read" and "View all".
- `/notifications` page: full list, unread filter, click → marks read and navigates to `link`.
- Reuse existing `Toast`, `StatusBadge`, `tokens.css` tokens only (project rule — no new colors).

## 5. Tasks (parallelizable)

Dependency graph: **T1 → T2/T3/T4 → T5/T6**; T7 can start any time; T8 last.

| ID | Task | Owner can start when | Files (own these — avoid collisions) |
|---|---|---|---|
| T1 | Schema: `notifications` table, index, RLS policies, idempotent (`IF NOT EXISTS`, `DO $$ … duplicate_object`) | now | `backend/src/db/schema.sql` (append-only block) |
| T2 | `notificationService.js` + unit-style script test against local Postgres | T1 | `backend/src/services/notificationService.js` |
| T3 | Notifications controller + routes + mount in `app.js` | T1 | `controllers/notificationController.js`, `routes/notificationRoutes.js`, `app.js` (2 lines) |
| T4 | Socket auth + rooms (`user:<id>`, `role:admin`), `pushToUsers` helper | now | `backend/src/server.js`, `backend/src/utils/realtime.js` |
| T5 | Wire producers: requestController (submit/approve/reject/cancel), orderController (rep order → 202), credit-limit warning | T2, T4 | `requestController.js`, `orderController.js`, `requestService.js` |
| T6 | Frontend: API client, bell + dropdown, `/notifications` page, SocketContext listener, 60 s fallback poll | T3 (API shape is fixed above, so UI can start with a mock) | `frontend/src/api/endpoints.js`, `components/NotificationBell.jsx`, `pages/NotificationsPage.jsx`, `context/SocketContext.jsx`, `components/Layout.jsx`, `App.jsx` |
| T7 | Retention cleanup (delete > 90 days) | T1 | `backend/src/services/notificationService.js` or a small job in `server.js` |
| T8 | End-to-end verification + patch packaging | all | — |

### Acceptance criteria
- A rep submits an order → every admin has exactly one unread notification; the rep has none.
- Admin approves → the rep gets one notification linking to the new order; admins do not get a duplicate.
- Rolled-back approval (force an error) → no notification rows created.
- Rep A can never read, count, or mark rep B's notifications (verify with two tokens, expect 404/empty).
- An unauthenticated socket is refused; a connected user receives only events for their own room.
- Bell badge matches `GET /unread-count`; marking read updates it without reload.
- Schema applies twice with no errors; `node --check` clean; `vite build` clean.

## 6. Risks / decisions to confirm

1. **Who counts as "all admins"?** Proposed: every active user with role `admin`.
2. **Socket auth change is a behavior change** for existing live-refresh (orders list). Needs a regression check on Orders/Dashboard live updates.
3. **Notification fan-out size** is tiny today (few admins), so synchronous insert inside the request transaction is fine; revisit if admin count grows large.
4. **Volume:** credit-limit warnings could repeat on every order — de-duplicate (one unread per distributor).
5. Email/push later: the `notifications` table is the single source, so a worker can fan out from it without changing producers.

## 7. Suggested order if one person does it alone

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. About one focused session for backend (T1–T5, T7), one for frontend (T6) plus verification (T8).
