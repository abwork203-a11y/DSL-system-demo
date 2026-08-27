const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const controller = require('../controllers/productController');

const router = express.Router();
router.use(requireAuth);

const writeRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('manufacturer_id').optional().isInt({ min: 1 }).withMessage('manufacturer_id must be a valid id.'),
  body('price').optional().isFloat({ min: 0, max: 100000000 }).withMessage('Price must be a non-negative number.'),
  body('size_packaging').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('retail_price')
  .optional()
  .isFloat({ min: 0, max: 100000000 })
  .withMessage('Retail price must be a non-negative number.'),
];

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', requireRole('admin'), writeRules, validate, controller.create);
router.put('/:id', requireRole('admin'), writeRules, validate, controller.update);
router.delete('/:id', requireRole('admin'), controller.remove);

module.exports = router;
