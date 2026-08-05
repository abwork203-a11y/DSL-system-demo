const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
