const crypto = require('crypto');

// Checks a password against Have I Been Pwned's breached-password database
// using the k-anonymity model: we send only the first 5 characters of the
// password's SHA-1 hash, HIBP returns every suffix that starts with that
// prefix (thousands of them) along with a breach count, and we check
// locally whether our full hash is in that list. The actual password (or
// even its full hash) never leaves this server — this is HIBP's own
// documented privacy-preserving design, not something we invented.
//
// No API key needed or possible to leak — this specific endpoint
// (api.pwnedpasswords.com/range/) is intentionally free and anonymous.
async function isPasswordBreached(password) {
  const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { 'Add-Padding': 'true' }, // HIBP feature: pads the response so its size can't be used to guess the prefix's popularity
    });
    clearTimeout(timeout);
    if (!res.ok) return { breached: false, checked: false }; // fail open — see below

    const text = await res.text();
    const found = text.split('\n').some((line) => line.split(':')[0].trim() === suffix);
    return { breached: found, checked: true };
  } catch {
    // Fail OPEN, deliberately: if HIBP is down or unreachable, we don't want
    // account creation/password changes — a core, security-relevant flow —
    // to become unavailable because of a third-party dependency. The other
    // password protections (length minimum, bcrypt hashing, rate limiting)
    // still apply regardless of whether this specific check ran.
    return { breached: false, checked: false };
  }
}

module.exports = { isPasswordBreached };
