const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/ledgerController');

const router = express.Router();
router.use(requireAuth);

router.get('/', withRls(controller.list));
router.get('/distributor/:id', withRls(controller.distributorSummary));

module.exports = router;
