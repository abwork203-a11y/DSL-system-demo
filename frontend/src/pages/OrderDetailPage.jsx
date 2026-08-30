import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { orders as ordersApi, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import DownloadFormatModal from '../components/DownloadFormatModal';
import { TableSkeleton } from '../components/Skeleton';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ordersApi.get(id);
      setOrder(res.data);
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
    } catch (err) {
      setOrder((current) => ({ ...current, order_status: previousStatus })); // roll back
      toast.error(apiErrorMessage(err));
    }
  };

  const handleCancelOrder = async () => {
    setCancelling(true);
    try {
      await ordersApi.cancel(id);
      toast.success('Order cancelled.');
      setCancelOpen(false);
      load(); // refresh so the corrected status and distributor balance show immediately
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteOrder = async () => {
    setDeleting(true);
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
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="content" style={{ maxWidth: 820 }}>
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
    <div className="content" style={{ maxWidth: 820 }}>
      <div className="page-header">
        <div>
          <h1>{order.order_number}</h1>
          <p>
            <Link to={`/ledger?distributor_id=${order.distributor_id}`} className="link-btn">{order.distributor_name}</Link>
            {' · '}{new Date(order.order_date).toLocaleDateString()}
            {order.created_by_name ? ` · created by ${order.created_by_name}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setDownloadOpen(true)}>Download</button>
          {order.order_status !== 'cancelled' && (
            <button className="btn btn-secondary" onClick={() => setCancelOpen(true)}>Cancel Order</button>
          )}
          {isAdmin && (
            <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete Order</button>
          )}
        </div>
      </div>

      <div className="card order-detail-summary">
        <div className="stat-grid order-detail-stat-grid">
          <div className="stat-card">
            <div className="stat-label">Order Status</div>
            {isAdmin && order.order_status !== 'cancelled' ? (
              <select
                value={order.order_status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="stat-card-value"
              >
                <option value="pending">Pending</option>
                <option value="current">Current</option>
                <option value="completed">Completed</option>
              </select>
            ) : (
              <div className="stat-card-value"><StatusBadge value={order.order_status} /></div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Payment Status</div>
            <div className="stat-card-value"><StatusBadge value={order.payment_status} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Payment Term</div>
            <div className="stat-card-value stat-card-text">{order.payment_term}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Balance Remaining</div>
            <div className="stat-card-value stat-value num">{money(balanceRemaining)}</div>
          </div>
        </div>
        {balanceRemaining > 0 && order.order_status !== 'cancelled' && (
          <button className="btn order-detail-pay-btn" onClick={() => { setPayAmount(String(balanceRemaining)); setPayOpen(true); }}>Record Payment</button>
        )}
      </div>

      <div className="card">
        <h2>Line Items</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Manufacturer</th>
                <th>Product</th>
                <th className="num">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.manufacturer_name}</td>
                  <td>{it.product_name}{it.size_packaging ? <span style={{ color: 'var(--ink-muted)' }}> ({it.size_packaging})</span> : ''}</td>
                  <td className="num">{Number(it.quantity)}</td>
                  <td className="num">{money(it.price_at_time_of_order)}</td>
                  <td className="num">{money(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="order-summary">
          <div className="order-summary-row">
            <span>Subtotal</span>
            <span className="num">{money(order.subtotal)}</span>
          </div>
          <div className="order-summary-row">
            <span>Discount</span>
            <span className="num">−{money(order.discount)}</span>
          </div>
          <div className="order-summary-row">
            <span>Freight</span>
            <span className="num">+{money(order.freight_cost)}</span>
          </div>
          <div className="order-summary-row order-summary-total">
            <span>Total</span>
            <span className="num">{money(order.total)}</span>
          </div>
          <div className="order-summary-row muted">
            <span>Paid</span>
            <span className="num">{money(order.amount_paid)}</span>
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="card">
          <h3>Notes</h3>
          <p style={{ color: 'var(--ink-muted)' }}>{order.notes}</p>
        </div>
      )}

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

      {cancelOpen && (
        <Modal title="Cancel this order?" onClose={() => setCancelOpen(false)} width={440}>
          <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
            This will reverse this order's effect on the distributor's ledger balance.
            The order record itself is kept for history, just marked cancelled.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>Keep Order</button>
            <button className="btn btn-danger" onClick={handleCancelOrder} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <Modal title="Delete this order?" onClose={() => setDeleteOpen(false)} width={440}>
          <p style={{ color: 'var(--ink-muted)', marginBottom: 20 }}>
            This is permanent and cannot be undone — unlike Cancel, the order record itself
            will be removed entirely.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>Keep Order</button>
            <button className="btn btn-danger" onClick={handleDeleteOrder} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Order'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
