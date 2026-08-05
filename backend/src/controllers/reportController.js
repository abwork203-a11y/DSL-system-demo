const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');

// Dashboard: high-level counts + this month's totals
const dashboardSummary = asyncHandler(async (req, res) => {
  const [orders, receivables, distributors, monthSales] = await Promise.all([
    pool.query(`SELECT order_status, COUNT(*)::int AS count FROM orders GROUP BY order_status`),
    pool.query(`SELECT COALESCE(SUM(balance), 0) AS total_outstanding FROM distributors WHERE balance > 0`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM distributors GROUP BY status`),
    pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS order_count
      FROM orders
      WHERE date_trunc('month', order_date) = date_trunc('month', CURRENT_DATE)
    `),
  ]);

  res.json({
    ordersByStatus: orders.rows,
    totalOutstanding: Number(receivables.rows[0].total_outstanding),
    distributorsByStatus: distributors.rows,
    currentMonth: {
      totalSales: Number(monthSales.rows[0].total),
      orderCount: monthSales.rows[0].order_count,
    },
  });
});

// Monthly sales trend, last N months (default 12)
const monthlySales = asyncHandler(async (req, res) => {
  const months = Number(req.query.months) || 12;
  const result = await pool.query(
    `SELECT
       date_trunc('month', order_date) AS month,
       COALESCE(SUM(total), 0) AS total_sales,
       COUNT(*)::int AS order_count
     FROM orders
     WHERE order_date >= date_trunc('month', CURRENT_DATE) - ($1 || ' months')::interval
       AND order_status != 'cancelled'
     GROUP BY 1
     ORDER BY 1`,
    [months]
  );
  res.json(result.rows);
});

// Sales performance by distributor
const performanceByDistributor = asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query;
  const clauses = ["o.order_status != 'cancelled'"];
  const params = [];
  if (date_from) {
    params.push(date_from);
    clauses.push(`o.order_date >= $${params.length}`);
  }
  if (date_to) {
    params.push(date_to);
    clauses.push(`o.order_date <= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT d.id, d.name, d.zone, d.balance,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.total), 0) AS total_sales
     FROM distributors d
     LEFT JOIN orders o ON o.distributor_id = d.id AND ${clauses.join(' AND ')}
     GROUP BY d.id
     ORDER BY total_sales DESC`,
    params
  );
  res.json(result.rows);
});

// Sales performance by sales rep
const performanceByRep = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.total), 0) AS total_sales
     FROM users u
     LEFT JOIN orders o ON o.created_by = u.id AND o.order_status != 'cancelled'
     WHERE u.role = 'sales_rep'
     GROUP BY u.id
     ORDER BY total_sales DESC`
  );
  res.json(result.rows);
});

// Top products by revenue
const topProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const result = await pool.query(
    `SELECT p.id, p.name, m.name AS manufacturer_name,
            SUM(oi.quantity)::numeric AS total_quantity,
            SUM(oi.line_total)::numeric AS total_revenue
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN manufacturers m ON m.id = p.manufacturer_id
     JOIN orders o ON o.id = oi.order_id AND o.order_status != 'cancelled'
     GROUP BY p.id, m.name
     ORDER BY total_revenue DESC
     LIMIT $1`,
    [limit]
  );
  res.json(result.rows);
});

module.exports = { dashboardSummary, monthlySales, performanceByDistributor, performanceByRep, topProducts };
