const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { withRlsReadOnly } = require('../middleware/rls');
const controller = require('../controllers/exportController');
const pdfController = require('../controllers/exportPdfController');

const router = express.Router();
router.use(requireAuth);

router.get('/invoice/:id/excel', withRlsReadOnly(controller.invoiceExcel));
router.get('/invoice/:id/pdf', withRlsReadOnly(controller.invoicePdf));

router.get('/products', requireRole('admin'), withRlsReadOnly(controller.exportProducts));
router.get('/distributors', requireRole('admin'), withRlsReadOnly(controller.exportDistributors));
router.get('/orders', requireRole('admin'), withRlsReadOnly(controller.exportOrders));
// PDF versions of the three list exports above (Reports page "Download" popup)
router.get('/products/pdf', requireRole('admin'), withRlsReadOnly(pdfController.productsPdf));
router.get('/distributors/pdf', requireRole('admin'), withRlsReadOnly(pdfController.distributorsPdf));
router.get('/orders/pdf', requireRole('admin'), withRlsReadOnly(pdfController.ordersPdf));
router.get('/ledger/excel', requireRole('admin'), withRlsReadOnly(controller.exportLedgerExcel));
router.get('/ledger/pdf', requireRole('admin'), withRlsReadOnly(controller.exportLedgerPdf));
router.get('/ledger/distributor/:id/excel', requireRole('admin'), withRlsReadOnly(controller.exportDistributorLedgerExcel));
router.get('/ledger/distributor/:id/pdf', requireRole('admin'), withRlsReadOnly(controller.exportDistributorLedgerPdf));

module.exports = router;
