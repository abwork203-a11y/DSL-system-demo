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

// ── Invoice: Excel ──────────────────────────────────────────
const invoiceExcel = asyncHandler(async (req, res) => {
  const order = await getOrderWithItems(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invoice');

  sheet.mergeCells('A1:E1');
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
  const headerRow = sheet.addRow(['Manufacturer', 'Product', 'Size/Packaging', 'Qty', 'Unit Price', 'Line Total']);
  headerRow.font = { bold: true };

  order.items.forEach((item) => {
    sheet.addRow(sanitizeRow([
      item.manufacturer_name,
      item.product_name,
      item.size_packaging,
      Number(item.quantity),
      Number(item.price_at_time_of_order),
      Number(item.line_total),
    ]));
  });

  sheet.addRow([]);
  sheet.addRow(['', '', '', '', 'Subtotal', Number(order.subtotal)]);
  sheet.addRow(['', '', '', '', 'Discount', -Number(order.discount)]);
  sheet.addRow(['', '', '', '', 'Freight', Number(order.freight_cost)]);
  const totalRow = sheet.addRow(['', '', '', '', 'Total', Number(order.total)]);
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
  const cols = { mfg: 50, product: 150, qty: 320, price: 380, total: 460 };
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Manufacturer', cols.mfg, tableTop);
  doc.text('Product', cols.product, tableTop);
  doc.text('Qty', cols.qty, tableTop);
  doc.text('Price', cols.price, tableTop);
  doc.text('Total', cols.total, tableTop);
  doc.moveDown(0.5);
  doc.font('Helvetica');

  order.items.forEach((item) => {
    const y = doc.y;
    doc.text(item.manufacturer_name, cols.mfg, y, { width: 95 });
    doc.text(`${item.product_name}${item.size_packaging ? ` (${item.size_packaging})` : ''}`, cols.product, y, { width: 165 });
    doc.text(String(Number(item.quantity)), cols.qty, y);
    doc.text(Number(item.price_at_time_of_order).toFixed(2), cols.price, y);
    doc.text(Number(item.line_total).toFixed(2), cols.total, y);
    doc.moveDown();
  });

  doc.moveDown();
  doc.font('Helvetica-Bold');
  doc.text(`Subtotal: ${Number(order.subtotal).toFixed(2)}`, { align: 'right' });
  doc.text(`Discount: -${Number(order.discount).toFixed(2)}`, { align: 'right' });
  doc.text(`Freight: ${Number(order.freight_cost).toFixed(2)}`, { align: 'right' });
  doc.text(`Total: ${Number(order.total).toFixed(2)}`, { align: 'right' });

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
     ORDER BY l.entry_date DESC`,
    params
  );
  await sendExcel(res, 'ledger.xlsx', [
    { header: 'Distributor', key: 'distributor' },
    { header: 'Date', key: 'entry_date' },
    { header: 'Type', key: 'type' },
    { header: 'Amount', key: 'amount' },
    { header: 'Running Balance', key: 'running_balance' },
    { header: 'Note', key: 'note' },
  ], result.rows);
});

module.exports = { invoiceExcel, invoicePdf, exportProducts, exportDistributors, exportOrders, exportLedger };
