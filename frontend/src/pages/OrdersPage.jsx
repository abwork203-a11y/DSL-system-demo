import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Trash2, CalendarDays, ChevronRight } from 'lucide-react';
import { orders as ordersApi, distributors as distributorsApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { listDrafts, deleteDraft, formatRelativeTime, ORDER_STEPS } from '../utils/orderDrafts';
import { fetchAllPages } from '../utils/fetchAllPages';

const PAGE_SIZE = 25;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState(() => (location.state?.tab === 'drafts' ? 'drafts' : 'orders'));

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [distributorsList, setDistributorsList] = useState([]);
  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [distributorId, setDistributorId] = useState('');
  const [loading, setLoading] = useState(true);

  // Server-persisted now (see utils/orderDrafts.js) rather than localStorage,
  // so this starts empty and fills in once the fetch resolves — the tab's
  // count badge pops in a beat after first paint instead of being available
  // instantly, which is the trade-off for drafts now following the user
  // across devices instead of being stuck in one browser.
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftDistributorId, setDraftDistributorId] = useState('');

  const loadDrafts = useCallback(async () => {
    try {
      setDrafts(await listDrafts());
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDraftsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => { fetchAllPages(distributorsApi.list).then(setDistributorsList).catch(() => {}); }, []);
  useLiveOrderEvents(() => load());

  useEffect(() => { loadDrafts(); }, [loadDrafts]);
  useEffect(() => {
    if (activeTab === 'drafts') loadDrafts();
  }, [activeTab, loadDrafts]);

  // Any filter change should reset back to page 1 — staying on page 4 of a
  // now-different, shorter result set would just show an empty page.
  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };

  const filteredDrafts = drafts.filter((d) => {
    const matchesSearch = !draftSearch
      || (d.distributorName || '').toLowerCase().includes(draftSearch.toLowerCase());
    const matchesDistributor = !draftDistributorId
      || String(d.distributorId) === String(draftDistributorId);
    return matchesSearch && matchesDistributor;
  });

  const handleResume = (draft) => {
    navigate('/orders/new', { state: { resumeDraftId: draft.id } });
  };

  const handleDiscard = async (draft) => {
    const label = draft.distributorName ? ` for "${draft.distributorName}"` : '';
    await confirm({
      title: 'Discard Draft?',
      message: `Discard this draft${label}? This cannot be undone.`,
      confirmLabel: 'Discard',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDraft(draft.id);
          await loadDrafts();
          toast.success('Draft discarded.');
        } catch (err) {
          toast.error(apiErrorMessage(err));
          throw err; // re-throw so ConfirmContext knows not to treat this as settled cleanly
        }
      },
    });
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>{pagination?.total ?? '…'} order{pagination?.total === 1 ? '' : 's'}</p>
        </div>
        <Link to="/orders/new" className="btn">+ New Order</Link>
      </div>

      <div className="page-tabs">
        <button
          type="button"
          className={`page-tab${activeTab === 'orders' ? ' active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
        <button
          type="button"
          className={`page-tab${activeTab === 'drafts' ? ' active' : ''}`}
          onClick={() => setActiveTab('drafts')}
        >
          Drafts
          {drafts.length > 0 && <span className="page-tab-count">{drafts.length}</span>}
        </button>
      </div>

      {activeTab === 'orders' ? (
        <div className="toolbar">
          <div className="toolbar-group">
            <label htmlFor="orders-search">Search</label>
            <input id="orders-search" type="text" placeholder="Search order # or distributor…" value={search} onChange={(e) => updateFilter(setSearch)(e.target.value)} style={{ minWidth: 220 }} />
          </div>
          <div className="toolbar-group">
            <label htmlFor="orders-distributor">Distributor</label>
            <select id="orders-distributor" value={distributorId} onChange={(e) => updateFilter(setDistributorId)(e.target.value)}>
              <option value="">All distributors</option>
              {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="toolbar-group">
            <label htmlFor="orders-order-status">Order Status</label>
            <select id="orders-order-status" value={orderStatus} onChange={(e) => updateFilter(setOrderStatus)(e.target.value)}>
              <option value="">All order statuses</option>
              <option value="pending">Pending</option>
              <option value="current">Current</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="toolbar-group">
            <label htmlFor="orders-payment-status">Payment Status</label>
            <select id="orders-payment-status" value={paymentStatus} onChange={(e) => updateFilter(setPaymentStatus)(e.target.value)}>
              <option value="">All payment statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="toolbar">
          <div className="toolbar-group">
            <label htmlFor="drafts-search">Search</label>
            <input id="drafts-search" type="text" placeholder="Search by distributor…" value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} style={{ minWidth: 220 }} />
          </div>
          <div className="toolbar-group">
            <label htmlFor="drafts-distributor">Distributor</label>
            <select id="drafts-distributor" value={draftDistributorId} onChange={(e) => setDraftDistributorId(e.target.value)}>
              <option value="">All distributors</option>
              {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {activeTab === 'orders' ? (
        
        <div className="card">
          

          {loading ? (
            <TableSkeleton columns={7} rows={6} />
          ) : (
            <>
            <div className="list-cards">
              {rows.map((o) => (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="pill-card"
                  data-status={o.order_status}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="pill-card-left">
  <div className="pill-card-name">
    <span style={{ fontFamily: 'var(--font-mono)' }}>{o.order_number}</span>
  </div>
  <div className="pill-card-sub">{o.distributor_name}</div>
  <div className="pill-card-meta">
    <CalendarDays size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
    {new Date(o.order_date).toLocaleDateString()}
  </div>
</div>
<div className="pill-card-divider" />
<div className="pill-card-rows">
  <div className="pill-card-row">
    <span className="pill-card-row-label">Status</span>
    <span
      className="pill-card-row-value pill-card-row-status"
      data-status={o.order_status}
      style={{ textTransform: 'capitalize' }}
    >
      {o.order_status}
    </span>
  </div>
  <div className="pill-card-row">
    <span className="pill-card-row-label">Total</span>
    <span className="pill-card-row-value">{money(o.total)}</span>
  </div>
  <div className="pill-card-row pill-card-row-muted">
    <span className="pill-card-row-label">Payment</span>
    <span className="pill-card-row-value" style={{ textTransform: 'capitalize' }}>{o.payment_status}</span>
  </div>
</div>                </Link>
              ))}
              {rows.length === 0 && <div className="empty-state">No orders match these filters.</div>}
            </div>
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
                    <tr key={o.id} data-status={o.order_status}>
                      <td data-label="Order #"><Link to={`/orders/${o.id}`} className="link-btn">{o.order_number}</Link></td>
                      <td data-label="Distributor">{o.distributor_name}</td>
                      <td data-label="Date">{new Date(o.order_date).toLocaleDateString()}</td>
                      <td className="num" data-label="Total">{money(o.total)}</td>
                      <td data-label="Term" style={{ textTransform: 'capitalize' }}>{o.payment_term}</td>
                      <td data-label="Payment"><StatusBadge value={o.payment_status} /></td>
                      <td data-label="Status"><StatusBadge value={o.order_status} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={7}><div className="empty-state">No orders match these filters.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>

      ) : (

        <div className="card">
          {draftsLoading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : (
            <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th>Progress</th>
                  <th>Items</th>
                  <th>Last Edited</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredDrafts.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Distributor"><strong>{d.distributorName || 'No distributor selected'}</strong></td>
                    <td data-label="Progress">{ORDER_STEPS[d.step] || ORDER_STEPS[0]}</td>
                    <td data-label="Items">{d.items?.length || 0} item{(d.items?.length || 0) === 1 ? '' : 's'}</td>
                    <td data-label="Last Edited">{formatRelativeTime(d.updatedAt)}</td>
                    <td className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleResume(d)}>Resume</button>
                      <button className="btn-ghost" onClick={() => handleDiscard(d)} title="Discard draft" aria-label="Discard draft"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {filteredDrafts.length === 0 && (
                  <tr><td colSpan={5}><div className="empty-state">
                    {drafts.length === 0 ? 'No drafts.' : 'No drafts match these filters.'}
                  </div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {!draftsLoading && drafts.length > 0 && (
            <div className="table-footer">
              Showing {filteredDrafts.length} of {drafts.length} draft{drafts.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

      )}
    </div>
  );
}
