const express = require('express');
const { body } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const controller = require('../controllers/backupController');
const { withRls } = require('../middleware/rls');

const router = express.Router();
router.use(requireAuth, requireRole('admin')); // matches BackupPage, which is admin-only in the frontend

const createRules = [
  body('folder_name').trim().isLength({ min: 1, max: 300 }),
  body('folder_url').trim().isURL().withMessage('folder_url must be a valid URL.'),
  body('period_start').optional({ nullable: true }).isISO8601().withMessage('period_start must be a date.'),
  body('period_end').optional({ nullable: true }).isISO8601().withMessage('period_end must be a date.'),
  body('file_count').optional().isInt({ min: 0 }),
  body('failed_count').optional().isInt({ min: 0 }),
];

router.get('/', withRls(controller.list));
router.post('/', createRules, validate, withRls(controller.create));

module.exports = router;
