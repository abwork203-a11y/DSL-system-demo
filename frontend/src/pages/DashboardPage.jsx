import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  FileText,
  Info,
  Plus,
} from 'lucide-react';

import { reports, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';

import StatusBadge from '../components/StatusBadge';
import { StatSkeleton, TableSkeleton } from '../components/Skeleton';


function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}


function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}


function formatMonthlyChange(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;

  if (!previousValue) {
    return { text: '— 0% vs last month', direction: 'flat' };
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100;
  const rounded = Math.round(delta * 10) / 10;

  if (rounded > 0) {
    return { text: `+${rounded}% vs last month`, direction: 'up' };
  }

  if (rounded < 0) {
    return { text: `${rounded}% vs last month`, direction: 'down' };
  }

  return { text: '— 0% vs last month', direction: 'flat' };
}


// Rolling 12-month window ending this month — used for the chart's x-axis.
function getLast12MonthLabels() {
  const now = new Date();
  const labels = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
  }

  return labels;
}


// Y-axis scale for the sales chart: nice round steps, $10k floor to match
// the empty-state look until real monthly totals start coming in.
function buildAxisScale(values) {
  const highest = values.length ? Math.max(...values, 0) : 0;
  const rawStep = highest / 5;
  const stepSize = Math.max(10000, Math.ceil(rawStep / 10000) * 10000);

  const steps = [];
  for (let i = 5; i >= 0; i--) {
    steps.push(stepSize * i);
  }

  return { axisMax: stepSize * 5, steps };
}


function formatAxisLabel(value) {
  if (!value) return '$0';
  return `$${Math.round(value / 1000)}k`;
}


