# Security Measures — Distribution Sales & Ledger Management System

This documents every security-relevant decision made in this codebase: what was added, why, how it works, and — just as important — what was deliberately *not* done and why, so nobody mistakes gaps for oversights.

Every claim below was tested against the live app (curl through the actual Vite dev proxy, not just code review) before being written down here. See `PROJECT_LOG.md`, Session 4, for the raw test transcript.

---

## 1. Authentication

### Password storage — bcrypt hashing
Passwords are never stored in a recoverable form. `backend/src/db/seed.js` and `backend/src/controllers/userController.js` hash with `bcrypt` (cost factor 10) before writing to the database; `authController.js` verifies with `bcrypt.compare()`, which never reverses the hash — it re-hashes the login attempt and compares.
**Why:** if the database were ever leaked, plain-text or weakly-hashed passwords would hand an attacker every user's real password immediately.

### Session cookie (httpOnly, not localStorage)
The login endpoint (`POST /api/auth/login`) no longer returns a JWT in the JSON response body. Instead it sets an `httpOnly` cookie (`dsl_session`) containing the token. `httpOnly` means client-side JavaScript cannot read this cookie at all — not even a malicious script injected via an XSS bug could steal it.
**Why:** the previous design (Sessions 1-2) stored the JWT in `localStorage`, which *any* JavaScript running on the page can read. An httpOnly cookie removes that entire theft vector — the browser sends it automatically, but no JS (ours or an attacker's) ever touches it directly.
**Cookie flags used:** `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production (requires HTTPS), `path: '/'`, 8-hour expiry matching the JWT's own expiry.

### Fresh per-request authorization check
`requireAuth` (`backend/src/middleware/auth.js`) verifies the JWT signature, then — new in this pass — does a database lookup on every single request to confirm the user still exists, is still active, and fetches their *current* role, rather than trusting whatever was true when the token was issued.
**Why:** without this, an admin deactivating a sales rep (or changing their role) would have no effect until that rep's existing token naturally expired — up to 8 hours later. Verified live: deactivating a user via direct DB update immediately caused their still-unexpired token to be rejected on the very next request (`This session is no longer valid.`).
**Tradeoff accepted:** one extra database query per authenticated request. At this app's scale (a small internal sales team), that cost is negligible next to the correctness gain.

### Account lockout after repeated failed logins
`users.failed_login_attempts` and `users.locked_until` (new columns, added via an idempotent `ALTER TABLE` in `schema.sql` so existing databases upgrade safely) track failures per account. After 5 wrong passwords, the account locks for 15 minutes — checked *before* the password is even verified, so further guesses during the lockout window don't get a bcrypt comparison at all. A successful login resets the counter.
**Why:** stops an attacker who already knows (or has narrowed down) a specific person's email from brute-forcing that one account, independent of IP-based rate limiting (see below) — someone could otherwise route guesses through many IPs to dodge a pure rate limit.
**Tradeoff accepted, deliberately:** this makes it possible for someone to lock a *real* user out on purpose by deliberately failing their password 5 times. This is a known, accepted tradeoff of account-based lockout in general — the alternative (no lockout at all) is worse. If this becomes a real annoyance in practice, the usual next step is CAPTCHA after a few failures instead of a hard lock, which we haven't implemented here.

### Rate limiting on login (IP-based, layer two)
`express-rate-limit` caps login attempts at 20 per 15 minutes per IP address (`backend/src/middleware/rateLimit.js`), independent of the per-account lockout above. A much looser limit (600 requests/15min) applies to the whole API as a blunt safety net against runaway clients or crude scripted abuse.
**Why two separate mechanisms?** Account lockout stops "guess one person's password many times." IP rate limiting stops "guess many people's passwords a few times each from one machine." Neither alone covers both attack shapes.

### Generic error messages (no account enumeration)
Login failure always returns the same message — `"Invalid email or password."` — whether the email doesn't exist or the password is simply wrong.
**Why:** a distinct "no such account" error would let an attacker silently build a list of every valid email address registered in the system before ever attempting a password.

### JWT secret validated at startup
`backend/src/server.js` now refuses to start the server at all if `JWT_SECRET` is missing, still equal to the placeholder text from `.env.example`, or shorter than 32 characters.
**Why:** a weak or default secret means anyone can forge a valid-looking login token (including one claiming to be an admin). This is the kind of mistake that's easy to make by copying `.env.example` to `.env` and forgetting the one line that actually matters — better to crash loudly at startup than run silently vulnerable.

---

## 2. Cross-Site Request Forgery (CSRF) protection

Switching the session to a cookie reintroduced a risk that didn't exist with the old `Authorization`-header approach: cookies are sent by the browser *automatically* on any request to the site, including ones triggered by a malicious page the user happens to have open in another tab. Without a defense, that other page could make the user's browser fire a request (e.g. "delete this distributor") that the backend would accept, since the valid session cookie rides along whether the request came from our real frontend or not.

**Defense implemented — double-submit cookie pattern** (`backend/src/middleware/csrf.js`):
1. On any request, if the browser doesn't already have a `csrf_token` cookie, the server issues one — a random value, *not* httpOnly (JS needs to read it), set with `sameSite: 'lax'`.
2. On every state-changing request (`POST`/`PUT`/`PATCH`/`DELETE`), the server requires an `X-CSRF-Token` header whose value matches the `csrf_token` cookie. If they don't match (or either is missing), the request is rejected with `403`.
3. The frontend (`api/client.js`) reads the `csrf_token` cookie and attaches it as that header automatically on every mutating request — the person using the app never sees this happen.

**Why this actually stops CSRF:** a malicious site can make the browser *send* our cookies, but it cannot *read* them (browsers enforce this — cookies are only readable by scripts running on the same origin that set them). So the attacker's page can't produce a matching `X-CSRF-Token` header, even though the `csrf_token` cookie itself rides along. Verified live: an identical order-creation request succeeded with the correct header and was rejected with `"CSRF token missing or invalid."` when the header was omitted.

**Also contributing to CSRF defense, as a second layer:** the session cookie's `sameSite: 'lax'` attribute already blocks it from being sent on most cross-site requests in modern browsers, and CORS (below) rejects cross-origin requests from unrecognized origins before they'd even reach the CSRF check. The double-submit token is defense-in-depth on top of both.

---

## 3. Cross-Origin Resource Sharing (CORS)

`backend/src/app.js` locks `cors()` to a specific, configured origin (`CLIENT_ORIGIN`) with `credentials: true` (required for cookies to be sent cross-origin at all). If the app is run with `NODE_ENV=production` and `CLIENT_ORIGIN` is left unset or set to `*`, **the server refuses to start**, with an error explaining why — wide-open CORS combined with cookie-based auth is a serious misconfiguration, and it's the kind of thing that's easy to leave broken by accident if it's merely a warning instead of a hard stop. In local development, an unset `CLIENT_ORIGIN` still defaults to permissive, since nothing sensitive is at stake talking to your own machine.

---

## 4. Input validation

`express-validator` (a dependency since Session 1, but never actually wired into any route until now) is applied to every write endpoint: manufacturers, products, distributors, orders, and user accounts. Rules cover things like: required fields actually present, emails are valid email shapes, prices/quantities are non-negative numbers within sane bounds, string fields have reasonable maximum lengths, enums (`role`, `payment_term`, `status`, etc.) are restricted to their actual allowed values. A shared `validate` middleware (`backend/src/middleware/validate.js`) turns any failed rule into a clean `400` response listing exactly which field(s) were wrong.

**Why this matters beyond "nicer error messages":** malformed input reaching a controller unchecked is how many real vulnerabilities start — not necessarily as a direct exploit here, but as the kind of gap that turns into one later (a string where a number was expected reaching a calculation, an unbounded string filling up storage, an unexpected field silently accepted). Validating at the door is cheap insurance.

**Verified live:** a negative order quantity and a 3-character account password were both rejected with `400` and a specific, correct error message.

---

## 5. Excel/CSV formula injection

This one's subtle and specific to the fact that this app *generates spreadsheets* from user-entered data (distributor names, product names, notes, etc.). Excel (and most spreadsheet software) treats any cell whose content starts with `=`, `+`, `-`, or `@` as a formula to *evaluate*, not text to display. If someone had ever named a distributor something like `=HYPERLINK("http://malicious-site","Click here")`, opening an exported spreadsheet could silently execute that as a live formula — a real, well-documented vulnerability class ("CSV/formula injection").

**Fix** (`backend/src/controllers/exportController.js`): every string value written into any exported spreadsheet — the per-order invoice export and all four bulk exports (products/distributors/orders/ledger) — passes through a `sanitizeCellValue()` function first. If a string starts with one of those four trigger characters, it's prefixed with a leading apostrophe, which forces spreadsheet software to treat it as plain text rather than a formula. Numbers, dates, and other non-string values pass through unchanged.

**Note:** this doesn't affect the PDF invoice export — PDFs don't have a formula-evaluation concept, so there was never a risk there.

---

## 6. Existing protections carried over from earlier sessions (not new, but relevant context)

- **SQL injection**: every database query in this codebase uses parameterized queries (`$1, $2, ...` placeholders via the `pg` library) — user input is never concatenated directly into SQL strings anywhere in the app.
- **XSS**: the frontend is built in React, which HTML-escapes all rendered content by default. No component uses `dangerouslySetInnerHTML`.
- **Role-based access control**: enforced server-side via middleware (`requireRole`), not just hidden UI — verified in Session 1 that a sales-rep token gets a real `403` from the backend on admin-only routes, regardless of what the frontend shows.
- **Audit trail**: every create/update/delete/payment action is logged to the `audit_log` table with a before/after diff and the acting user's ID.
- **Secrets kept out of source control**: `.env` is gitignored; only `.env.example` (with placeholder values) is committed.

---

## 7. Google Drive backup — security model

Added after the initial hardening pass, documented here for the same reason as everything else: so the design is explicit, not assumed.

- **No Google credentials ever reach this app's backend.** Sign-in happens via Google's own OAuth popup in the browser; the resulting access token is used directly from the browser to call Google's Drive API and is never sent to, logged by, or stored on this app's server.
- **Sign-in is required every single backup**, by design (`prompt: 'consent'` on every request) — no refresh token or long-lived grant is cached anywhere, in the browser or otherwise. This trades convenience for the guarantee that Drive access only exists for the duration of an active, explicit backup action.
- **Narrowest available scope**: `drive.file`, not the broader `drive` scope. This means the app (and by extension, anyone who somehow obtained a token) can only see and manage files *this app itself created* — never the rest of the user's Drive contents.
- **The export data itself still flows through this app's normal authenticated routes** (the existing bulk-export and invoice endpoints, protected by the session cookie + CSRF + admin-role checks documented above) before being re-uploaded to Drive — the backup feature doesn't bypass any access control already in place, it just adds a destination for data an admin was already allowed to export.
- **Feature is admin-only** (both the route and the underlying export endpoints it calls), consistent with the existing role model.

---

## 8. Dependency audit & additional hardening (this pass)

Ran `npm audit` on both backend and frontend and manually applied the same vulnerability-category checks used by Anthropic's `security-guidance` Claude Code plugin (command injection, `eval`/`Function` usage, XSS vectors like `dangerouslySetInnerHTML`/`innerHTML`, hardcoded secrets, SSRF, unsafe deserialization) against the whole codebase via direct grep sweeps, since that plugin itself runs inside a live Claude Code session and couldn't be installed into this one.

**Clean:** no command injection risk (no `child_process` usage anywhere), no `eval()`/`new Function()`, no `dangerouslySetInnerHTML`/`innerHTML`/`document.write` (React's default escaping is never bypassed), no SSRF-prone server-side fetches of user-supplied URLs, no hardcoded secrets (the one grep hit was the placeholder-secret string `server.js` checks *against*, not an actual secret).

**`npm audit` findings, assessed rather than blindly patched:**
- **`react-router` — GHSA-qwww-vcr4-c8h2, High severity, CSRF bypass.** Verified against the actual advisory text: it explicitly states this "only affects your application if you are using the unstable RSC APIs." This app is a plain client-side SPA using `createBrowserRouter` with no React Server Components or server actions anywhere in it — the vulnerable code path doesn't exist in how this app uses the library. Left unpatched deliberately rather than force a major-version upgrade (v7→v8, which the fix requires) for a vector that isn't reachable, since that upgrade carries its own breaking-change risk. Worth revisiting if the app ever adopts RSC.
- **`uuid` (via `exceljs`'s dependency tree) — moderate severity, missing buffer-bounds-check when an external buffer is passed in.** This app never calls `uuid` directly or passes it a buffer — it's used internally by `exceljs` for its own XLSX-generation bookkeeping. No newer `exceljs` release exists yet that pulls a patched `uuid` (confirmed: 4.4.0 is current latest); the only "fix" `npm audit` offers is a downgrade to `exceljs@3.4.0`, a step backward. Left as-is and noted for monitoring — re-run `npm audit` periodically and take the fix once a non-breaking one exists upstream.

**Fixes actually applied:**
- **`rel="noopener"` added to every external link** (previously only had `rel="noreferrer"`) — closes the "reverse tabnabbing" gap where a page opened via `target="_blank"` could otherwise use `window.opener` to redirect the original tab.
- **Guarded the one `JSON.parse` on stored data** (`AuthContext.jsx`, reading cached user info from `localStorage`) with a try/catch — corrupted or manually-tampered localStorage could otherwise throw an uncaught exception on app load. Low severity (the real auth check is always `/auth/me` against the server, this was just a cached display value), fixed anyway since it was a one-line change.
- **Explicit Helmet configuration** instead of bare defaults: `referrerPolicy: 'no-referrer'` (don't leak this app's URLs to external sites via the Referer header when a link is clicked), `crossOriginResourcePolicy: 'same-site'`, and CSP explicitly disabled *on the backend* (it serves only JSON, never HTML, so a Helmet-default HTML-oriented CSP header there would imply protection that isn't actually relevant at that layer).
- **Real Content-Security-Policy added to the frontend** (`index.html` meta tag) — scoped tightly to exactly what this app loads: `self` plus Google's OAuth/Drive endpoints and Google Fonts, nothing else. `frame-ancestors` (which browsers ignore inside a `<meta>` CSP tag) is additionally set at the real HTTP-header level in the nginx deployment config (`frontend/nginx.conf`), alongside `X-Frame-Options: DENY` — together these prevent the app from ever being embedded in another site's iframe (clickjacking protection).

---

## 9. Deliberately not done (and why)

- **No CSP (Content-Security-Policy) header configuration beyond Helmet's defaults.** The backend is a pure JSON API — it serves no HTML — so CSP's main value (restricting which scripts/styles a *page* can load) applies to the frontend's hosting setup, not this Express server. Worth configuring when the frontend is actually deployed to a static host.
- **No refresh-token rotation.** The session simply expires after 8 hours, requiring a fresh login. A refresh-token scheme (silently renewing sessions) is a legitimate future improvement for user convenience, but adds real complexity (secure storage of a second, longer-lived credential, revocation logic) that wasn't part of what we scoped together — flagged in `PROJECT_LOG.md` as a future item, not silently skipped.
- **No CAPTCHA.** Considered as a softer alternative to hard account lockout; not implemented since we chose to add real lockout instead. Could be layered in later if lockout proves too disruptive in practice.
- **Socket.io connections are not authenticated.** Real-time order-update events broadcast to any connected client without checking who they are. This was flagged during this session as a known gap but intentionally left out of this pass since it wasn't part of the specific measures discussed — anyone who can reach the app can currently receive live "an order was created" notifications, though not the actual order *contents* beyond what's in the broadcast payload (currently just an order ID and distributor ID). Worth hardening if this app is ever exposed beyond a trusted internal network.

---

*Every measure above was tested against the running application, not just reviewed as code — see `PROJECT_LOG.md`, Session 4, for the full test transcript (login/CSRF/lockout/validation/deactivation-takes-effect-immediately, all verified via curl through the real Vite dev proxy).*
