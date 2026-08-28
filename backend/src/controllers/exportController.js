const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');

// Excel (and other spreadsheet apps) treat a cell starting with =, +, -, or @
// as a formula. If a distributor/product/manufacturer name or a note field
// were ever set to something like `=HYPERLINK("http://evil","click")`, an
// export could hand back a live, executing formula to whoever opens it —
// this is the well-known "CSV/formula injection" class of vulnerability.
// Prefixing such values with a leading apostrophe forces spreadsheet software
// to treat them as plain text instead of evaluating them.
const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@'];
function sanitizeCellValue(value) {
  if (typeof value !== 'string') return value;
  return FORMULA_TRIGGER_CHARS.includes(value[0]) ? `'${value}` : value;
}
function sanitizeRow(row) {
  if (Array.isArray(row)) return row.map(sanitizeCellValue);
  const out = {};
  for (const [key, val] of Object.entries(row)) out[key] = sanitizeCellValue(val);
  return out;
}

async function getOrderWithItems(orderId) {
  const orderResult = await pool.query(
    `SELECT o.*, d.name AS distributor_name, d.contact_name AS distributor_contact,
            d.contact_phone AS distributor_phone, d.city, d.area, d.zone,
            u.name AS created_by_name
     FROM orders o
     JOIN distributors d ON d.id = o.distributor_id
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) return null;

  const itemsResult = await pool.query(
    `SELECT oi.*, p.name AS product_name, p.size_packaging, m.name AS manufacturer_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN manufacturers m ON m.id = oi.manufacturer_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  );

  return { ...orderResult.rows[0], items: itemsResult.rows };
}

// Given an order row, compute the actual dollar discount amount, regardless
// of whether the order stores a flat amount or a percentage.
function computeDiscountAmount(order, grossValue) {
  const rawDiscount = Number(order.discount) || 0;
  if (order.discount_type === 'percentage') {
    return grossValue * (rawDiscount / 100);
  }
  return rawDiscount;
}

