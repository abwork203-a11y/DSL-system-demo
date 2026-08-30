import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  DollarSign,
  FileText,
  Landmark,
  Plus,
  Users,
} from 'lucide-react';

import { reports, orders as ordersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';

import StatusBadge from '../components/StatusBadge';
import { StatSkeleton, TableSkeleton } from '../components/Skeleton';


function money(n) {
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


  const currentCount =
    summary?.ordersByStatus?.find(
      (s) => s.order_status === 'current'
    )?.count || 0;


  const activeDistributors =
    summary?.distributorsByStatus?.find(
      (s) => s.status === 'active'
    )?.count || 0;


  const firstName =
    user?.name?.split(' ')[0] || 'there';


  return (
    <div className="content dashboard-page">

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="dashboard-header">

        <div>
          <div className="dashboard-eyebrow">
            OVERVIEW
          </div>

          <h1>
            Dashboard
          </h1>

          <p>
            Here's what's happening across your
            distribution network.
          </p>
        </div>


        <Link
          to="/orders/new"
          className="btn dashboard-new-order"
        >
          <Plus size={17} strokeWidth={2} />
          New Order
        </Link>

      </div>


      {/* =====================================================
          KEY METRICS
      ====================================================== */}

      <section className="dashboard-section">

        <div className="dashboard-section-heading">
          <div>
            <h2>Business Overview</h2>
            <span>Current month performance</span>
          </div>
        </div>


        {loading ? (

          <StatSkeleton count={4} />

        ) : (

          <div className="dashboard-metrics">

            {/* SALES */}

            <div className="dashboard-metric-card">

              <div className="dashboard-metric-top">
                <span className="dashboard-metric-label">
                  Monthly Sales
                </span>

                <div className="dashboard-metric-icon">
                  <DollarSign
                    size={17}
                    strokeWidth={1.8}
                  />
                </div>
              </div>

              <div className="dashboard-metric-value">
                {money(summary?.currentMonth?.totalSales)}
              </div>

              <div className="dashboard-metric-note">
                Total sales this month
              </div>

            </div>


            {/* ORDERS */}

            <div className="dashboard-metric-card">

              <div className="dashboard-metric-top">
                <span className="dashboard-metric-label">
                  Orders
                </span>

                <div className="dashboard-metric-icon">
                  <ClipboardList
                    size={17}
                    strokeWidth={1.8}
                  />
                </div>
              </div>

              <div className="dashboard-metric-value">
                {summary?.currentMonth?.orderCount ?? '—'}
              </div>

              <div className="dashboard-metric-note">
                Orders created this month
              </div>

            </div>


            {/* RECEIVABLES */}

            <div className="dashboard-metric-card">

              <div className="dashboard-metric-top">
                <span className="dashboard-metric-label">
                  Receivables
                </span>

                <div className="dashboard-metric-icon">
                  <Landmark
                    size={17}
                    strokeWidth={1.8}
                  />
                </div>
              </div>

              <div className="dashboard-metric-value">
                {money(summary?.totalOutstanding)}
              </div>

              <div className="dashboard-metric-note">
                Outstanding balance
              </div>

            </div>


            {/* DISTRIBUTORS */}

            <div className="dashboard-metric-card">

              <div className="dashboard-metric-top">
                <span className="dashboard-metric-label">
                  Distributors
                </span>

                <div className="dashboard-metric-icon">
                  <Building2
                    size={17}
                    strokeWidth={1.8}
                  />
                </div>
              </div>

              <div className="dashboard-metric-value">
                {activeDistributors}
              </div>

              <div className="dashboard-metric-note">
                Active distributors
              </div>

            </div>

          </div>

        )}

      </section>


      {/* =====================================================
          OPERATIONAL AREA
      ====================================================== */}

      <section className="dashboard-section">

        <div className="dashboard-section-heading">

          <div>
            <h2>Order Activity</h2>
            <span>Recent orders and current workload</span>
          </div>

          <Link
            to="/orders"
            className="dashboard-view-link"
          >
            View all orders
            <ArrowRight size={15} />
          </Link>

        </div>


        <div className="dashboard-operations">

          {/* =================================================
              RECENT ORDERS
          ================================================== */}

          <div className="card dashboard-orders-card">

            <div className="dashboard-card-header">

              <div>
                <h3>Recent Orders</h3>
                <p>
                  Latest orders entered into the system
                </p>
              </div>

              <Link
                to="/orders"
                className="dashboard-card-action"
              >
                View all
                <ArrowRight size={14} />
              </Link>

            </div>


            {loading ? (

              <TableSkeleton
                columns={6}
                rows={5}
              />

            ) : recentOrders.length === 0 ? (

              <div className="dashboard-empty">

                <div className="dashboard-empty-icon">
                  <FileText
                    size={21}
                    strokeWidth={1.7}
                  />
                </div>

                <strong>No orders yet</strong>

                <span>
                  Create your first order to get started.
                </span>

                <Link
                  to="/orders/new"
                  className="btn btn-secondary dashboard-empty-button"
                >
                  <Plus size={15} />
                  Create Order
                </Link>

              </div>

            ) : (

              <div className="table-wrap">

                <table className="data-table dashboard-orders-table">

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

                    {recentOrders.map((order) => (

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
                          <StatusBadge
                            value={order.payment_status}
                          />
                        </td>

                        <td>
                          <StatusBadge
                            value={order.order_status}
                          />
                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </div>


          {/* =================================================
              ORDER STATUS
          ================================================== */}

          <div className="card dashboard-status-card">

            <div className="dashboard-card-header">

              <div>
                <h3>Order Status</h3>
                <p>
                  Current operational workload
                </p>
              </div>

            </div>


            <div className="dashboard-status-list">

              <div className="dashboard-status-row">

                <div className="dashboard-status-info">

                  <span className="dashboard-status-dot pending" />

                  <span>
                    Pending orders
                  </span>

                </div>

                <strong>
                  {pendingCount}
                </strong>

              </div>


              <div className="dashboard-status-row">

                <div className="dashboard-status-info">

                  <span className="dashboard-status-dot current" />

                  <span>
                    Current orders
                  </span>

                </div>

                <strong>
                  {currentCount}
                </strong>

              </div>

            </div>


            <div className="dashboard-status-footer">

              <Link
                to="/orders"
                className="btn btn-secondary dashboard-status-button"
              >
                Manage Orders
                <ArrowRight size={15} />
              </Link>

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          QUICK ACTIONS
      ====================================================== */}

      <section className="dashboard-section dashboard-quick-section">

        <div className="dashboard-section-heading">

          <div>
            <h2>Quick Actions</h2>
            <span>Common tasks</span>
          </div>

        </div>


        <div className="dashboard-quick-grid">

          <Link
            to="/orders/new"
            className="dashboard-quick-card"
          >
            <div className="dashboard-quick-icon">
              <Plus size={18} />
            </div>

            <div>
              <strong>New Order</strong>
              <span>Create a customer order</span>
            </div>

            <ArrowRight size={16} />

          </Link>


          <Link
            to="/distributors"
            className="dashboard-quick-card"
          >
            <div className="dashboard-quick-icon">
              <Building2 size={18} />
            </div>

            <div>
              <strong>Distributors</strong>
              <span>Manage distributor accounts</span>
            </div>

            <ArrowRight size={16} />

          </Link>


          <Link
            to="/ledger"
            className="dashboard-quick-card"
          >
            <div className="dashboard-quick-icon">
              <Landmark size={18} />
            </div>

            <div>
              <strong>Ledger</strong>
              <span>Review financial activity</span>
            </div>

            <ArrowRight size={16} />

          </Link>


          <Link
            to="/reports"
            className="dashboard-quick-card"
          >
            <div className="dashboard-quick-icon">
              <Users size={18} />
            </div>

            <div>
              <strong>Reports</strong>
              <span>View business performance</span>
            </div>

            <ArrowRight size={16} />

          </Link>

        </div>

      </section>

    </div>
  );
}