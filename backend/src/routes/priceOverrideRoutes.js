const express = require('express');
const { param } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/requestController');

const router = express.Router();
router.use(requireAuth);

// Approved special prices. Reps read these (RLS limits them to their zones) so the
// order form can offer the approved price; only admin can revoke / re-enable.
router.get('/', withRls(controller.listOverrides));
router.patch(
  '/:id',
  requireRole('admin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid price override id.'),
  validate,
  withRls(controller.setOverrideActive)
);

module.exports = router;
