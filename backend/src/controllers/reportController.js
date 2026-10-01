const { asyncHandler } = require('../utils/asyncHandler');

// Dashboard: high-level counts + this month's totals
//
// Was Promise.all([pool.query(...), pool.query(...), ...]) — fine with
// `pool`, since each call transparently checks out its own connection and
// they genuinely run in parallel. req.db is a single checked-out client
// for this whole transaction, not a pool — it can only run one query at a
// time, so firing four at once against it doesn't parallelize anything,
// it just races them against the same connection (hence the
// "client is already executing a query" deprecation warning). Sequential
// awaits below — four small queries in series costs nothing worth
// preserving the old concurrency for for a dashboard fetch.
const dashboardSummary = asyncHandler(async (req, res) => {
  const orders = await req.db.query(`SELECT order_status, COUNT(*)::int AS count FROM orders GROUP BY order_status`);
  const receivables = await req.db.query(`SELECT COALESCE(SUM(balance), 0) AS total_outstanding FROM distributors WHERE balance > 0`);
  const distributors = await req.db.query(`SELECT status, COUNT(*)::int AS count FROM distributors GROUP BY status`);
  const monthSales = await req.db.query(`
      SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS order_count
      FROM orders
      WHERE date_trunc('month', order_date) = date_trunc('month', CURRENT_DATE)
        AND order_status != 'cancelled'
        AND payment_status != 'unpaid'
    `);

  req.respond(200, {
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
// admin-only route (see reportRoutes.js) — RLS is a no-op for the only
// caller who can reach this, so no zone behavior to reason about here.
const monthlySales = asyncHandler(async (req, res) => {
  const months = Number(req.query.months) || 12;
  const result = await req.db.query(
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
  req.respond(200, result.rows);
});

// Sales performance by distributor — admin-only route (see reportRoutes.js)
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

  const result = await req.db.query(
    `SELECT d.id, d.name, d.zone, d.balance,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.total), 0) AS total_sales
     FROM distributors d
     LEFT JOIN orders o ON o.distributor_id = d.id AND ${clauses.join(' AND ')}
     GROUP BY d.id
     ORDER BY total_sales DESC`,
    params
  );
  req.respond(200, result.rows);
});

// Sales performance by sales rep — admin-only route (see reportRoutes.js).
// Deliberately kept that way rather than opened up to reps: this compares
// every rep against every other rep company-wide, which only means
// something to someone who can see the whole company. A rep viewing this
// would have every other rep's row zone-filtered down to just the orders
// that happen to overlap their own zones — silently wrong, not just
// restricted, so this isn't a "loosen the role check" candidate later
// without redesigning the query itself.
const performanceByRep = asyncHandler(async (req, res) => {
  const result = await req.db.query(
    `SELECT u.id, u.name,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.total), 0) AS total_sales
     FROM users u
     LEFT JOIN orders o ON o.created_by = u.id AND o.order_status != 'cancelled'
     WHERE u.role = 'sales_rep'
     GROUP BY u.id
     ORDER BY total_sales DESC`
  );
  req.respond(200, result.rows);
});

// Top products by revenue — admin-only route (see reportRoutes.js)
const topProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const result = await req.db.query(
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
  req.respond(200, result.rows);
});

module.exports = { dashboardSummary, monthlySales, performanceByDistributor, performanceByRep, topProducts };