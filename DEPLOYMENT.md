# Deploying LedgerOne

This gets the app running on a real server, reachable by your team, instead of just your own machine.

**Two documented paths:**
- **Option A — Vercel + Render + Supabase**, all free-tier, no server to manage. This is the path actually in use for this app's real deployment.
- **Option B — Docker Compose** on your own VPS, if you'd rather self-host everything on one server you control.

---

## Option A — Vercel (frontend) + Render (backend) + Supabase (database)

Three separate services, three separate origins — which is why the auth system (see `SECURITY.md` §1-2) uses a cross-origin-safe cookie configuration and a signed CSRF token instead of the simpler same-origin patterns that would work if everything sat behind one domain.

### 1. Database — Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Get your connection string: the **Connect** button (top right of the project dashboard) → **Session pooler** (not Direct, not Transaction pooler — Session pooler is the one that works reliably from a persistent Node server like this one's; Direct is IPv6-only on the free tier, which most PaaS hosts including Render don't support outbound, and Transaction pooler is built for short-lived serverless functions, not this app's always-running Express server).
3. **Enable Row Level Security on every table** (Table Editor → each table → toggle RLS on, no policies needed) — this app never uses Supabase's own REST/GraphQL API layer (it connects via the raw Postgres connection string), so RLS just closes that separate access path as defense-in-depth. Confirm no table shows an "Unrestricted" tag afterward.
4. Run the migration once against this database: from `backend/`, with `DATABASE_URL` in `.env` pointed at your Supabase Session pooler string, `npm run migrate` then `npm run seed`.

