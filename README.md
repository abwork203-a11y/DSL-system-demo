# Distribution Sales & Ledger Management System (LedgerOne)

Full-stack internal tool: order invoicing, distributor ledgers with running balances, and sales performance reporting.

**Stack:** React (Vite) · Node.js/Express · PostgreSQL · Socket.io · JWT auth

---

## Project layout
```
dsl-system/
  backend/     Express API, Postgres schema, ledger business logic
  frontend/    React app (Vite)
  PROJECT_LOG.md   Development history — read this if picking the project back up
```

## Prerequisites
- Node.js 18+
- PostgreSQL 14+ (running locally or reachable via `DATABASE_URL`)

## 1. Backend setup
```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET (use a long random string), and
# the SEED_ADMIN_* values for your first login

npm install
createdb dsl_system          # or create the DB another way
npm run migrate              # applies schema.sql
npm run seed                 # creates your first admin user + sample data
npm run dev                  # starts on http://localhost:4000
```
Your seeded login is whatever you set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to in `.env` (defaults: `admin@example.com` / `ChangeMe123!` — **change this after first login**).

**Note:** the server will refuse to start if `JWT_SECRET` is missing, still the placeholder value, or under 32 characters — this is intentional (see `SECURITY.md`). Generate a real one with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Frontend setup
```bash
cd frontend
npm install
npm run dev                  # starts on http://localhost:5173
```
The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:4000` (see `vite.config.js`), so no CORS setup is needed in development.

Open **http://localhost:5173** and log in.

## 3. Production build
```bash
cd frontend
npm run build                # outputs static files to frontend/dist
```
Serve `frontend/dist` from any static host, and point it at your deployed backend — update `CLIENT_ORIGIN` in the backend `.env` to match your frontend's real origin, and change the frontend's API base URL (currently relies on the dev proxy; for production, either reverse-proxy `/api` and `/socket.io` to the backend the same way, or set an absolute API URL in `src/api/client.js`).

---

## What's implemented (v1, per PRD)
- Manufacturer / Product / Distributor CRUD, distributor active/inactive
- Multi-manufacturer order creation with discount, freight, payment term/status
- Automatic ledger posting with running balance (transactional, race-safe)
- Invoice generation — Excel and PDF, downloadable per order
- Bulk Excel exports: products, distributors, orders, ledger
- **Google Drive backup** (admin-only) — one-click export of every product/distributor/ledger/invoice as Excel files, uploaded directly from the browser to the admin's own Google Drive (fresh Google sign-in required every time; see `GOOGLE_DRIVE_SETUP.md` to configure)
- Full dashboard (stats) + charts (monthly sales, top distributors, rep performance, top products)
- JWT auth with two roles (admin / sales_rep), enforced server-side, session via httpOnly cookie
- Optional TOTP two-factor authentication (self-service, any role) with QR setup and single-use backup codes
- Self-service Account Settings: password change, MFA setup/disable, "log out all other sessions"
- Pagination on Orders and the all-distributors Ledger view; short-TTL caching + gzip compression on report endpoints
- Real-time order/payment events via Socket.io (dashboard and orders list auto-refresh)
- Audit trail on create/update/delete/payment actions, viewable via `/api/audit` (admin)
- Footer with Terms of Service / Privacy Policy / Contact pages (structural placeholders — see "Legal pages" below)

## Role permissions (as built)
| Action | Admin | Sales Rep |
|---|---|---|
| Manufacturers / Products (write) | ✅ | ❌ (read-only) |
| Distributors (create/edit) | ✅ | ✅ |
| Distributors (delete) | ✅ | ❌ |
| Orders (create, view, pay) | ✅ | ✅ |
| Orders (change status) | ✅ | ❌ |
| Ledger (view) | ✅ | ✅ |
| Dashboard | ✅ | ✅ |
| Reports (monthly sales, performance, top products) | ✅ | ❌ |
| Bulk exports | ✅ | ❌ |
| User/account management | ✅ | ❌ |
| Audit log | ✅ | ❌ |

If you want different boundaries, they're all defined in `backend/src/routes/*.js` — each route lists which role(s) can hit it.

## Deployment
See `DEPLOYMENT.md` for running this somewhere real (Docker Compose on a VPS, or a cloud platform like Render/Railway/Fly.io) — Dockerfiles, `docker-compose.yml`, and an nginx config with HTTPS/security-header guidance are all included.

## Legal pages
`/terms`, `/privacy`, and `/cookies` (plus `/contact`) contain real generated boilerplate — not placeholders anymore — matched to this app's actual features (see `LEGAL_CONTENT_DRAFT.md` for the source draft and what was assumed vs. known). **This is still not legal advice.** Search `src/config.js` and the page files for bracketed text like `[Operator Legal Name]` — those are facts only you can supply — and have the final version reviewed by an attorney before relying on it, especially once you have EU/California users or accept payments.

## Security
See `SECURITY.md` for a full account of what's implemented (cookie-based sessions, CSRF protection, account lockout, rate limiting, input validation, formula-injection prevention) and what's deliberately deferred.

## Known gaps / good next steps
- No automated test suite yet (everything was verified manually against a live Postgres instance during development — see PROJECT_LOG.md for what was tested).
- No password-reset flow — admin resets a user's password via the Sales Reps page.
- No pagination on list endpoints yet — fine at small-to-medium data volumes, worth adding if order/ledger history grows large.
- Manufacturer `balance` field is manually edited (v1) — not auto-derived from anything, per the original PRD schema.
- Frontend bundle is a single chunk (~800KB) — fine for an internal tool, but worth code-splitting (route-based `React.lazy`) if it grows.
- Socket.io connections aren't authenticated (see `SECURITY.md` for details) — low risk on a trusted internal network, worth revisiting if this is ever exposed more broadly.
- No refresh-token rotation — sessions simply expire after 8h, requiring a fresh login.
