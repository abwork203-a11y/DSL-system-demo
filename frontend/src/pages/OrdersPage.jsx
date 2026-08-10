import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { orders as ordersApi, distributors as distributorsApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';

const PAGE_SIZE = 25;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
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
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, orderStatus, paymentStatus, distributorId, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { distributorsApi.list().then((res) => setDistributorsList(res.data)).catch(() => {}); }, []);
  useLiveOrderEvents(() => load());

  // Any filter change should reset back to page 1 — staying on page 4 of a
  // now-different, shorter result set would just show an empty page.
  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>{pagination?.total ?? '…'} order{pagination?.total === 1 ? '' : 's'}</p>
        </div>
        <Link to="/orders/new" className="btn">+ New Order</Link>
      </div>

      <div className="card">
        <div className="toolbar">
          <input type="text" placeholder="Search order # or distributor…" value={search} onChange={(e) => updateFilter(setSearch)(e.target.value)} style={{ minWidth: 220 }} />
          <select value={distributorId} onChange={(e) => updateFilter(setDistributorId)(e.target.value)}>
            <option value="">All distributors</option>
            {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={orderStatus} onChange={(e) => updateFilter(setOrderStatus)(e.target.value)}>
            <option value="">All order statuses</option>
            <option value="pending">Pending</option>
            <option value="current">Current</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={paymentStatus} onChange={(e) => updateFilter(setPaymentStatus)(e.target.value)}>
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
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
