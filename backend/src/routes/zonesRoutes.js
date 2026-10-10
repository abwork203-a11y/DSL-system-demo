const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/zonesController');

const router = express.Router();
router.use(requireAuth);

const createRules = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Zone name is required.'),
];

router.get('/', withRls(controller.list)); // any authenticated role
router.post('/', requireRole('admin'), createRules, validate, withRls(controller.create));
router.delete('/:id', requireRole('admin'), withRls(controller.remove));

module.exports = router;
