const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { AUTH_COOKIE, issueSession, signMfaPendingToken, verifyMfaPendingToken } = require('../utils/authToken');
const { verifyTotpToken, consumeBackupCode } = require('../utils/mfa');

const LOCK_THRESHOLD = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60; // cap at 24h so a single account can't be locked out forever

// Exponential backoff: 15min, 30min, 60min, ... capped at 24h. Each
// consecutive lockout (not each failed attempt — only each time a lockout is
// actually triggered) doubles the wait, making sustained brute-forcing of
// one specific account increasingly pointless without escalating to a full,
// permanent ban that a legitimate user would need an admin to lift.
function lockoutDurationMinutes(lockoutCount) {
  return Math.min(BASE_LOCK_MINUTES * 2 ** lockoutCount, MAX_LOCK_MINUTES);
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
    let lockedUntil = null;
    let lockoutCount = user.lockout_count;
    if (attempts >= LOCK_THRESHOLD) {
      // Duration is computed from the count BEFORE incrementing, so the
      // first-ever lockout is BASE_LOCK_MINUTES (15min) at 2^0, the second
      // is 30min at 2^1, and so on — incrementing first would have skipped
      // straight to 30min on the very first lockout.
      lockedUntil = new Date(Date.now() + lockoutDurationMinutes(lockoutCount) * 60 * 1000);
      lockoutCount += 1;
    }
    await pool.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2, lockout_count = $3 WHERE id = $4',
      [attempts, lockedUntil, lockoutCount, user.id]
    );
    throw invalidCredentialsError();
  }

  // Successful password check — reset the failure counter. Note: lockout_count
  // (how many times this account has *entered* lockout, ever) is NOT reset
  // here on purpose — it's what makes the backoff escalate across separate
  // lockout episodes, not just within one. It only resets on an explicit
  // admin action (see userController.js) or could be added as a manual reset.
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }

  if (user.mfa_enabled) {
    // Password was correct, but that's only step one — don't issue a real
    // session yet. Hand back a short-lived, purpose-scoped token the
    // frontend holds in memory and sends back with the MFA code.
    return res.json({ mfaRequired: true, mfaToken: signMfaPendingToken(user.id) });
  }

  issueSession(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Step two of a login for accounts with MFA enabled: exchange the short-lived
// mfaToken (proof step one/password succeeded) plus a 6-digit TOTP code (or
// a one-time backup code) for a real session.
const mfaLoginVerify = asyncHandler(async (req, res) => {
  const { mfaToken, code } = req.body;
  if (!mfaToken || !code) {
    throw new ApiError(400, 'mfaToken and code are required.');
  }

  let pending;
  try {
    pending = verifyMfaPendingToken(mfaToken);
  } catch {
    throw new ApiError(401, 'This login attempt has expired. Please log in again.');
  }

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [pending.id]);
  const user = result.rows[0];
  if (!user || !user.is_active || !user.mfa_enabled) {
    throw new ApiError(401, 'This login attempt is no longer valid.');
  }

  const isTotpValid = await verifyTotpToken(code, user.mfa_secret);
  if (isTotpValid) {
    issueSession(res, user);
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  // Not a valid TOTP code — try it as a one-time backup code instead.
  const remainingCodes = await consumeBackupCode(code, user.mfa_backup_codes);
  if (remainingCodes) {
    await pool.query('UPDATE users SET mfa_backup_codes = $1 WHERE id = $2', [remainingCodes, user.id]);
    issueSession(res, user);
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      backupCodeUsed: true,
      backupCodesRemaining: remainingCodes.length,
    });
  }

  throw new ApiError(401, 'Invalid authentication code.');
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { login, mfaLoginVerify, logout, me };
