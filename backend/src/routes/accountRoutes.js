const express = require('express');
const { body } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { mfaAttemptLimiter } = require('../middleware/rateLimit');
const controller = require('../controllers/accountController');

const router = express.Router();
router.use(requireAuth);

router.patch(
  '/password',
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8, max: 200 })],
  validate,
  controller.changePassword
);
router.post('/logout-all-sessions', controller.logoutAllOtherSessions);

router.get('/mfa/status', controller.mfaStatus);
router.post('/mfa/setup', controller.mfaSetup);
router.post('/mfa/verify-setup', mfaAttemptLimiter, [body('code').isLength({ min: 6, max: 6 })], validate, controller.mfaVerifySetup);
router.post('/mfa/disable', [body('password').notEmpty()], validate, controller.mfaDisable);

module.exports = router;
