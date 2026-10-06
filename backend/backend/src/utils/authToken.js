const jwt = require('jsonwebtoken');

const AUTH_COOKIE = 'dsl_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h — keep in sync with JWT_EXPIRES_IN default
const MFA_PENDING_TTL = '5m';

function cookieOptions() {
  return {
    httpOnly: true,
    // 'none' is required in production because the frontend (Vercel) and
    // backend (Render) are on different domains — every request between
    // them is cross-site, and SameSite=Lax blocks cookies on cross-site
    // XHR/fetch (it only allows them on top-level navigations). 'lax' stays
    // the default for local dev, where frontend+backend are same-site
    // through the Vite proxy and 'none' would require https:// locally too.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

// tokenVersion is embedded so requireAuth can reject this token later if the
// account's token_version has since been bumped (password change, or an
// explicit "log out everywhere" action) — see middleware/auth.js.
function signAuthToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, tokenVersion: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function issueSession(res, user) {
  res.cookie(AUTH_COOKIE, signAuthToken(user), cookieOptions());
}

// A short-lived, purpose-scoped token proving "this request just supplied the
// right password for user X," used to bridge the gap between password
// verification and MFA code verification. Deliberately NOT a cookie — same
// reasoning as the CSRF token (see middleware/csrf.js): a cross-site cookie
// set by Render in response to a Vercel-origin request isn't reliably stored
// by browsers with third-party cookie blocking. The frontend just holds this
// in memory for the ~30 seconds it takes to type an MFA code, then sends it
// back in the request body.
function signMfaPendingToken(userId) {
  return jwt.sign({ id: userId, purpose: 'mfa_pending' }, process.env.JWT_SECRET, { expiresIn: MFA_PENDING_TTL });
}

function verifyMfaPendingToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'mfa_pending') throw new Error('Wrong token purpose');
  return payload;
}

module.exports = {
  AUTH_COOKIE,
  SESSION_MAX_AGE_MS,
  cookieOptions,
  signAuthToken,
  issueSession,
  signMfaPendingToken,
  verifyMfaPendingToken,
};
