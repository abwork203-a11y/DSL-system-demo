const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, mfaAttemptLimiter } = require('../middleware/rateLimit');
const { issueCsrfToken } = require('../middleware/csrf');
const authController = require('../controllers/authController');

const router = express.Router();

// Safe (GET) route — skipped by verifyCsrf. Issues a fresh signed CSRF
// token in the JSON body (no cookie involved — see middleware/csrf.js for
// why the original cookie-based version broke across the Vercel/Render
// domain split).
router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: issueCsrfToken() });
});

router.post('/login', loginLimiter, authController.login);
router.post('/mfa/verify', loginLimiter, mfaAttemptLimiter, authController.mfaLoginVerify);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;