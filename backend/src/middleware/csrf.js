const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');

const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // generous — this just proves "issued by us," not identity

// Why not a cookie-based double-submit token (the original design)?
// This app's frontend (Vercel) and backend (Render) are on different
// domains. A cookie set by Render in response to a cross-site request from
// Vercel is exactly the kind of "third-party cookie" that Chrome and other
// browsers increasingly block or partition by default — especially in
// incognito. That made the old pattern silently fail: the token would be
// returned in the response body just fine, but the matching cookie would
// never actually get stored, so the next request had a header with no
// cookie to compare it to.
//
// This version needs no cookie at all. The server signs a token
// (nonce + timestamp + HMAC using JWT_SECRET) and hands it to the frontend
// once via a JSON response. The frontend just echoes it back as a header on
// every mutating request. The server re-verifies the signature itself —
// nothing to store, nothing that depends on a cookie surviving a cross-site
// round trip. The security property that matters (a third-party site can't
// forge a valid token) still holds: CORS keeps a malicious page's JS from
// ever reading the token in the first place, since the response is only
// readable by the configured frontend origin.

function sign(payload) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
}

function issueCsrfToken() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const token = req.headers[CSRF_HEADER];
  if (!token || typeof token !== 'string') {
    return next(new ApiError(403, 'CSRF token missing or invalid.'));
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return next(new ApiError(403, 'CSRF token missing or invalid.'));
  }
  const [nonce, timestamp, signature] = parts;
  const expected = sign(`${nonce}.${timestamp}`);

  // Constant-time compare — avoids leaking signature bytes via response timing.
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  const validSignature =
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!validSignature) {
    return next(new ApiError(403, 'CSRF token missing or invalid.'));
  }

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > TOKEN_TTL_MS) {
    return next(new ApiError(403, 'CSRF token expired — please refresh and try again.'));
  }

  next();
}

module.exports = { verifyCsrf, issueCsrfToken, CSRF_HEADER };