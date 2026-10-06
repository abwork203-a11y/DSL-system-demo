const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { cacheRoute } = require('../utils/cache');
const controller = require('../controllers/reportController');

const router = express.Router();
router.use(requireAuth);

// 30s TTL: short enough that nobody perceives the dashboard as "stale," long
// enough to absorb the request bursts that happen naturally (someone opens
// the app, the dashboard fires 4-5 queries, then navigates to Orders and
// back a minute later). Explicitly invalidated on order/payment writes too
// (see orderController.js) so a just-created order shows up immediately
// rather than waiting out the TTL.
router.get('/dashboard', cacheRoute(30_000), controller.dashboardSummary);
router.get('/monthly-sales', requireRole('admin'), cacheRoute(30_000), controller.monthlySales);
router.get('/performance/distributors', requireRole('admin'), cacheRoute(30_000), controller.performanceByDistributor);
router.get('/performance/reps', requireRole('admin'), cacheRoute(30_000), controller.performanceByRep);
router.get('/top-products', requireRole('admin'), cacheRoute(30_000), controller.topProducts);

module.exports = router;
