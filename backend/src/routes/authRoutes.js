const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { CSRF_COOKIE } = require('../middleware/csrf');
const authController = require('../controllers/authController');

const router = express.Router();

// Safe (GET) route — skipped by verifyCsrf. ensureCsrfCookie (mounted
// globally in app.js, ahead of every route) has already generated the token
// and put it on req.cookies by the time this handler runs, so we just hand
// it back in the JSON body. This exists because the frontend and backend now
// live on different domains (Vercel + Render) — client-side JS can only read
// cookies belonging to its own origin, so it can no longer see this cookie
// directly and needs it delivered in a response body instead.
router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.cookies[CSRF_COOKIE] });
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;