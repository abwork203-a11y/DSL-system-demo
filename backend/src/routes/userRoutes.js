const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const userController = require('../controllers/userController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const createRules = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Name is required.'),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep.'),
  body('assigned_zone').optional({ nullable: true }).trim().isLength({ max: 100 }),
];

const updateRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('password').optional({ nullable: true }).isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters.'),
  body('role').optional().isIn(['admin', 'sales_rep']).withMessage('Role must be admin or sales_rep.'),
  body('assigned_zone').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('is_active').optional().isBoolean(),
];

router.get('/', userController.list);
router.post('/', createRules, validate, userController.create);
router.put('/:id', updateRules, validate, userController.update);
router.delete('/:id', userController.remove);

module.exports = router;
