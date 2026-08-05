const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { AUTH_COOKIE } = require('../middleware/auth');

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MINUTES = 15;

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
    maxAge: 8 * 60 * 60 * 1000, // 8h, matches JWT_EXPIRES_IN default — keep these in sync
  };
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required.');
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  // Deliberately the same generic message whether the email doesn't exist or
  // the password is wrong — telling an attacker "no such account" vs "wrong
  // password" hands them a free account-enumeration oracle.
  const invalidCredentialsError = () => new ApiError(401, 'Invalid email or password.');

  if (!user || !user.is_active) {
    throw invalidCredentialsError();
  }

  // Check lockout *before* verifying the password — once locked, further
  // guesses shouldn't even reach bcrypt.compare.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new ApiError(423, `This account is temporarily locked from too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockedUntil = attempts >= LOCK_THRESHOLD
      ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
      : null;
    await pool.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockedUntil, user.id]
    );
    throw invalidCredentialsError();
  }

  // Successful login — clear any accumulated failed attempts.
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }

  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.cookie(AUTH_COOKIE, token, cookieOptions());
  res.json({ user: payload });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { login, logout, me };