// ── Invoice: Excel ──────────────────────────────────────────
const invoiceExcel = asyncHandler(async (req, res) => {
  const order = await getOrderWithItems(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoice');

  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = `Invoice ${order.order_number}`;
  sheet.getCell('A1').font = { size: 16, bold: true };

  sheet.getCell('A3').value = 'Distributor:';
  sheet.getCell('B3').value = sanitizeCellValue(order.distributor_name);
  sheet.getCell('A4').value = 'Date:';
  sheet.getCell('B4').value = new Date(order.order_date).toLocaleDateString();
  sheet.getCell('A5').value = 'Payment Term:';
  sheet.getCell('B5').value = order.payment_term;
  sheet.getCell('A6').value = 'Payment Status:';
  sheet.getCell('B6').value = order.payment_status;

  sheet.addRow([]);
  const headerRow = sheet.addRow(['Sr#', 'Product', 'Retail Price', 'Invoice Price', 'Qty', 'Value']);
  headerRow.font = { bold: true };

  let grossValue = 0;
  order.items.forEach((item, index) => {
    const qty = Number(item.quantity);
    const invoicePrice = Number(item.price_at_time_of_order);
    const retailPrice = Number(item.retail_price_at_time_of_order);
    const value = invoicePrice * qty;
    grossValue += value;

    const productLabel = item.size_packaging
      ? `${item.product_name} (${item.size_packaging})`
      : item.product_name;

    sheet.addRow(sanitizeRow([
      index + 1,
      productLabel,
      retailPrice,
      invoicePrice,
      qty,
      value,
    ]));
  });

  const discount = computeDiscountAmount(order, grossValue);
  const freight = Number(order.freight_cost) || 0;
  const netValue = Number(order.total);

  sheet.addRow([]);
  sheet.addRow(['', '', '', '', 'Gross Value', grossValue]);
  sheet.addRow(['', '', '', '', 'Discount', -discount]);
  sheet.addRow(['', '', '', '', 'Freight', freight]);
  const totalRow = sheet.addRow(['', '', '', '', 'Net Value', netValue]);
  totalRow.font = { bold: true };

  sheet.columns.forEach((col) => { col.width = 20; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.order_number}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

// ── Invoice: PDF ────────────────────────────────────────────
const invoicePdf = asyncHandler(async (req, res) => {
  const order = await getOrderWithItems(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.order_number}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text(`Invoice ${order.order_number}`, { align: 'left' });
  doc.moveDown();
  doc.fontSize(11)
    .text(`Distributor: ${order.distributor_name}`)
    .text(`Date: ${new Date(order.order_date).toLocaleDateString()}`)
    .text(`Payment Term: ${order.payment_term}`)
    .text(`Payment Status: ${order.payment_status}`);
  doc.moveDown();

  const tableTop = doc.y;
  const cols = { sr: 50, product: 90, retail: 280, invoice: 360, qty: 440, value: 480 };
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Sr#', cols.sr, tableTop);
  doc.text('Product', cols.product, tableTop);
  doc.text('Retail Price', cols.retail, tableTop);
  doc.text('Invoice Price', cols.invoice, tableTop);
  doc.text('Qty', cols.qty, tableTop);
  doc.text('Value', cols.value, tableTop);
  doc.moveDown(0.5);
  doc.font('Helvetica');

  let grossValue = 0;
  order.items.forEach((item, index) => {
    const y = doc.y;
    const qty = Number(item.quantity);
    const invoicePrice = Number(item.price_at_time_of_order);
    const retailPrice = Number(item.retail_price_at_time_of_order);
    const value = invoicePrice * qty;
    grossValue += value;

    doc.text(String(index + 1), cols.sr, y);
    doc.text(`${item.product_name}${item.size_packaging ? ` (${item.size_packaging})` : ''}`, cols.product, y, { width: 180 });
    doc.text(retailPrice.toFixed(2), cols.retail, y);
    doc.text(invoicePrice.toFixed(2), cols.invoice, y);
    doc.text(String(qty), cols.qty, y);
    doc.text(value.toFixed(2), cols.value, y);
    doc.moveDown();
  });

  const discount = computeDiscountAmount(order, grossValue);
  const freight = Number(order.freight_cost) || 0;
  const netValue = Number(order.total);

  doc.moveDown();
  doc.moveDown();
  doc.font('Helvetica-Bold');
  doc.text(`Gross Value: ${grossValue.toFixed(2)}`, { align: 'left' });
  doc.text(`Discount: -${discount.toFixed(2)}`, { align: 'left' });
  doc.text(`Freight: ${freight.toFixed(2)}`, { align: 'left' });
  doc.text(`Net Value: ${netValue.toFixed(2)}`, { align: 'left' });

  doc.end();
});

// ── Generic bulk export helper: rows -> xlsx ───────────────
async function sendExcel(res, filename, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(sanitizeRow(row)));
  sheet.columns.forEach((col) => { col.width = Math.max(col.width || 10, 18); });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  await workbook.xlsx.write(res);
  res.end();
}

const exportProducts = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.name, m.name AS manufacturer, p.size_packaging, p.price, p.is_active
     FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id ORDER BY p.name`
  );
  await sendExcel(res, 'products.xlsx', [
    { header: 'Product', key: 'name' },
    { header: 'Manufacturer', key: 'manufacturer' },
    { header: 'Size/Packaging', key: 'size_packaging' },
    { header: 'Price', key: 'price' },
    { header: 'Active', key: 'is_active' },
  ], result.rows);
});

const exportDistributors = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT name, zone, city, contact_name, contact_phone, balance, status FROM distributors ORDER BY name');
  await sendExcel(res, 'distributors.xlsx', [
    { header: 'Distributor', key: 'name' },
    { header: 'Zone', key: 'zone' },
    { header: 'City', key: 'city' },
    { header: 'Contact', key: 'contact_name' },
    { header: 'Phone', key: 'contact_phone' },
    { header: 'Balance', key: 'balance' },
    { header: 'Status', key: 'status' },
  ], result.rows);
});

const exportOrders = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT o.order_number, d.name AS distributor, o.order_date, o.total, o.payment_term,
            o.payment_status, o.order_status
     FROM orders o JOIN distributors d ON d.id = o.distributor_id
     ORDER BY o.order_date DESC`
  );
  await sendExcel(res, 'orders.xlsx', [
    { header: 'Order #', key: 'order_number' },
    { header: 'Distributor', key: 'distributor' },
    { header: 'Date', key: 'order_date' },
    { header: 'Total', key: 'total' },
    { header: 'Payment Term', key: 'payment_term' },
    { header: 'Payment Status', key: 'payment_status' },
    { header: 'Order Status', key: 'order_status' },
  ], result.rows);
});

