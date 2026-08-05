const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Ensures every browser session has a CSRF token cookie to work with. This
// cookie is deliberately NOT httpOnly — the frontend JS needs to read it and
// echo it back as a header. Its security value isn't secrecy from the page's
// own JS (which we trust); it's that a *different* site can't read it, so it
// can't forge the matching header on a cross-site request.
function ensureCsrfCookie(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    req.cookies[CSRF_COOKIE] = token; // so the same request can already rely on it
  }
  next();
}

// For any state-changing request, the header the frontend sent must match the
// cookie the browser sent. A malicious site making the browser fire a
// cross-site POST can't read our cookie (browsers block that), so it can't
// produce a matching header — this is the classic "double-submit cookie" CSRF
// defense, paired with SameSite=Lax and a locked-down CORS origin list.
function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ApiError(403, 'CSRF token missing or invalid.'));
  }
  next();
}

module.exports = { ensureCsrfCookie, verifyCsrf, CSRF_COOKIE, CSRF_HEADER };
