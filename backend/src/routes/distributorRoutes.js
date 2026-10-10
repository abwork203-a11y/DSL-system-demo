const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/distributorController');

const router = express.Router();
router.use(requireAuth);

const writeRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('contact_email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Contact email must be valid.'),
  body('zone_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('status').optional().isIn(['active', 'inactive']),
  body('address')
  .optional({ nullable: true })
  .isString()
  .isLength({ max: 500 }),
];

router.get('/', withRls(controller.list));
router.get('/:id', withRls(controller.getOne));
router.post('/', writeRules, validate, withRls(controller.create)); // admin + sales_rep, per PRD
router.put('/:id', writeRules, validate, withRls(controller.update)); // admin + sales_rep, per PRD (includes marking inactive)
router.delete('/:id', requireRole('admin'), withRls(controller.remove));

module.exports = router;
