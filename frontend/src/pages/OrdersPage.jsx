import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { orders as ordersApi, distributors as distributorsApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import { TableSkeleton } from '../components/Skeleton';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [distributorsList, setDistributorsList] = useState([]);
  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [distributorId, setDistributorId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await ordersApi.list({
        search: search || undefined,
        order_status: orderStatus || undefined,
        payment_status: paymentStatus || undefined,
        distributor_id: distributorId || undefined,
      });
      setRows(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, orderStatus, paymentStatus, distributorId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { distributorsApi.list().then((res) => setDistributorsList(res.data)).catch(() => {}); }, []);
  useLiveOrderEvents(() => load());

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>{rows.length} order{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/orders/new" className="btn">+ New Order</Link>
      </div>

      <div className="card">
        <div className="toolbar">
          <input type="text" placeholder="Search order # or distributor…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
          <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)}>
            <option value="">All distributors</option>
            {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
            <option value="">All order statuses</option>
            <option value="pending">Pending</option>
            <option value="current">Current</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payment statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {loading ? (
          <TableSkeleton columns={7} rows={6} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Distributor</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                  <th>Term</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`} className="link-btn">{o.order_number}</Link></td>
                    <td>{o.distributor_name}</td>
                    <td>{new Date(o.order_date).toLocaleDateString()}</td>
                    <td className="num">{money(o.total)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.payment_term}</td>
                    <td><StatusBadge value={o.payment_status} /></td>
                    <td><StatusBadge value={o.order_status} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7}><div className="empty-state">No orders match these filters.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
