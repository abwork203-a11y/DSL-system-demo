import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { orders as ordersApi, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState('');

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
    setDownloading(format);
    try {
      await downloadFile(exportApi.invoiceUrl(id, format), `invoice-${order.order_number}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      toast.success('Invoice downloaded.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDownloading('');
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setPaying(true);
    try {
      await ordersApi.pay(id, Number(payAmount));
      toast.success('Payment recorded.');
      setPayOpen(false);
      setPayAmount('');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  const handleStatusChange = async (order_status) => {
    try {
      await ordersApi.updateStatus(id, order_status);
      toast.success(`Order marked ${order_status}.`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" disabled={downloading === 'pdf'} onClick={() => handleDownload('pdf')}>
            {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
          <button className="btn btn-secondary" disabled={downloading === 'excel'} onClick={() => handleDownload('excel')}>
            {downloading === 'excel' ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label">Order Status</div>
          {isAdmin ? (
            <select value={order.order_status} onChange={(e) => handleStatusChange(e.target.value)} style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
              <option value="pending">Pending</option>
              <option value="current">Current</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ) : (
            <div style={{ marginTop: 6 }}><StatusBadge value={order.order_status} /></div>
          )}
        </div>
        <div>
          <div className="stat-label">Payment Status</div>
          <div style={{ marginTop: 6 }}><StatusBadge value={order.payment_status} /></div>
        </div>
        <div>
          <div className="stat-label">Payment Term</div>
          <div style={{ marginTop: 6, textTransform: 'capitalize' }}>{order.payment_term}</div>
        </div>
        <div>
          <div className="stat-label">Balance Remaining</div>
          <div className="num" style={{ marginTop: 6 }}>{money(balanceRemaining)}</div>
        </div>
        {balanceRemaining > 0 && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <button className="btn" onClick={() => { setPayAmount(String(balanceRemaining)); setPayOpen(true); }}>Record Payment</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Line Items</h2>
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
        <div style={{ marginTop: 16, marginLeft: 'auto', width: 260, fontSize: 14, lineHeight: 1.9 }}>
          <div>Subtotal <span className="num" style={{ float: 'right' }}>{money(order.subtotal)}</span></div>
          <div>Discount <span className="num" style={{ float: 'right' }}>−{money(order.discount)}</span></div>
          <div>Freight <span className="num" style={{ float: 'right' }}>+{money(order.freight_cost)}</span></div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 600 }}>
            Total <span className="num" style={{ float: 'right' }}>{money(order.total)}</span>
          </div>
          <div style={{ color: 'var(--ink-muted)' }}>
            Paid <span className="num" style={{ float: 'right' }}>{money(order.amount_paid)}</span>
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Notes</h3>
          <p style={{ color: 'var(--ink-muted)' }}>{order.notes}</p>
        </div>
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
