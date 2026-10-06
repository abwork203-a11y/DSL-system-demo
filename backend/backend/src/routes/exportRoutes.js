const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/exportController');

const router = express.Router();
router.use(requireAuth);

router.get('/invoice/:id/excel', controller.invoiceExcel);
router.get('/invoice/:id/pdf', controller.invoicePdf);

router.get('/products', requireRole('admin'), controller.exportProducts);
router.get('/distributors', requireRole('admin'), controller.exportDistributors);
router.get('/orders', requireRole('admin'), controller.exportOrders);
router.get('/ledger/excel', requireRole('admin'), controller.exportLedgerExcel);
router.get('/ledger/pdf', requireRole('admin'), controller.exportLedgerPdf);
router.get('/ledger/distributor/:id/excel', requireRole('admin'), controller.exportDistributorLedgerExcel);
router.get('/ledger/distributor/:id/pdf', requireRole('admin'), controller.exportDistributorLedgerPdf);

module.exports = router;
