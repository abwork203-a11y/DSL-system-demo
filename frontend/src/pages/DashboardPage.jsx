import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { reports, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import { StatSkeleton, TableSkeleton } from '../components/Skeleton';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Plus,
} from 'lucide-react';


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
        <Link to="/orders/new" className="btn">+ New Order</Link>
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

      <div className="card dashboard-orders-card">

        <div className="dashboard-card-header">
          <h3>Recent Orders</h3>

          <Link to="/orders" className="dashboard-card-action">
            View all
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <TableSkeleton columns={6} rows={5} />
        ) : recentOrders.length === 0 ? (
          <div className="empty-state">No orders yet. Create your first one to get started.</div>
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
        )}
      </div>
    </div>
  );
}