// ── Ledger: generic bulk export (all distributors, or filtered) ───
const exportLedger = asyncHandler(async (req, res) => {
  const { distributor_id } = req.query;
  const params = [];
  let where = '';
  if (distributor_id) {
    params.push(distributor_id);
    where = `WHERE l.distributor_id = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT d.name AS distributor, l.entry_date, l.type, l.amount, l.running_balance, l.note
     FROM ledger l JOIN distributors d ON d.id = l.distributor_id
     ${where}
     ORDER BY l.entry_date ASC`,
    params
  );

  const rows = result.rows.map((entry) => ({
    distributor: entry.distributor,
    entry_date: new Date(entry.entry_date).toLocaleDateString(),
    type: entry.type,
    debit: entry.type === 'debit' ? Number(entry.amount) : '',
    credit: entry.type === 'credit' ? Number(entry.amount) : '',
    running_balance: Number(entry.running_balance),
    note: entry.note,
  }));

  await sendExcel(res, 'ledger.xlsx', [
    { header: 'Distributor', key: 'distributor' },
    { header: 'Date', key: 'entry_date' },
    { header: 'Type', key: 'type' },
    { header: 'Debit', key: 'debit' },
    { header: 'Credit', key: 'credit' },
    { header: 'Running Balance', key: 'running_balance' },
    { header: 'Note', key: 'note' },
  ], rows);
});

// ── Ledger: single-distributor "Customer Ledger" statement ────────
// NOTE: this mirrors the query shape used by ledgerController.js's
// `distributorSummary` (distributor lookup + ledger entries filtered by
// distributor_id and an optional date range). If `distributorSummary` sources
// its data differently (e.g. a different running-balance calculation or a
// view/materialized table instead of the raw `ledger` table), point this
// query at the same source before shipping — it wasn't available to check
// against here.
const exportDistributorLedger = asyncHandler(async (req, res) => {
  const { id: distributorId } = req.params;
  const { start_date, end_date } = req.query;

  const distributorResult = await pool.query(
    'SELECT id, name FROM distributors WHERE id = $1',
    [distributorId]
  );
  if (distributorResult.rows.length === 0) throw new ApiError(404, 'Distributor not found.');
  const distributor = distributorResult.rows[0];

  const params = [distributorId];
  let dateWhere = '';
  if (start_date) {
    params.push(start_date);
    dateWhere += ` AND l.entry_date >= $${params.length}`;
  }
  if (end_date) {
    params.push(end_date);
    dateWhere += ` AND l.entry_date <= $${params.length}`;
  }

  const entriesResult = await pool.query(
    `SELECT l.entry_date, l.type, l.amount, l.running_balance, l.note
     FROM ledger l
     WHERE l.distributor_id = $1 ${dateWhere}
     ORDER BY l.entry_date ASC`,
    params
  );
  const entries = entriesResult.rows;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customer Ledger');

  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = 'Customer Ledger';
  sheet.getCell('A1').font = { size: 16, bold: true };

  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = sanitizeCellValue(distributor.name);
  sheet.getCell('A2').font = { size: 12, bold: true };

  sheet.mergeCells('A3:F3');
  if (start_date && end_date) {
    sheet.getCell('A3').value = `From ${start_date} to ${end_date}`;
  } else if (start_date) {
    sheet.getCell('A3').value = `From ${start_date}`;
  } else if (end_date) {
    sheet.getCell('A3').value = `To ${end_date}`;
  } else {
    sheet.getCell('A3').value = 'All activity';
  }

  sheet.addRow([]);
  const headerRow = sheet.addRow(['Date', 'Description', 'Debit', 'Credit', 'Balance', 'Remarks']);
  headerRow.font = { bold: true };

  let totalDebit = 0;
  let totalCredit = 0;
  let lastBalance = 0;

  entries.forEach((entry) => {
    const isDebit = entry.type === 'debit';
    const amount = Number(entry.amount);
    const runningBalance = Number(entry.running_balance);
    lastBalance = runningBalance;
    if (isDebit) totalDebit += amount; else totalCredit += amount;

    const remarks = runningBalance > 0 ? 'Dr' : runningBalance < 0 ? 'Cr' : '';

    sheet.addRow(sanitizeRow([
      new Date(entry.entry_date).toLocaleDateString(),
      entry.note,
      isDebit ? amount : '',
      isDebit ? '' : amount,
      runningBalance,
      remarks,
    ]));
  });

  const finalRemarks = lastBalance > 0 ? 'Dr' : lastBalance < 0 ? 'Cr' : '';
  const totalRow = sheet.addRow(['Total', '', totalDebit, totalCredit, lastBalance, finalRemarks]);
  totalRow.font = { bold: true };

  sheet.columns.forEach((col) => { col.width = 20; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=ledger-${distributor.name.replace(/[^a-z0-9]+/gi, '-')}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = {
  invoiceExcel,
  invoicePdf,
  exportProducts,
  exportDistributors,
  exportOrders,
  exportLedger,
  exportDistributorLedger,
};