export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();

  const monthLabels = getLast12MonthLabels();

  const [summary, setSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState('monthly');


  const load = useCallback(async () => {
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        reports.dashboard(),
        ordersApi.list({ pageSize: 8 }),
      ]);

      setSummary(summaryRes.data);
      setRecentOrders(ordersRes.data.data || []);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    load();
  }, [load]);


  useLiveOrderEvents(() => {
    load();
  });


  const pendingCount =
    summary?.ordersByStatus?.find(
      (s) => s.order_status === 'pending'
    )?.count || 0;


  const currentOrdersCount =
    summary?.ordersByStatus?.find(
      (s) => s.order_status === 'current'
    )?.count || 0;


  const firstName = (user?.name || '').trim().split(/\s+/)[0] || 'there';


  const activeDistributors =
    summary?.distributorsByStatus?.find(
      (s) => s.status === 'active'
    )?.count || 0;


  const monthlyChange = formatMonthlyChange(
    summary?.currentMonth?.totalSales,
    summary?.previousMonth?.totalSales
  );


  // The fields below aren't in the dashboard summary payload yet — they
  // fall back to safe zero/placeholder values until the API adds them.
  const aging = summary?.receivablesAging || {};
  const overdueReceivablesCount = summary?.overdueReceivablesCount ?? 0;
  const accountsNeedReviewCount = summary?.accountsNeedReviewCount ?? 0;
  const distributorsAddedThisMonth = summary?.distributorsAddedThisMonth ?? 0;
  const lastBackupAt = summary?.lastBackupAt || null;


  const salesTrend = Array.isArray(summary?.salesByMonth)
    ? summary.salesByMonth
    : [];

  const hasSalesTrend = salesTrend.some((m) => Number(m?.total) > 0);

  const { axisMax, steps } = buildAxisScale(
    salesTrend.map((m) => Number(m?.total) || 0)
  );

  const chartPoints = hasSalesTrend
    ? salesTrend
        .map((m, i) => {
          const x = (i / Math.max(salesTrend.length - 1, 1)) * 1000;
          const y =
            240 - (Math.min(Number(m?.total) || 0, axisMax) / axisMax) * 240;
          return `${x},${y}`;
        })
        .join(' ')
    : '';


  return (
    <div className="content dashboard-page">

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="dashboard-header">

        <div>
          <h1>Good day, {firstName} 👋</h1>
          <p>Here's what's happening across your distribution network.</p>
        </div>


        <div className="dashboard-header-actions">

          <Link
            to="/orders/new"
            className="btn dashboard-new-order"
          >
            <Plus size={17} strokeWidth={2} />
            New Order
          </Link>

        </div>

      </div>


      {/* =====================================================
          KEY METRICS
          Flat .stat-card pattern (shared with the order detail
          page) — this dashboard's KPI row deliberately has no icons.
      ====================================================== */}

      {loading ? (

        <StatSkeleton count={5} />

      ) : (

        <div className="stat-grid dashboard-stat-grid">

          {/* SALES */}

          <div className="stat-card">
            <div className="stat-label">This Month's Sales</div>

            <div className="stat-card-value">
              <div className="stat-value">
                {money(summary?.currentMonth?.totalSales)}
              </div>
            </div>

            <div
              className={
                monthlyChange.direction === 'flat'
                  ? 'stat-note'
                  : `stat-note ${monthlyChange.direction}`
              }
            >
              {monthlyChange.text}
            </div>
          </div>


          {/* ORDERS */}

          <div className="stat-card">
            <div className="stat-label">Orders This Month</div>

            <div className="stat-card-value">
              <div className="stat-value">
                {summary?.currentMonth?.orderCount ?? 0}
              </div>
            </div>

            <div className="stat-note">{pendingCount} pending</div>
          </div>


          {/* RECEIVABLES */}

          <div className="stat-card">
            <div className="stat-label">Outstanding Receivables</div>

            <div className="stat-card-value">
              <div className="stat-value">
                {money(summary?.totalOutstanding)}
              </div>
            </div>

            <div className="stat-note">
              {overdueReceivablesCount} invoices overdue
            </div>
          </div>


          {/* DISTRIBUTORS */}

          <div className="stat-card">
            <div className="stat-label">Active Distributors</div>

            <div className="stat-card-value">
              <div className="stat-value violet">{activeDistributors}</div>
            </div>

            <div className="stat-note">
              {distributorsAddedThisMonth} added this month
            </div>
          </div>


          {/* PENDING / CURRENT */}

          <div className="stat-card">
            <div className="stat-label">Pending / Current Orders</div>

            <div className="stat-card-value">
              <div className="stat-value">
                {pendingCount} / {currentOrdersCount}
              </div>
            </div>
          </div>

        </div>

      )}


      {/* =====================================================
          SALES PERFORMANCE + RECEIVABLES AGING
      ====================================================== */}

      <div className="dashboard-grid">

        <div className="card dashboard-chart-card">

          <div className="dashboard-card-header">
            <h3>Sales Performance — Last 12 Months</h3>

            <div className="dashboard-chart-period">
              <select
                value={chartRange}
                onChange={(e) => setChartRange(e.target.value)}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <ChevronDown size={14} strokeWidth={2} />
            </div>
          </div>

          <div className="dashboard-chart-body">

            <div className="dashboard-chart-yaxis">
              {steps.map((value) => (
                <span key={value}>{formatAxisLabel(value)}</span>
              ))}
            </div>

            <div className="dashboard-chart-plot">

              <div className="dashboard-chart-gridlines">
                {steps.map((value) => (
                  <span key={value} />
                ))}
              </div>

              {hasSalesTrend ? (
                <svg
                  className="dashboard-chart-svg"
                  viewBox="0 0 1000 240"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="var(--brass)"
                    strokeWidth="2.5"
                  />
                </svg>
              ) : (
                <div className="dashboard-chart-empty">
                  <div className="dashboard-empty-icon">
                    <BarChart3 size={19} strokeWidth={1.7} />
                  </div>
                  <span>No sales data for the selected period.</span>
                </div>
              )}

            </div>

          </div>

          <div className="dashboard-chart-xaxis">
            {monthLabels.map((label, i) => (
              <span key={`${label}-${i}`}>{label}</span>
            ))}
          </div>

        </div>


        <div className="card dashboard-aging-card">

          <div className="dashboard-card-header">
            <h3>Receivables Aging</h3>
          </div>

          <div className="dashboard-aging-list">

            <div className="dashboard-aging-row">
              <span>Current</span>
              <strong>{money(aging.current)}</strong>
            </div>

            <div className="dashboard-aging-row">
              <span>1–30 days</span>
              <strong>{money(aging.days1to30)}</strong>
            </div>

            <div className="dashboard-aging-row">
              <span>31–60 days</span>
              <strong>{money(aging.days31to60)}</strong>
            </div>

            <div className="dashboard-aging-row">
              <span>61–90 days</span>
              <strong>{money(aging.days61to90)}</strong>
            </div>

            <div className="dashboard-aging-row">
              <span>90+ days</span>
              <strong>{money(aging.days90plus)}</strong>
            </div>

            <div className="dashboard-aging-row dashboard-aging-total">
              <span>Total Outstanding</span>
              <strong>{money(summary?.totalOutstanding)}</strong>
            </div>

          </div>

          <div className="dashboard-aging-footer">
            <Link to="/ledger" className="dashboard-card-link">
              View Ledger
              <ArrowRight size={14} />
            </Link>
          </div>

        </div>

      </div>


      {/* =====================================================
          RECENT ORDERS + ACTION REQUIRED
      ====================================================== */}

      <div className="dashboard-grid">

        <div className="card dashboard-orders-card">

          <div className="dashboard-card-header">
            <h3>Recent Orders</h3>

            <Link to="/orders" className="dashboard-card-action">
              View all
              <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (

            <TableSkeleton columns={5} rows={5} />

          ) : (

            <div className="table-wrap">

              <table className="data-table dashboard-orders-table">

                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Distributor</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>

                  {recentOrders.length === 0 ? (

                    <tr className="dashboard-empty-row">
                      <td colSpan={5}>

                        <div className="dashboard-empty">

                          <div className="dashboard-empty-icon">
                            <FileText size={21} strokeWidth={1.7} />
                          </div>

                          <strong>No orders yet. Create your first one to get started.</strong>

                        </div>

                      </td>
                    </tr>

                  ) : (

                    recentOrders.map((order) => (
                      <tr key={order.id}>

                        <td>
                          <Link
                            to={`/orders/${order.id}`}
                            className="dashboard-order-number"
                          >
                            {order.order_number}
                          </Link>
                        </td>

                        <td>
                          {order.distributor_name || '—'}
                        </td>

                        <td>
                          {formatDate(order.order_date)}
                        </td>

                        <td className="num">
                          {money(order.total)}
                        </td>

                        <td>
                          <StatusBadge value={order.order_status} />
                        </td>

                      </tr>
                    ))

                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>


        <div className="card dashboard-action-card">

          <div className="dashboard-card-header">
            <h3>Action Required</h3>
          </div>

          <div className="dashboard-action-list">

            <div className="dashboard-action-row">
              <div className="dashboard-action-icon icon-red">
                <AlertCircle size={16} strokeWidth={1.8} />
              </div>
              <span className="dashboard-action-label">
                {overdueReceivablesCount} overdue receivables
              </span>
              <Link to="/ledger" className="dashboard-action-link red">
                Review
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className="dashboard-action-row">
              <div className="dashboard-action-icon icon-amber">
                <FileText size={16} strokeWidth={1.8} />
              </div>
              <span className="dashboard-action-label">
                {pendingCount} pending orders
              </span>
              <Link to="/orders" className="dashboard-action-link amber">
                Review
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className="dashboard-action-row">
              <div className="dashboard-action-icon icon-blue">
                <Info size={16} strokeWidth={1.8} />
              </div>
              <span className="dashboard-action-label">
                {accountsNeedReviewCount} accounts need review
              </span>
              <Link to="/distributors" className="dashboard-action-link blue">
                Review
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className="dashboard-action-row">
              <div className="dashboard-action-icon icon-green">
                <CheckCircle2 size={16} strokeWidth={1.8} />
              </div>
              <div className="dashboard-action-label-group">
                <span className="dashboard-action-label">
                  All systems operational
                </span>
                <span className="dashboard-action-sublabel">
                  Last backup: {lastBackupAt ? formatDate(lastBackupAt) : 'N/A'}
                </span>
              </div>
              <Link to="/backup" className="dashboard-action-link green">
                Backup
                <ArrowRight size={13} />
              </Link>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