### 2. Backend — Render
1. New Web Service → connect your GitHub repo → **Root Directory**: `backend` → **Runtime**: Node → **Build Command**: `npm install` → **Start Command**: `node src/server.js`.
2. Environment variables (set in Render's dashboard, not a committed file):
   - `DATABASE_URL` — your Supabase Session pooler string
   - `JWT_SECRET` — 32+ random characters (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `CLIENT_ORIGIN` — your Vercel URL once you have it (step 3) — the server refuses to start without a real value here
   - `NODE_ENV` — `production`
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — used once by the seed step
3. Render's free tier sleeps after 15 minutes of inactivity — the first request after a sleep takes ~30-50s to wake back up. A real, known tradeoff of the free tier, not a bug.

### 3. Frontend — Vercel
1. New Project → import your repo → **Root Directory**: `frontend`.
2. Environment variable: `VITE_API_URL` = your Render backend's URL (e.g. `https://your-backend.onrender.com`) — Vercel bakes this in at build time, so it must be set *before* the first deploy, and any change to it needs a redeploy, not just a dashboard edit.
3. `frontend/vercel.json` (already in the repo) handles the SPA routing fallback and sets `X-Frame-Options`/CSP `frame-ancestors` headers — Vercel picks this up automatically, nothing to configure in the dashboard for it.
4. Once deployed, go back to Render and set `CLIENT_ORIGIN` to this real Vercel URL (step 2.2 above), and redeploy the backend so CORS actually allows it.

### 4. Google Drive backup, if using it
Update the OAuth Client ID's Authorized JavaScript origins (Google Cloud Console) to your real Vercel URL — see `GOOGLE_DRIVE_SETUP.md`, the `localhost:5173` entry used for local dev won't work in production.

### Cross-origin specifics worth knowing
- The session cookie is `SameSite=None; Secure` in production — required for it to be sent at all between two different domains (Vercel↔Render). This is *not* itself a CSRF defense at that setting; the actual CSRF protection is the signed-token mechanism in `SECURITY.md` §2, which was specifically designed not to depend on cookies surviving third-party-cookie blocking.
- Socket.io connects directly from the browser to the Render backend's real URL (`VITE_API_URL`), not through any proxy — confirmed Vercel's rewrites don't reliably proxy WebSocket traffic to an external server, and Vercel's own native WebSocket support only works for handlers running directly on Vercel Functions, not for forwarding to Render.

---

## Option B — Docker Compose on your own server (VPS, etc.)

### Prerequisites
- A server (VPS from any provider — DigitalOcean, Hetzner, Linode, AWS Lightsail, etc.) running Linux, with **Docker** and **Docker Compose** installed ([official install guide](https://docs.docker.com/engine/install/))
- A domain name pointed at the server's IP (recommended — needed for real HTTPS)

### Steps

1. **Get the code onto the server.** Either `git clone` your repo, or upload the project folder some other way.

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in every value — the compose file will refuse to start with clear errors if you skip any of the required ones (`POSTGRES_PASSWORD`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`). Generate the JWT secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   `CLIENT_ORIGIN` must be your real, public frontend URL (e.g. `https://ledgerone.yourdomain.com`) — this is what the backend's CORS and cookie settings lock down to.

3. **Build and start everything:**
   ```bash
   docker compose up -d --build
   ```
   This builds the backend and frontend images, starts Postgres, and — on the backend's first boot — automatically runs the database migration and creates your seeded admin account (both are safe to re-run on every restart, so this isn't a one-time-only step you need to remember).

4. **Check it's actually up:**
   ```bash
   docker compose ps
   docker compose logs backend --tail 50
   ```
   You should see `DSL backend listening on http://localhost:4000` with no errors above it.

5. **Put HTTPS in front of it.** The `frontend` container serves plain HTTP on port 80 — you need a TLS-terminating reverse proxy in front of it for real deployment (never run a login form over plain HTTP). The simplest option is **Caddy**, which handles Let's Encrypt certificates automatically with almost no config:
   ```
   # /etc/caddy/Caddyfile
   ledgerone.yourdomain.com {
       reverse_proxy localhost:80
   }
   ```
   Install Caddy separately (not in this docker-compose file, to keep TLS/cert renewal decoupled from the app itself), point your domain's DNS at the server, and Caddy handles the rest. (Nginx + certbot, or your cloud provider's own load balancer with a managed certificate, work equally well if you already have a preferred setup.)

6. **Update the Google OAuth Client ID's authorized origins** (if using the Drive backup feature) — in Google Cloud Console, add your real production URL (`https://ledgerone.yourdomain.com`) to the Client ID's Authorized JavaScript origins (see `GOOGLE_DRIVE_SETUP.md`, Step 4.5). The `localhost:5173` entry you used for local dev won't work in production.

### Updating to a new version later
```bash
git pull
docker compose up -d --build
```
Existing data in the `postgres_data` volume is untouched — rebuilding the images doesn't touch the database.

### Backing up the database
Beyond the in-app Google Drive backup (which exports business data as Excel), you should also back up the actual Postgres volume for full disaster recovery:
```bash
docker compose exec postgres pg_dump -U postgres dsl_system > backup-$(date +%Y-%m-%d).sql
```
Restore with:
```bash
cat backup-2026-08-04.sql | docker compose exec -T postgres psql -U postgres dsl_system
```

---

## Option C — Other cloud platforms (Railway, Fly.io, etc.)

These platforms can run the same Dockerfiles directly (each has "deploy from Dockerfile" support), or you can use their native Node.js + managed Postgres offerings instead of Docker entirely. Either way, the same environment variables apply — set them in the platform's dashboard rather than a `.env` file. A few platform-specific notes:
- Most give you a `https://` URL automatically (TLS handled for you) — use that as `CLIENT_ORIGIN`.
- Managed Postgres add-ons usually hand you a full `DATABASE_URL` already — use theirs instead of the `postgres://postgres:...@postgres:5432/...` shape from `docker-compose.yml`.
- Run the migration once manually after first deploy if the platform doesn't support a custom entrypoint script: `node src/db/migrate.js && node src/db/seed.js` (or set that as the "release command" if the platform supports one — Render and Railway both do).

---

## Security checklist before going live
- [ ] `JWT_SECRET` is a real random value, not the placeholder (the app refuses to start otherwise — see `SECURITY.md`)
- [ ] `CLIENT_ORIGIN` is your real HTTPS URL, not `*` or unset (also enforced at startup)
- [ ] The whole app is served over HTTPS — automatic on Vercel/Render (Option A); needs Caddy or similar in front if self-hosting via Docker Compose (Option B, step 5). Cookies are marked `secure` in production and won't work over plain HTTP either way.
- [ ] Changed the seeded admin password after first login
- [ ] Google OAuth Client ID's authorized origins updated to your real domain, if using Drive backup
- [ ] `.env` (or your host's equivalent env var dashboard) is not committed to git and not readable by anyone who shouldn't have it — it contains your database password and JWT secret
- [ ] Row Level Security enabled on every Supabase table, if using Option A (see that section, step 1.3)

---

## Troubleshooting

**`Set POSTGRES_PASSWORD in your .env file` (or similar) when running `docker compose up`**
Docker Compose (Option B) only — you're missing a required value in `.env`; copy from `.env.example` and fill in every blank.

**Backend keeps restarting / crash-looping**
Check the logs (`docker compose logs backend --tail 100` for Option B, or Render's own log viewer for Option A). Almost always either a bad `DATABASE_URL` or the `JWT_SECRET` startup validation rejecting a too-short value.

**Frontend loads but API calls fail / CORS errors in browser console**
`CLIENT_ORIGIN` on the backend doesn't match the URL you're actually visiting the site at — they must match exactly, including `https://` and no trailing slash.

**Login works but nothing else does / session doesn't persist (Option A specifically)**
Usually means `VITE_API_URL` wasn't set (or was wrong) at the time the frontend was built on Vercel — it's baked in at build time, so fixing it requires a redeploy, not just an env var edit. Check the Network tab: requests should be going to your real Render URL, not a relative `/api/...` path.

**Google sign-in fails in production but worked locally**
The production URL isn't in the OAuth Client ID's Authorized JavaScript origins list yet (see the relevant deployment option's step above, or `GOOGLE_DRIVE_SETUP.md`).
