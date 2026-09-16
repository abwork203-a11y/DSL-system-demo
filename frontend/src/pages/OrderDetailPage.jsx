import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, CreditCard, Wallet } from 'lucide-react';
import { orders as ordersApi, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import DownloadFormatModal from '../components/DownloadFormatModal';
import { TableSkeleton } from '../components/Skeleton';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Turns a raw audit_log row into a plain-English line — mirrors the same
// action vocabulary ledgerService.js already writes (CREATE / PAYMENT /
// STATUS_CHANGE / CANCEL / DELETE), so this is just a label lookup, not a
// second source of truth about what happened.
function describeActivity(entry) {
  switch (entry.action) {
    case 'CREATE': return 'Order created';
    case 'PAYMENT': return 'Payment recorded';
    case 'STATUS_CHANGE': {
      const next = entry.changes?.after?.order_status || entry.changes?.after?.status;
      return next ? `Status updated to ${next}` : 'Status updated';
    }
    case 'CANCEL': return 'Order cancelled';
    case 'DELETE': return 'Order deleted';
    case 'UPDATE': return 'Order updated';
    default: return entry.action;
  }
}

function ActivityList({ entries }) {
  if (entries.length === 0) {
    return <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No recorded activity yet.</p>;
  }
  return (
    <div className="activity-list">
      {entries.map((entry) => (
        <div key={entry.id} className="activity-item">
          <span className="activity-item-dot" />
          <div className="activity-item-text">
            <strong>{describeActivity(entry)}</strong>
            <span>{formatDateTime(entry.created_at)}{entry.user_name ? ` · by ${entry.user_name}` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  // Same rationale as CreateOrderPage's submittingRef: the disabled attribute
  // on the format buttons already blocks a second click in the normal case,
  // but that only takes effect after a re-render, and a ref closes that gap
  // deterministically regardless of render timing.
  const downloadingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [orderRes, activityRes] = await Promise.all([
        ordersApi.get(id),
        // Activity is supplementary context, not core order data — a
        // failure here (e.g. a transient network hiccup) shouldn't block
        // the page from showing the order itself.
        ordersApi.activity(id).catch(() => ({ data: [] })),
      ]);
      setOrder(orderRes.data);
      setActivity(activityRes.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (format) => {
    if (downloadingRef.current) return; // guard against a fast double-click starting two downloads
    downloadingRef.current = true;
    setDownloading(format);
    setDownloadProgress(null);
    try {
      await downloadFile(
        exportApi.invoiceUrl(id, format),
        `invoice-${order.order_number}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
        setDownloadProgress
      );
      toast.success('Invoice downloaded.');
      setDownloadOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      downloadingRef.current = false;
      setDownloading('');
      setDownloadProgress(null);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setPaying(true);
    const amount = Number(payAmount);
    const previousOrder = order; // snapshot for rollback

    // Optimistic update: apply the same amount_paid/payment_status logic the
    // server uses (see ledgerService.js) so the UI reflects the payment
    // immediately — the modal closes and the balance updates before the
    // network round-trip completes, then gets silently reconciled with the
    // server's authoritative response a moment later.
    const optimisticAmountPaid = Number(order.amount_paid) + amount;
    const optimisticStatus = optimisticAmountPaid >= Number(order.total) ? 'paid'
      : optimisticAmountPaid > 0 ? 'partial' : 'unpaid';
    setOrder({ ...order, amount_paid: optimisticAmountPaid, payment_status: optimisticStatus });
    setPayOpen(false);
    setPayAmount('');

    try {
      const res = await ordersApi.pay(id, amount);
      setOrder((current) => ({ ...current, ...res.data.order })); // reconcile with the server's real numbers
      toast.success('Payment recorded.');
      load(); // also refreshes the activity list with the new PAYMENT entry
    } catch (err) {
      setOrder(previousOrder); // roll back — the payment didn't actually happen
      toast.error(apiErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  const handleStatusChange = async (order_status) => {
    const previousStatus = order.order_status;
    setOrder({ ...order, order_status }); // optimistic — no server-side side effects to wait on for this field

    try {
      await ordersApi.updateStatus(id, order_status);
      toast.success(`Order marked ${order_status}.`);
      load(); // refresh activity with the new STATUS_CHANGE entry
    } catch (err) {
      setOrder((current) => ({ ...current, order_status: previousStatus })); // roll back
      toast.error(apiErrorMessage(err));
    }
  };

  const handleCancelOrder = () => confirm({
    title: 'Cancel this order?',
    message: "This will reverse this order's effect on the distributor's ledger balance. The order record itself is kept for history, just marked cancelled.",
    confirmLabel: 'Cancel Order',
    danger: true,
    onConfirm: async () => {
      await ordersApi.cancel(id);
      toast.success('Order cancelled.');
      load();
    },
  });

  const handleDeleteOrder = () => confirm({
    title: 'Delete this order?',
    message: 'This is permanent and cannot be undone — unlike Cancel, the order record itself will be removed entirely.',
    confirmLabel: 'Delete Order',
    danger: true,
    onConfirm: async () => {
      try {
        await ordersApi.remove(id);
        toast.success('Order deleted.');
        navigate('/orders');
      } catch (err) {
        // A 409 here means the backend refused because newer ledger activity
        // exists for this distributor — its message already explains why and
        // points at Cancel instead, so surface it verbatim rather than a
        // generic error.
        if (err.response?.status === 409) {
          toast.error(err.response?.data?.message || apiErrorMessage(err));
        } else {
          toast.error(apiErrorMessage(err));
        }
        throw err; // let ConfirmContext know this didn't succeed, so it closes without navigating
      }
    },
  });

  if (loading) {
    return (
      <div className="content" style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <div className="skeleton skeleton-text" style={{ width: 160, height: 26, marginBottom: 8 }} />
            <div className="skeleton skeleton-text" style={{ width: 240, height: 13 }} />
          </div>
        </div>
        <div className="card"><TableSkeleton columns={5} rows={4} /></div>
      </div>
    );
  }

  if (!order) {
    return <div className="content"><div className="empty-state">Order not found.</div></div>;
  }

  const balanceRemaining = Number(order.total) - Number(order.amount_paid);

  return (
    <div className="content" style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <div>
          <Link to="/orders" className="link-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10, fontSize: 13 }}>
            <ArrowLeft size={14} /> Back to Orders
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>{order.order_number}</h1>
            <StatusBadge value={order.order_status} />
          </div>
          <p>
            <Link to={`/ledger?distributor_id=${order.distributor_id}`} className="link-btn">{order.distributor_name}</Link>
            {' · '}{new Date(order.order_date).toLocaleDateString()}
            {' · '}<span style={{ textTransform: 'capitalize' }}>{order.payment_term}</span>
            {order.created_by_name ? ` · created by ${order.created_by_name}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setDownloadOpen(true)}>Download</button>
          {order.order_status !== 'cancelled' && (
            <button className="btn btn-secondary" onClick={handleCancelOrder}>Cancel Order</button>
          )}
          {isAdmin && (
            <button className="btn btn-danger" onClick={handleDeleteOrder}>Delete Order</button>
          )}
        </div>
      </div>

      <div className="page-tabs">
        <button type="button" className={`page-tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" className={`page-tab${tab === 'items' ? ' active' : ''}`} onClick={() => setTab('items')}>
          Line Items <span className="page-tab-count">{order.items.length}</span>
        </button>
      </div>

      <div className="order-detail-layout">
        <div className="order-detail-main">

          {tab === 'overview' && (
            <>
              <div className="card">
                <div className="info-strip">
                  <div className="info-strip-item">
                    <Building2 size={18} />
                    <div>
                      <div className="stat-label">Distributor</div>
                      <div>{order.distributor_name}</div>
                    </div>
                  </div>
                  <div className="info-strip-item">
                    <CalendarDays size={18} />
                    <div>
                      <div className="stat-label">Order Date</div>
                      <div>{new Date(order.order_date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="info-strip-item">
                    <CreditCard size={18} />
                    <div>
                      <div className="stat-label">Payment Term</div>
                      <div style={{ textTransform: 'capitalize' }}>{order.payment_term}</div>
                    </div>
                  </div>
                  <div className="info-strip-item">
                    <Wallet size={18} />
                    <div>
                      <div className="stat-label">Order Status</div>
                      {isAdmin ? (
                        <select
                          value={order.order_status}
                          onChange={(e) => handleStatusChange(e.target.value)}
                          style={{ marginTop: 2, border: '1px solid var(--rule)', borderRadius: 6, padding: '4px 6px' }}
                        >
                          <option value="pending">Pending</option>
                          <option value="current">Current</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      ) : (
                        <StatusBadge value={order.order_status} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {order.notes && (
                <div className="card">
                  <h3 style={{ marginBottom: 8 }}>Notes</h3>
                  <p style={{ color: 'var(--ink-muted)' }}>{order.notes}</p>
                </div>
              )}
            </>
          )}

          {tab === 'items' && (
            <div className="card">
              <h2 style={{ marginBottom: 14 }}>Line Items</h2>
              <div>
                {order.items.map((it) => (
                  <div key={it.id} className="pill-card">
                    <div className="pill-card-left">
                      <div className="pill-card-name">{it.product_name}</div>
                      <div className="pill-card-sub">{it.manufacturer_name}</div>
                      {it.size_packaging && <div className="pill-card-meta">{it.size_packaging}</div>}
                    </div>
                    <div className="pill-card-divider" />
                    <div className="pill-card-rows">
                      <div className="pill-card-row">
                        <span className="pill-card-row-label">Qty</span>
                        <span className="pill-card-row-value">{Number(it.quantity)}</span>
                      </div>
                      <div className="pill-card-row">
                        <span className="pill-card-row-label">Unit Price</span>
                        <span className="pill-card-row-value">{money(it.price_at_time_of_order)}</span>
                      </div>
                      <div className="pill-card-row pill-card-row-muted">
                        <span className="pill-card-row-label">Line Price</span>
                        <span className="pill-card-row-value">{money(it.line_total)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, marginLeft: 'auto', width: 260, fontSize: 14, lineHeight: 1.9 }}>
                <div>Subtotal <span className="num" style={{ float: 'right' }}>{money(order.subtotal)}</span></div>
                <div>Discount Amount <span className="num" style={{ float: 'right' }}>{money(order.discount)}</span></div>
                <div>Freight <span className="num" style={{ float: 'right' }}>{money(order.freight_cost)}</span></div>
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 6, fontWeight: 700, fontSize: 15 }}>
                  Total <span className="num" style={{ float: 'right' }}>{money(order.total)}</span>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="order-detail-sidebar">

          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Payment Information</h3>
            <div className="summary-row"><span className="summary-row-label">Discount Amount</span><span className="summary-row-value">{money(order.discount)}</span></div>
            <div className="summary-row"><span className="summary-row-label">Freight</span><span className="summary-row-value">{money(order.freight_cost)}</span></div>
            <div className="summary-row"><span className="summary-row-label">Balance Remaining</span><span className="summary-row-value">{money(balanceRemaining)}</span></div>
            <div className="summary-row"><span className="summary-row-label">Paid Amount</span><span className="summary-row-value">{money(order.amount_paid)}</span></div>
            {balanceRemaining > 0 && (
              <button
                className="btn"
                style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                onClick={() => { setPayAmount(String(balanceRemaining)); setPayOpen(true); }}
              >
                Record Payment
              </button>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Recent Activity</h3>
            <ActivityList entries={activity.slice(0, 4)} />
          </div>

        </div>
      </div>

      {downloadOpen && (
        <DownloadFormatModal
          onClose={() => setDownloadOpen(false)}
          onSelect={handleDownload}
          downloading={downloading}
          progress={downloadProgress}
        />
      )}

      {payOpen && (
        <Modal title="Record Payment" onClose={() => setPayOpen(false)}>
          <form onSubmit={handlePay}>
            <div className="field">
              <label>Amount (balance remaining: {money(balanceRemaining)})</label>
              <input type="number" min="0.01" max={balanceRemaining} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </div>
            <button className="btn" type="submit" disabled={paying} style={{ width: '100%', justifyContent: 'center' }}>
              {paying ? 'Recording…' : 'Record Payment'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
