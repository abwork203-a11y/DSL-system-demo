const rateLimit = require('express-rate-limit');

// Tight limit on login specifically — this is the endpoint an attacker would
// hammer to guess passwords. Keyed by IP; paired with per-account lockout
// (see authController.js) as a second, independent layer.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again later.' },
});

// A much looser limit across the whole API, mainly to blunt accidental
// runaway clients (a buggy retry loop) or crude scripted abuse — not meant to
// be the primary defense for any single sensitive endpoint.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, generalLimiter };
