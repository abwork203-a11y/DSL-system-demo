const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const controller = require('../controllers/orderController');

const router = express.Router();
router.use(requireAuth);

const createRules = [
  body('distributor_id').isInt({ min: 1 }).withMessage('distributor_id is required.'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required.'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Each item needs a valid product_id.'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each item quantity must be greater than 0.'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount must be a non-negative number.'),
  body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('discount_type must be fixed or percentage.'),
  body('freight_cost').optional().isFloat({ min: 0 }).withMessage('Freight cost must be a non-negative number.'),
  body('payment_term').isIn(['cash', 'credit']).withMessage('payment_term must be cash or credit.'),
  body('amount_paid').optional().isFloat({ min: 0 }).withMessage('amount_paid must be a non-negative number.'),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

const payRules = [
  body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0.'),
];

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/activity', controller.getActivity);
router.post('/', createRules, validate, controller.create); // admin + sales_rep
router.patch('/:id/status', requireRole('admin'), controller.updateStatus);
router.patch('/:id/cancel', controller.cancel); // admin + sales_rep — same access level as create, no extra role check
router.post('/:id/pay', payRules, validate, controller.pay); // admin + sales_rep can record a payment
router.delete('/:id', requireRole('admin'), controller.remove); // admin-only hard delete

module.exports = router;
