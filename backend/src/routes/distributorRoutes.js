const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const controller = require('../controllers/distributorController');

const router = express.Router();
router.use(requireAuth);

const writeRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('contact_email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Contact email must be valid.'),
  body('status').optional().isIn(['active', 'inactive']),
];

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', writeRules, validate, controller.create); // admin + sales_rep, per PRD
router.put('/:id', writeRules, validate, controller.update); // admin + sales_rep, per PRD (includes marking inactive)
router.delete('/:id', requireRole('admin'), controller.remove);

module.exports = router;
