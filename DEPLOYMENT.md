# Deploying LedgerOne

This gets the app running on a real server, reachable by your team, instead of just your own machine. Covers self-hosting via Docker Compose (recommended, works on any VPS) and notes on cloud platforms as an alternative.

---

## Option A — Docker Compose on your own server (VPS, etc.)

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

## Option B — Cloud platforms (Render, Railway, Fly.io, etc.)

These platforms can run the same Dockerfiles directly (each has "deploy from Dockerfile" support), or you can use their native Node.js + managed Postgres offerings instead of Docker entirely. Either way, the same environment variables apply — set them in the platform's dashboard rather than a `.env` file. A few platform-specific notes:
- Most give you a `https://` URL automatically (TLS handled for you) — use that as `CLIENT_ORIGIN`.
- Managed Postgres add-ons usually hand you a full `DATABASE_URL` already — use theirs instead of the `postgres://postgres:...@postgres:5432/...` shape from `docker-compose.yml`.
- Run the migration once manually after first deploy if the platform doesn't support a custom entrypoint script: `node src/db/migrate.js && node src/db/seed.js` (or set that as the "release command" if the platform supports one — Render and Railway both do).

---

## Security checklist before going live
- [ ] `JWT_SECRET` is a real random value, not the placeholder (the app refuses to start otherwise — see `SECURITY.md`)
- [ ] `CLIENT_ORIGIN` is your real HTTPS URL, not `*` or unset (also enforced at startup)
- [ ] The whole app is served over HTTPS (Option A, step 5) — cookies are marked `secure` in production and won't work over plain HTTP
- [ ] Changed the seeded admin password after first login
- [ ] Google OAuth Client ID's authorized origins updated to your real domain, if using Drive backup
- [ ] `.env` is not committed to git (already gitignored) and not readable by anyone who shouldn't have it — it contains your database password and JWT secret

---

## Troubleshooting

**`Set POSTGRES_PASSWORD in your .env file` (or similar) when running `docker compose up`**
You're missing a required value in `.env` — copy from `.env.example` and fill in every blank.

**Backend container keeps restarting**
```bash
docker compose logs backend --tail 100
```
Almost always either a bad `DATABASE_URL` (check the password matches `POSTGRES_PASSWORD` exactly) or the `JWT_SECRET` validation rejecting a too-short value.

**Frontend loads but API calls fail / CORS errors in browser console**
`CLIENT_ORIGIN` doesn't match the URL you're actually visiting the site at — they must match exactly, including `https://` and no trailing slash.

**Google sign-in fails in production but worked locally**
The production URL isn't in the OAuth Client ID's Authorized JavaScript origins list yet (Step 6 above).
