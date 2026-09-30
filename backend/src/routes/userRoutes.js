const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const userController = require('../controllers/userController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const createRules = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Name is required.'),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep.'),
  body('zone_ids').optional().isArray().withMessage('zone_ids must be an array.'),
  body('zone_ids.*').isInt().withMessage('Each zone_id must be an integer.'),
];

const updateRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('password').optional({ nullable: true }).isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters.'),
  body('role').optional().isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep.'),
  body('is_active').optional().isBoolean(),
  body('zone_ids').optional().isArray().withMessage('zone_ids must be an array.'),
  body('zone_ids.*').isInt().withMessage('Each zone_id must be an integer.'),
];

router.get('/', withRls(userController.list));
router.post('/', createRules, validate, withRls(userController.create));
router.put('/:id', updateRules, validate, withRls(userController.update));
router.delete('/:id', withRls(userController.remove));

module.exports = router;
