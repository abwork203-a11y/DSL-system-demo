const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { ApiError } = require('../utils/ApiError');

const AUTH_COOKIE = 'dsl_session';

// Verifies the JWT (now read from an httpOnly cookie rather than a header —
// JS on the page can't read it, which is the whole point) and then re-checks
// the user's current status in the database. Trusting the token's role/
// is_active claims alone would mean a deactivated account, or a role change,
// wouldn't take effect until the token naturally expired (up to 8h) — this
// costs one extra DB lookup per request but closes that gap immediately.
async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];

  if (!token) {
    return next(new ApiError(401, 'Not authenticated.'));
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired session.'));
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
      [payload.id]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      return next(new ApiError(401, 'This session is no longer valid.'));
    }
    // Use the DB's current role/name, not whatever was true when the token
    // was issued — covers an admin changing someone's role mid-session.
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Restricts a route to one or more roles. Enforced server-side — never rely on
// the frontend hiding buttons alone.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `Requires one of these roles: ${roles.join(', ')}`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, AUTH_COOKIE };
