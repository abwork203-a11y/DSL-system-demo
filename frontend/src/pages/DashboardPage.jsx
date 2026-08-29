import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { reports, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import { StatSkeleton, TableSkeleton } from '../components/Skeleton';

const [currentDateTime, setCurrentDateTime] = useState(new Date());

useEffect(() => {
  const timer = setInterval(() => {
    setCurrentDateTime(new Date());
  }, 1000);

  return () => clearInterval(timer);
}, []);



function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        reports.dashboard(),
        ordersApi.list({ pageSize: 8 }),
      ]);
      setSummary(summaryRes.data);
      setRecentOrders(ordersRes.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveOrderEvents(() => load());

  const pendingCount = summary?.ordersByStatus?.find((s) => s.order_status === 'pending')?.count || 0;
  const currentCount = summary?.ordersByStatus?.find((s) => s.order_status === 'current')?.count || 0;
  const activeDistributors = summary?.distributorsByStatus?.find((s) => s.status === 'active')?.count || 0;

  return (
    <div className="content">
      <div className="page-header">
  <div>
    <h1>Good day, {user?.name?.split(' ')[0]}</h1>
    <p>Here's what's happening across your distribution network.</p>
  </div>

  <div className="header-actions">
    <div className="date-time">
      <div className="current-date">
        {currentDateTime.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>

      <div className="current-time">
        {currentDateTime.toLocaleTimeString()}
      </div>
    </div>

    <Link to="/orders/new" className="btn">
      + New Order
    </Link>
  </div>
</div>
      {loading ? (
        <StatSkeleton count={5} />
      ) : (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">This Month's Sales</div>
            <div className="stat-value num">{money(summary?.currentMonth?.totalSales)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Orders This Month</div>
            <div className="stat-value num">{summary?.currentMonth?.orderCount ?? '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Outstanding Receivables</div>
            <div className="stat-value num">{money(summary?.totalOutstanding)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Distributors</div>
            <div className="stat-value num">{activeDistributors}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending / Current Orders</div>
            <div className="stat-value num">{pendingCount} / {currentCount}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Recent Orders</h2>
        {loading ? (
          <TableSkeleton columns={6} rows={5} />
        ) : recentOrders.length === 0 ? (
          <div className="empty-state">No orders yet. Create your first one to get started.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Distributor</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`} className="link-btn">{o.order_number}</Link></td>
                    <td>{o.distributor_name}</td>
                    <td>{new Date(o.order_date).toLocaleDateString()}</td>
                    <td className="num">{money(o.total)}</td>
                    <td><StatusBadge value={o.payment_status} /></td>
                    <td><StatusBadge value={o.order_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
