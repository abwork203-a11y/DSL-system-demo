const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');
const { issueSession } = require('../utils/authToken');
const { isPasswordBreached } = require('../utils/passwordBreachCheck');
const {
  generateMfaSecret, generateMfaQrCode, verifyTotpToken, generateBackupCodes, hashBackupCodes,
} = require('../utils/mfa');

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'currentPassword and newPassword are required.');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters.');
  }

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  const { breached, checked } = await isPasswordBreached(newPassword);
  if (checked && breached) {
    throw new ApiError(400, 'This password has appeared in known data breaches. Please choose a different one.');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  // Bumping token_version invalidates every OTHER session for this account
  // (any other browser/device currently logged in) — the whole point of
  // "changing your password should log out anyone else." We immediately
  // re-issue a fresh cookie below so the request making this change doesn't
  // also get logged out.
  const updated = await pool.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *',
    [newHash, user.id]
  );

  issueSession(res, updated.rows[0]);
  await recordAudit(pool, { userId: req.user.id, action: 'PASSWORD_CHANGE', entityType: 'user', entityId: user.id });
  res.json({ success: true });
});

// Logs this account out of every session EXCEPT the one making this request
// (which gets a freshly re-issued cookie right after) — e.g. "I think I left
// myself logged in on a shared computer."
const logoutAllOtherSessions = asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING *',
    [req.user.id]
  );
  issueSession(res, result.rows[0]);
  await recordAudit(pool, { userId: req.user.id, action: 'LOGOUT_ALL_SESSIONS', entityType: 'user', entityId: req.user.id });
  res.json({ success: true });
});

// Step 1 of enabling MFA: generate a secret + QR code, store the secret but
// leave mfa_enabled false until the user proves they can actually generate a
// matching code with it (mfaVerifySetup) — otherwise a typo'd authenticator
// setup could lock someone out of their own account.
const mfaSetup = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT mfa_enabled FROM users WHERE id = $1', [req.user.id]);
  if (result.rows[0]?.mfa_enabled) {
    throw new ApiError(400, 'MFA is already enabled. Disable it first to reconfigure.');
  }

  const secret = generateMfaSecret();
  const { qrDataUrl } = await generateMfaQrCode(secret, req.user.email);

  await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.id]);
  res.json({ qrDataUrl, secret });
});

// Step 2: confirm the authenticator app is actually working, then turn MFA on
// for real and hand back one-time backup codes (shown exactly once, ever).
const mfaVerifySetup = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const result = await pool.query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
  const secret = result.rows[0]?.mfa_secret;
  if (!secret) {
    throw new ApiError(400, 'No MFA setup in progress — call setup first.');
  }

  const valid = await verifyTotpToken(code, secret);
  if (!valid) {
    throw new ApiError(400, 'That code didn\'t match. Check your authenticator app and try again.');
  }

  const backupCodes = generateBackupCodes();
  const hashed = await hashBackupCodes(backupCodes);
  await pool.query('UPDATE users SET mfa_enabled = true, mfa_backup_codes = $1 WHERE id = $2', [hashed, req.user.id]);

  await recordAudit(pool, { userId: req.user.id, action: 'MFA_ENABLED', entityType: 'user', entityId: req.user.id });
  res.json({ backupCodes });
});

const mfaDisable = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw new ApiError(400, 'Current password is required to disable MFA.');

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new ApiError(401, 'Current password is incorrect.');

  // Bumping token_version here too: if a session was somehow compromised,
  // silently turning MFA off would be a natural next move for an attacker —
  // forcing every session (including whichever one just did this) to
  // re-authenticate limits how quietly that could happen. We re-issue below
  // for the current request same as changePassword.
  const updated = await pool.query(
    `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = '{}', token_version = token_version + 1
     WHERE id = $1 RETURNING *`,
    [user.id]
  );
  issueSession(res, updated.rows[0]);

  await recordAudit(pool, { userId: req.user.id, action: 'MFA_DISABLED', entityType: 'user', entityId: user.id });
  res.json({ success: true });
});

const mfaStatus = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT mfa_enabled FROM users WHERE id = $1', [req.user.id]);
  res.json({ mfaEnabled: !!result.rows[0]?.mfa_enabled });
});

module.exports = {
  changePassword, logoutAllOtherSessions, mfaSetup, mfaVerifySetup, mfaDisable, mfaStatus,
};
