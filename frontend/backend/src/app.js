const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { verifyCsrf } = require('./middleware/csrf');
const { generalLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const userRoutes = require('./routes/userRoutes');
const manufacturerRoutes = require('./routes/manufacturerRoutes');
const productRoutes = require('./routes/productRoutes');
const distributorRoutes = require('./routes/distributorRoutes');
const orderRoutes = require('./routes/orderRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const reportRoutes = require('./routes/reportRoutes');
const exportRoutes = require('./routes/exportRoutes');
const auditRoutes = require('./routes/auditRoutes');

function resolveCorsOrigin() {
  const configured = process.env.CLIENT_ORIGIN;
  if (configured && configured !== '*') return configured;

  if (process.env.NODE_ENV === 'production') {
    // Refuse to silently run wide-open in production — this must be a
    // deliberate choice, not something that happens because a .env got
    // copied without editing.
    throw new Error(
      'CLIENT_ORIGIN must be set to your real frontend origin in production (not left blank or "*"). ' +
      'Wide-open CORS combined with cookie-based auth is unsafe.'
    );
  }
  // Local dev without CLIENT_ORIGIN set: fine to be permissive, since nothing
  // sensitive is at stake on localhost.
  return configured || '*';
}

function createApp() {
  const app = express();

  // Needed for rate limiting / secure cookies to see the real client IP and
  // scheme when the app sits behind a reverse proxy (Render's own LB in
  // front of this service) — harmless locally, necessary in production.
  app.set('trust proxy', 1);

  app.use(helmet({
    // This backend serves only JSON, never HTML, so a content-security-policy
    // here wouldn't do much — it belongs on the frontend's static hosting
    // instead (see frontend/index.html and DEPLOYMENT.md/vercel.json).
    // Explicitly disabling it here (rather than leaving Helmet's HTML-oriented
    // default) avoids a header that implies protection this server doesn't
    // actually provide.
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // frontend origin (Vercel) differs from this API's origin (Render) — 'same-site' would incorrectly block it
    // HSTS: tells browsers "never even try plain HTTP for this host again,"
    // closing the window where a single accidental http:// request could be
    // intercepted before a redirect to https:// ever happened. Only
    // meaningful — and only sent — over an HTTPS connection to begin with,
    // which Render provides by default.
    hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 days
  }));
  app.use(compression()); // gzip response bodies — meaningful for the larger JSON payloads (order lists, reports) and free performance
  app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '150kb' })); // generous for a JSON order payload, small enough to blunt body-flooding
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(generalLimiter);
  app.use(verifyCsrf);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/manufacturers', manufacturerRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/distributors', distributorRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/ledger', ledgerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/audit', auditRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, resolveCorsOrigin };