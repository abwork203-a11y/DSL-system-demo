const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/ledgerController');

const router = express.Router();
router.use(requireAuth);

router.get('/', controller.list);
router.get('/distributor/:id', controller.distributorSummary);

module.exports = router;
