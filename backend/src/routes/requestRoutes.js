const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/requestController');

const router = express.Router();
router.use(requireAuth);

const idRule = param('id').isInt({ min: 1 }).withMessage('Invalid request id.');

const createRules = [
  body('type').isIn(['order', 'credit_extension', 'price_override']).withMessage('Invalid request type.'),
  body('distributor_id').isInt({ min: 1 }).withMessage('distributor_id is required.'),
  body('payload').isObject().withMessage('payload must be an object.'),
  body('reason').optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

const reviewRules = [
  idRule,
  body('review_note').optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

router.get('/', withRls(controller.list)); // admin = approval inbox, rep = requests in their zones (?mine=true for their own)
router.get('/:id', idRule, validate, withRls(controller.getOne));
router.post('/', createRules, validate, withRls(controller.create)); // credit_extension / price_override; orders go through POST /api/orders
router.post('/:id/approve', requireRole('admin'), reviewRules, validate, withRls(controller.approve));
router.post('/:id/reject', requireRole('admin'), reviewRules, validate, withRls(controller.reject));
router.post('/:id/cancel', idRule, validate, withRls(controller.cancel)); // requester only (checked in the controller)

module.exports = router;
