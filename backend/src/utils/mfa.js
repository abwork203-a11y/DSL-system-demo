const otplib = require('otplib');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const TOTP_OPTS = { digits: 6, period: 30, algorithm: 'SHA1', type: 'totp' };
const ISSUER = 'LedgerOne';

function generateMfaSecret() {
  return otplib.generateSecret();
}

async function generateMfaQrCode(secret, userEmail) {
  const uri = otplib.generateURI({ ...TOTP_OPTS, issuer: ISSUER, label: userEmail, secret });
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { uri, qrDataUrl };
}

async function verifyTotpToken(token, secret) {
  if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) return false;
  try {
    // window: 1 tolerates the code from one 30s step before/after "now" —
    // accounts for small clock drift between the server and the user's
    // phone without meaningfully widening the guessable window.
    const result = await otplib.verify({ ...TOTP_OPTS, token, secret, window: 1 });
    return !!result?.valid;
  } catch {
    return false;
  }
}

// Backup codes: shown once in plain text at MFA setup time, stored only as
// bcrypt hashes from then on (same treatment as passwords) — each is single-use.
function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
}

async function hashBackupCodes(codes) {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

// Checks a submitted backup code against the stored hashes and returns the
// remaining list with the matched one removed (caller persists this back) —
// or null if no match, meaning the code was already used or never existed.
async function consumeBackupCode(submittedCode, hashedCodes) {
  for (let i = 0; i < hashedCodes.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(submittedCode, hashedCodes[i])) {
      return [...hashedCodes.slice(0, i), ...hashedCodes.slice(i + 1)];
    }
  }
  return null;
}

module.exports = {
  generateMfaSecret,
  generateMfaQrCode,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
};
