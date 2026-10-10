const PDFDocument = require('pdfkit');
const { asyncHandler } = require('../utils/asyncHandler');

// PDF versions of the three list exports on the Reports page (products,
// distributors, orders). The Excel versions live in exportController.js.
// Same pattern as the ledger PDFs: the data is fetched FIRST (so a failure is
// still a normal JSON error), then the document is streamed straight to `res`.
// These run inside withRlsReadOnly, so req.db is the RLS-scoped client.

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// pg returns `date` columns as JS Dates at local midnight, so read the local parts.
function dateText(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

// Generic "title + table" PDF.
//   columns: [{ header, key, weight (relative width), align: 'left' | 'right', format?: (value, row) => string }]
function sendTablePdf(res, { filename, title, columns, rows }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  doc.pipe(res);

  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const usableWidth = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 16; // leave room for the page-number footer
  const totalWeight = columns.reduce((sum, c) => sum + (c.weight || 1), 0);
  const widths = columns.map((c) => (usableWidth * (c.weight || 1)) / totalWeight);
  const ROW_H = 20;
  const PAD = 6;

  const cellText = (text, colIndex, y, font, color) => {
    const col = columns[colIndex];
    const x = left + widths.slice(0, colIndex).reduce((a, b) => a + b, 0);
    doc.font(font).fontSize(9).fillColor(color).text(String(text ?? ''), x + PAD, y + 6, {
      width: widths[colIndex] - PAD * 2,
      height: 11, // one line tall: longer text is cut with "…" instead of wrapping into the next row
      ellipsis: true,
      align: col.align || 'left',
    });
  };

  const drawHeaderRow = (y) => {
    doc.rect(left, y, usableWidth, ROW_H).fill('#2F5D50');
    columns.forEach((c, i) => cellText(c.header, i, y, 'Helvetica-Bold', '#FFFFFF'));
    return y + ROW_H;
  };

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1B211D').text(title, left, top);
  doc.font('Helvetica').fontSize(9).fillColor('#656F63')
    .text(`Generated ${dateText(new Date())} · ${rows.length} row${rows.length === 1 ? '' : 's'}`, left, top + 22);

  let y = drawHeaderRow(top + 44);

  rows.forEach((row, rowIndex) => {
    if (y + ROW_H > bottomLimit) {
      doc.addPage();
      y = drawHeaderRow(top);
    }
    if (rowIndex % 2 === 1) doc.rect(left, y, usableWidth, ROW_H).fill('#F4F4EE');
    columns.forEach((c, i) => {
      const raw = row[c.key];
      cellText(c.format ? c.format(raw, row) : raw, i, y, 'Helvetica', '#1B211D');
    });
    y += ROW_H;
  });

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#656F63').text('No records.', left + PAD, y + 8);
  }

  // Page numbers. The bottom margin is zeroed while writing the footer because
  // pdfkit starts a new page if text lands inside the bottom margin.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#656F63')
      .text(`Page ${i - range.start + 1} of ${range.count}`, left, doc.page.height - 28, { width: usableWidth, align: 'right' });
  }

  doc.end();
}

const productsPdf = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT p.name, m.name AS manufacturer, p.size_packaging, p.price, p.is_active
     FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id ORDER BY p.name`
  );
  sendTablePdf(res, {
    filename: 'products.pdf',
    title: 'Products',
    columns: [
      { header: 'Product', key: 'name', weight: 3 },
      { header: 'Manufacturer', key: 'manufacturer', weight: 2 },
      { header: 'Size / Packaging', key: 'size_packaging', weight: 2 },
      { header: 'Price', key: 'price', weight: 1, align: 'right', format: money },
      { header: 'Status', key: 'is_active', weight: 1, format: (v) => (v ? 'Active' : 'Inactive') },
    ],
    rows: result.rows,
  });
});

const distributorsPdf = asyncHandler(async (req, res) => {
  // The zone name is read from the zones table (COALESCE falls back to the old
  // text column), because distributors saved after the zones change only have zone_id.
  const result = await req.db.query(
    `SELECT d.name, COALESCE(z.name, d.zone) AS zone, d.city, d.contact_name, d.contact_phone, d.balance, d.status
     FROM distributors d LEFT JOIN zones z ON z.id = d.zone_id
     ORDER BY d.name`
  );
  sendTablePdf(res, {
    filename: 'distributors.pdf',
    title: 'Distributors',
    columns: [
      { header: 'Distributor', key: 'name', weight: 3 },
      { header: 'Zone', key: 'zone', weight: 1.5 },
      { header: 'City', key: 'city', weight: 1.5 },
      { header: 'Contact', key: 'contact_name', weight: 2 },
      { header: 'Phone', key: 'contact_phone', weight: 1.8 },
      { header: 'Balance', key: 'balance', weight: 1.4, align: 'right', format: money },
      { header: 'Status', key: 'status', weight: 1 },
    ],
    rows: result.rows,
  });
});

const ordersPdf = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT o.order_number, d.name AS distributor, o.order_date, o.total, o.payment_term,
            o.payment_status, o.order_status
     FROM orders o JOIN distributors d ON d.id = o.distributor_id
     ORDER BY o.order_date DESC, o.id DESC`
  );
  sendTablePdf(res, {
    filename: 'orders.pdf',
    title: 'Orders',
    columns: [
      { header: 'Order', key: 'order_number', weight: 1.6 },
      { header: 'Distributor', key: 'distributor', weight: 3 },
      { header: 'Date', key: 'order_date', weight: 1.4, format: dateText },
      { header: 'Total', key: 'total', weight: 1.4, align: 'right', format: money },
      { header: 'Payment Term', key: 'payment_term', weight: 1.5 },
      { header: 'Payment', key: 'payment_status', weight: 1.3 },
      { header: 'Status', key: 'order_status', weight: 1.3 },
    ],
    rows: result.rows,
  });
});

module.exports = { productsPdf, distributorsPdf, ordersPdf };
