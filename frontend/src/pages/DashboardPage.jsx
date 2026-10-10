import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Plus,
  Eye,
  Calendar,
} from 'lucide-react';

import { reports, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';

import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import MonthPicker from '../components/MonthPicker';
import { currentMonthValue, monthLabel } from '../utils/months';
import { StatSkeleton, TableSkeleton } from '../components/Skeleton';


function money(n) {
  return `PKR ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Stat cards render the "PKR" prefix and the figure as two separately-styled
// pieces on one line (see .stat-value / .stat-currency) instead of one long
// string — the string form was wrapping mid-value on narrower cards, putting
// "PKR" on its own line and pushing the actual number down, which threw off
// vertical alignment against the plain-number cards next to it.
function moneyAmount(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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


function formatChange(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;

  if (!previousValue) {
    return { text: 'vs last month 0%', direction: 'flat' };
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100;
  const rounded = Math.round(delta * 10) / 10;

  if (rounded > 0) {
    return { text: `vs last month +${rounded}%`, direction: 'up' };
  }

  if (rounded < 0) {
    return { text: `vs last month ${rounded}%`, direction: 'down' };
  }

  return { text: 'vs last month 0%', direction: 'flat' };
}


export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [summary, setSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonthValue()); // 'YYYY-MM'
  const [pickerOpen, setPickerOpen] = useState(false);


  const load = useCallback(async () => {
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        reports.dashboard(month),
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
  }, [month]);


  // Runs on first load and every time the month changes (load is rebuilt when
  // `month` changes). The skeleton is shown only for this path, not for live
  // order events below, so the page doesn't flash on every incoming order.
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);


  useLiveOrderEvents(() => {
    load();
  });


  const firstName = user?.name?.split(' ')[0] || 'there';

  const isCurrentMonth = month === currentMonthValue();
  const periodShort = monthLabel(month, true);


  const pendingCount =
    summary?.ordersByStatus?.find(
      (s) => s.order_status === 'pending'
    )?.count || 0;


  const currentCount =
    summary?.ordersByStatus?.find(
      (s) => s.order_status === 'current'
    )?.count || 0;


  const activeDistributors =
    summary?.distributorsByStatus?.find(
      (s) => s.status === 'active'
    )?.count || 0;


  const salesChange = formatChange(
    summary?.currentMonth?.totalSales,
    summary?.previousMonth?.totalSales
  );

  const ordersChange = formatChange(
    summary?.currentMonth?.orderCount,
    summary?.previousMonth?.orderCount
  );


  return (
    <div className="content dashboard-page">

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="dashboard-header">

        <div>
          <h1>Dashboard</h1>
          <p>Here's what's happening across your distribution network.</p>
        </div>

        <div className="page-header-actions">

          <button
            type="button"
            className="btn btn-secondary dashboard-period-btn"
            onClick={() => setPickerOpen(true)}
            title="Choose month"
            aria-label={`Choose month (showing ${monthLabel(month)})`}
          >
            <Calendar size={17} strokeWidth={2} />
            {!isCurrentMonth && <span>{periodShort}</span>}
          </button>

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
      ====================================================== */}

      {loading ? (

        <StatSkeleton count={5} />

      ) : (

        <div className="stat-grid dashboard-stat-grid">

          <div className="stat-card">
            <div className="stat-label">{isCurrentMonth ? "This Month's Sales" : `Sales — ${periodShort}`}</div>
            <div className="stat-value">
              <span className="stat-currency">PKR</span>
              <span>{moneyAmount(summary?.currentMonth?.totalSales)}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">{isCurrentMonth ? 'Orders This Month' : `Orders — ${periodShort}`}</div>
            <div className="stat-value">
              {summary?.currentMonth?.orderCount ?? 0}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Outstanding Receivables</div>
            <div className="stat-value">
              <span className="stat-currency">PKR</span>
              <span>{moneyAmount(summary?.totalOutstanding)}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Active Distributors</div>
            <div className="stat-value violet">
              {activeDistributors}
            </div>
          </div>

            <div className="stat-card">
            <div className="stat-label">Pending / Current Orders</div>
            <div className="stat-value">
              {pendingCount} / {currentCount}
            </div>
          </div>

        </div>

      )}


      {/* =====================================================
          RECENT ORDERS
      ====================================================== */}

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
          <>
          <div className="table-wrap dashboard-orders-table-wrap">

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

                        <strong>No orders yet.</strong>

                        <span>
                          Create your first order to get started.
                        </span>

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

          {/* Mobile-only card list — same data as the table above, laid out
              to match a compact, glanceable card instead of a cramped
              horizontally-scrolled table row. */}
          <div className="dashboard-orders-cards">
            {recentOrders.length === 0 ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-icon">
                  <FileText size={21} strokeWidth={1.7} />
                </div>
                <strong>No orders yet.</strong>
                <span>Create your first order to get started.</span>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="pill-card" data-status={order.order_status}>
                  <div className="pill-card-left">
                    <div className="pill-card-name">
                      <Link to={`/orders/${order.id}`} className="dashboard-order-number">
                        {order.order_number}
                      </Link>
                    </div>
                    <div className="pill-card-sub">{order.distributor_name || '—'}</div>
                    <div className="pill-card-meta">{formatDate(order.order_date)}</div>
                  </div>
                  <div className="pill-card-divider" />
                  <div className="pill-card-rows">
                    <div className="pill-card-actions-top">
                      <Link to={`/orders/${order.id}`} className="btn-ghost" title="View order" aria-label="View order"><Eye size={15} /></Link>
                    </div>
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Status</span>
                      <span
                        className="pill-card-row-value pill-card-row-status"
                        data-status={order.order_status}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {order.order_status}
                      </span>
                    </div>
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Total</span>
                      <span className="pill-card-row-value">{money(order.total)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          </>

        )}

      </div>


      {pickerOpen && (
        <Modal title="Select Month" onClose={() => setPickerOpen(false)}>
          <MonthPicker value={month} onChange={setMonth} />
          <p className="period-note" style={{ margin: '14px 0 16px' }}>
            Sales and order counts follow the selected month. Receivables, distributors and order status always show current figures.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setPickerOpen(false)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Done
          </button>
        </Modal>
      )}

    </div>
  );
}