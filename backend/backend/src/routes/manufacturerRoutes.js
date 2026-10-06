const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const controller = require('../controllers/manufacturerController');

const router = express.Router();
router.use(requireAuth);

const writeRules = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters.'),
  body('contact_email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Contact email must be valid.'),
  body('balance').optional().isFloat({ min: -1000000000, max: 1000000000 }).withMessage('Balance must be a number.'),
];

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', requireRole('admin'), writeRules, validate, controller.create);
router.put('/:id', requireRole('admin'), writeRules, validate, controller.update);
router.delete('/:id', requireRole('admin'), controller.remove);

module.exports = router;
