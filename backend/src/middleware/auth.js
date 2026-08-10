const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { AUTH_COOKIE, issueSession } = require('../utils/authToken');

// Verifies the JWT (read from an httpOnly cookie — JS on the page can't read
// it) and then re-checks the user's current status in the database on every
// request. Trusting the token's role/is_active claims alone would mean a
// deactivated account, or a role change, wouldn't take effect until the
// token naturally expired (up to 8h) — this costs one extra DB lookup per
// request but closes that gap immediately.
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
      'SELECT id, name, email, role, is_active, token_version FROM users WHERE id = $1',
      [payload.id]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      return next(new ApiError(401, 'This session is no longer valid.'));
    }

    // The actual "log out everywhere" mechanism: if the account's
    // token_version has been bumped since this token was issued (password
    // changed, or an explicit "log out all other sessions" action), this
    // specific token is now stale — reject it even though the signature and
    // expiry are still technically valid.
    if (payload.tokenVersion !== user.token_version) {
      return next(new ApiError(401, 'This session was signed out remotely. Please log in again.'));
    }

    // Sliding renewal: if this token is more than halfway through its
    // lifetime, quietly issue a fresh one with a full new expiry window.
    // Net effect: an actively-used session never hits the hard 8h wall and
    // force-logs someone out mid-task, but a genuinely abandoned session
    // (browser closed, no more requests) still expires normally instead of
    // living forever — nobody's polling to keep it alive.
    if (payload.exp && payload.iat) {
      const lifetime = payload.exp - payload.iat;
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      if (remaining < lifetime / 2) {
        issueSession(res, user);
      }
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
