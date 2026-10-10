// A deliberately simple in-memory cache, not Redis — this app runs as a
// single server instance (Render's free tier is one instance; even paid
// tiers here don't need multi-instance cache coherency at this app's
// scale), so a plain Map with TTLs gets the real benefit (fewer repeated
// aggregate queries hitting Postgres) without adding an external dependency
// the user would need to provision and pay for.
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Invalidates every cached entry whose key starts with a given prefix — used
// after a write (e.g. a new order) to drop now-stale report/dashboard
// numbers immediately instead of waiting out the TTL.
function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Express middleware: caches a GET route's JSON response for ttlMs, keyed by
// the full URL (so different query params/filters get separate cache
// entries automatically) AND the requesting user — RLS-scoped routes return
// different data per user at the same URL, so a shared key would serve one
// rep's cached numbers to another. Requires requireAuth to run first.
function cacheRoute(ttlMs) {
  return (req, res, next) => {
    const key = `route:${req.originalUrl}:${req.user?.id ?? 'anon'}`;
    const cached = get(key);
    if (cached !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) set(key, body, ttlMs);
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };
    next();
  };
}

module.exports = { get, set, invalidatePrefix, cacheRoute };
