# Security Measures — Distribution Sales & Ledger Management System

This documents every security-relevant decision made in this codebase: what was added, why, how it works, and — just as important — what was deliberately *not* done and why, so nobody mistakes gaps for oversights.

Every claim below was tested against the live app (curl through the actual Vite dev proxy, not just code review) before being written down here. See `PROJECT_LOG.md`, Session 4, for the raw test transcript.

---

## 1. Authentication

### Password storage — bcrypt hashing
Passwords are never stored in a recoverable form. `backend/src/db/seed.js` and `backend/src/controllers/userController.js` hash with `bcrypt` (cost factor 10) before writing to the database; `authController.js` verifies with `bcrypt.compare()`, which never reverses the hash — it re-hashes the login attempt and compares, and does so in constant time (bcrypt's own design), so response timing doesn't leak whether a password was "close."
**Why:** if the database were ever leaked, plain-text or weakly-hashed passwords would hand an attacker every user's real password immediately.

### Breached-password check (Have I Been Pwned, k-anonymity)
Every new password — on account creation and on any password change — is checked against HIBP's breached-password database via `backend/src/utils/passwordBreachCheck.js`. Only the first 5 characters of the password's SHA-1 hash are ever sent over the network (HIBP's own k-anonymity design, not something we invented); the full password never leaves this server.
**Fails open, deliberately:** if HIBP is unreachable, the check is skipped rather than blocking account creation/password changes — a core account-management flow shouldn't become unavailable because of a third-party outage. Verified this fail-open path directly (this sandbox's network egress is restricted and returns a 403 for this domain — confirmed the code correctly treats that as "couldn't check" rather than crashing or wrongly blocking).

### Session cookie (httpOnly)
The login endpoint sets an `httpOnly` cookie (`dsl_session`) containing the JWT — client-side JavaScript cannot read this cookie at all, not even a malicious script injected via an XSS bug.
**Cookie flags:** `httpOnly: true`; `sameSite: 'none'` in production / `'lax'` in local dev (see the CORS/cross-origin note in §3 for why this had to change from a flat `'lax'`); `secure: true` in production; `path: '/'`; 8-hour expiry.

### Fresh per-request authorization check
`requireAuth` verifies the JWT signature, then does a database lookup on every request to confirm the user still exists, is active, and fetches their *current* role — not whatever was true when the token was issued. Verified live: deactivating a user mid-session caused their still-unexpired token to be rejected on the very next request.

### Session invalidation via token_version (this pass)
A `token_version` integer on each user row is embedded in every JWT at login. `requireAuth` rejects any token whose embedded version doesn't match the account's current value. This is the actual mechanism behind three real actions:
- **Changing your own password** (`PATCH /api/account/password`) bumps your `token_version`, silently invalidating every *other* session on your account while re-issuing a fresh cookie for the request that made the change — so you don't lock yourself out on the device you're using.
- **An admin resetting someone else's password** (`userController.update`) does the same for the target user.
- **"Log out all other sessions"** (`POST /api/account/logout-all-sessions`) — an explicit self-service action for "I think I left myself logged in somewhere."

No server-side session store was needed for this — it's a single integer compared against a claim already inside the JWT.

### Sliding session renewal
`requireAuth` also checks how much of the token's lifetime remains; once a token is more than halfway to expiry, it silently issues a fresh one with a full new window. Net effect: an actively-used session doesn't hit a hard 8-hour wall mid-task, but a genuinely abandoned session (nobody making requests) still expires normally — nothing is polling to keep it alive artificially.
**Why not a separate refresh-token pair with rotation instead?** Considered and deliberately not built — a distinct short-lived access token + long-lived refresh token (with reuse detection, rotation, etc.) is meaningfully more moving parts for a benefit this app already gets most of via the combination above: short-lived tokens, a DB freshness check every request, and a real kill-switch (`token_version`). Worth revisiting if this app's needs grow (e.g. needing to distinguish "remember me" from a short session).

### Multi-factor authentication (TOTP)
Users can enable MFA under Account Settings (`/account`, self-service — any role, not just admins). Implementation:
- `otplib` generates a secret and verifies 6-digit TOTP codes (`backend/src/utils/mfa.js`); `qrcode` renders it as a scannable QR code for authenticator apps (Google Authenticator, Authy, 1Password, etc.).
- The secret is stored but MFA isn't actually turned on (`mfa_enabled`) until the user proves their authenticator app produces a matching code (`mfaVerifySetup`) — prevents a typo'd setup from locking someone out of their own account.
- **Login becomes two steps once enabled:** a correct password alone no longer issues a session. Instead, the server returns a short-lived (5 min), purpose-scoped JWT in the response body (`mfaToken`) — deliberately *not* a second cookie, for the same cross-origin reason described in §2 for CSRF — which the frontend holds in memory and exchanges for a real session via `POST /api/auth/mfa/verify` once the user supplies a code. Verified live: a password-only login attempt against an MFA-enabled account returns `{mfaRequired: true}` and does **not** set the session cookie; `/auth/me` correctly returns 401 until the second step completes.
- **Backup codes:** 8 single-use codes are generated and shown exactly once when MFA is enabled, then stored only as bcrypt hashes (same treatment as passwords). Verified live: using one succeeds and consumes it; reusing the same code afterward is correctly rejected.
- **Rate limited specifically:** MFA code attempts (both at login and at setup-confirmation) are capped separately and more tightly (10 per 10 minutes — see `middleware/rateLimit.js`) than the general API limit, since a 6-digit code is a small enough space that unrestricted guessing within its 30-second validity window would matter.
- **Disabling MFA requires the current password** and bumps `token_version` — silently turning off a second factor is exactly the kind of action a compromised session might attempt, so it's gated the same way a password change is.

### Account lockout — now with exponential backoff
`users.failed_login_attempts`, `locked_until`, and `lockout_count` track failures per account. After 5 wrong passwords, the account locks — checked *before* the password is even verified, so further guesses during a lockout don't reach `bcrypt.compare` at all. Unlike the original flat 15-minute lock, **duration now doubles with each separate lockout episode** (15min → 30min → 60min → ... capped at 24h), making sustained brute-forcing of one specific account increasingly pointless without an unbounded permanent ban a legitimate user would need an admin to lift.
**Bug caught during this pass's own testing:** the first implementation had an off-by-one — it incremented the lockout counter *before* computing the duration, so the very first lockout was 30 minutes instead of the intended 15. Caught by actually triggering a real lockout during testing (not just code review) and checking the returned minutes; fixed by computing duration from the pre-increment count.
**Tradeoff accepted, deliberately:** this still allows someone to lock a real user out on purpose by deliberately failing their password 5 times — the accepted tradeoff of account-based lockout in general.

### Rate limiting on login (IP-based, layer two)
20 login attempts per 15 minutes per IP, independent of the per-account lockout above — one stops "guess one person's password many times," the other stops "guess many people's passwords a few times each from one machine." Neither alone covers both attack shapes.

### Generic error messages (no account enumeration)
Login failure always returns the same message regardless of whether the email exists — telling an attacker "no such account" vs "wrong password" is a free account-enumeration oracle.

### JWT secret validated at startup
The server refuses to boot if `JWT_SECRET` is missing, still the `.env.example` placeholder, or under 32 characters — a weak/default secret means anyone can forge a valid login token, and this is the kind of mistake that's easy to make silently by copying `.env.example` without editing the one line that matters.

---

## 2. Cross-Site Request Forgery (CSRF) protection

**This section changed since the original hardening pass.** The original design (documented in earlier versions of this file) used a double-submit *cookie* — a `csrf_token` cookie plus a matching header. That works cleanly when frontend and backend share an origin, but this app's real deployment topology is **three separate origins** (Vercel for the frontend, Render for the backend, Supabase for the database) — and a cookie set by Render in response to a Vercel-origin request isn't reliably stored or sent back by browsers that block third-party cookies (Safari does this by default; Chrome is moving the same direction). That would have made the CSRF cookie itself unreliable exactly where it mattered most.

**Current defense — signed token, delivered in the response body, not a cookie** (`backend/src/middleware/csrf.js`):
1. `GET /api/auth/csrf-token` issues an HMAC-signed token (a random nonce + timestamp, signed with `JWT_SECRET` so it can't be forged, with its own 24h expiry) — a plain JSON response, no cookie involved at all.
2. The frontend fetches this once and holds it in memory, attaching it as an `X-CSRF-Token` header on every mutating (`POST`/`PUT`/`PATCH`/`DELETE`) request.
3. The server verifies the signature and expiry on every such request; missing or invalid → `403`.

**Why this still stops CSRF despite not depending on a cookie at all:** a malicious page cannot make the victim's browser produce a validly-signed token — it has no way to read one (the token was fetched via an authenticated, same-origin-to-the-attacker-inaccessible XHR call from the real frontend) and no way to forge one (it doesn't know `JWT_SECRET`). This sidesteps the third-party-cookie-blocking problem entirely rather than working around it.
**Layered with:** strict CORS (§3, rejects requests from any origin except the configured frontend before they'd even reach the CSRF check) and, for the session cookie specifically, `SameSite=None; Secure` in production (required for the cross-origin cookie to be sent at all — see §1 — which is *not* a CSRF defense by itself at that setting, which is exactly why the signed-token approach above is the real protection now, not a supporting layer).

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

## 9. Scalability & performance (this pass)

Not strictly "security," but done in the same pass and worth documenting together since some of it has security-adjacent motivations (denial-of-service resistance, not just speed):

- **Pagination on Orders and the all-distributors Ledger view** (`backend/src/utils/pagination.js`) — previously both endpoints returned every matching row in one response with no limit. A client (malicious or just a business with years of order history) could force the server to load and serialize an unbounded result set. Page size is clamped server-side (max 200) regardless of what a client requests, so this is also a mild DoS mitigation, not purely a UX nicety. The single-distributor ledger view stays unpaginated deliberately — naturally bounded to one business relationship rather than the whole company's activity — documented as a candidate for the same treatment if that assumption stops holding.
- **In-memory response caching on the expensive aggregate report endpoints** (`backend/src/utils/cache.js`, 30s TTL) — dashboard/monthly-sales/performance/top-products all run non-trivial aggregate SQL; a plain `Map`-based cache (not Redis — this app runs as a single instance, so cache coherency across instances was never a real requirement here) cuts repeated identical queries during normal navigation. Explicitly invalidated on order creation and payment recording (`invalidatePrefix('route:/api/reports')`) rather than only relying on the TTL, so a just-created order's effect on the dashboard is visible immediately, not up to 30s later.
- **gzip compression** (`compression` middleware) on all API responses above ~1KB.
- **Database indexes added**: `ledger(entry_date DESC)` for the now-paginated all-distributors view's sort, and `orders(created_by)` for the sales-rep performance report's join — both query patterns existed before but weren't covered by an index until this pass.

## 10. New dependencies added this pass
`otplib` (TOTP generation/verification), `qrcode` (MFA setup QR codes), `compression` (gzip). All three are widely-used, actively maintained packages with no known relevant CVEs at time of adding (checked via `npm audit` after installation — clean).

## 11. Deliberately not done (and why)

- **No CSP header on the backend itself** (unchanged reasoning from earlier passes) — it's a pure JSON API. The frontend's CSP lives in `frontend/index.html` as a meta tag; `frame-ancestors`/`X-Frame-Options` (which browsers ignore inside a `<meta>` CSP tag) are set at the real HTTP-header level via `frontend/vercel.json`'s `headers` config, updated this pass to match the actual Vercel deployment path — the original `frontend/nginx.conf` version still exists for the Docker Compose deployment option, but isn't what's actually in use.
- **No separate refresh-token pair with rotation.** Superseded by this pass's combination of `token_version`-based invalidation + sliding renewal (§1) — considered, and judged to cover the practical need (sessions that don't die mid-task, but that a password change/explicit action can genuinely kill) without the added complexity of a second credential type, rotation-on-use, and reuse-detection logic. Worth revisiting only if a concrete need emerges that this doesn't cover (e.g. a "remember me for 30 days" option distinct from a normal session).
- **No CAPTCHA.** Exponential lockout backoff (§1) was implemented instead as the practical response to repeated failed logins — CAPTCHA remains a reasonable future layer if lockout alone proves disruptive, but adds a third-party dependency (hCaptcha/reCAPTCHA both require the operator's own site keys) that wasn't worth taking on for this pass.
- **Socket.io connections are still not authenticated.** Unchanged from the prior pass — anyone who can reach the app can receive live "an order was created" events, though not the order's actual contents (the broadcast payload is just an order ID and distributor ID). Worth hardening if this app is ever exposed beyond a trusted setup.
- **Account lockout/breach-check/MFA state is not yet reflected in `frontend/src/pages/UsersPage.jsx`'s admin view** — an admin can see whether a user has MFA enabled (`mfa_enabled` is now returned by `GET /api/users`) but there's no UI surfacing *locked-out* accounts or offering an admin a one-click unlock. Currently the only way to clear a lockout is a direct database update. Small, worth adding if lockouts turn out to affect real users in practice.

---

*Every measure in §1-§8 was originally verified in Session 4 (see `PROJECT_LOG.md` for that transcript). Everything in §1's MFA/token_version/exponential-backoff subsections, and §2's signed-token CSRF, was verified fresh in this pass — real TOTP codes generated and checked end-to-end, a genuine two-session password-change-invalidates-the-other-session test, a real single-use backup code consumed and correctly rejected on reuse, and the exponential-backoff off-by-one bug caught by actually triggering a lockout rather than trusting the code on inspection. See `PROJECT_LOG.md`'s latest session for the full transcript.*
