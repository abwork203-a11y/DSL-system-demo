const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/reportController');

const router = express.Router();
router.use(requireAuth);

// Everyone lands on a dashboard after login (see PRD workflow step 2)
router.get('/dashboard', controller.dashboardSummary);

// Deeper performance/reporting views are admin-only (PRD: Users > Admin has "reports")
router.get('/monthly-sales', requireRole('admin'), controller.monthlySales);
router.get('/performance/distributors', requireRole('admin'), controller.performanceByDistributor);
router.get('/performance/reps', requireRole('admin'), controller.performanceByRep);
router.get('/top-products', requireRole('admin'), controller.topProducts);

module.exports = router;
