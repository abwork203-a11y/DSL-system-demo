const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/auditController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', controller.list);

module.exports = router;
