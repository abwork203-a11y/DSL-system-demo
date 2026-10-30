import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Check, X, AlertTriangle } from 'lucide-react';
import { requestsApi, distributors as distributorsApi, products as productsApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useLiveOrderEvents } from '../context/SocketContext';
import { fetchAllPages } from '../utils/fetchAllPages';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';

const TYPE_LABELS = {
  order: 'Order',
  credit_extension: 'Credit limit',
  price_override: 'Special price',
};

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Admin sees the whole approval inbox; a sales rep sees their own requests.
// Same page, same table — the available actions differ by role.
export default function RequestsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);

  const [productsList, setProductsList] = useState([]);
  const [distributorsList, setDistributorsList] = useState([]);

  const [reviewing, setReviewing] = useState(null); // request detail (with warnings) being reviewed
  const [reviewNote, setReviewNote] = useState('');
  const [acting, setActing] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'credit_extension', distributor_id: '', new_limit: '', product_id: '', price: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const productName = useMemo(() => new Map(productsList.map((p) => [p.id, p.name])), [productsList]);

  const load = useCallback(async () => {
    try {
      const res = await requestsApi.list({
        page,
        pageSize: 25,
        status: statusFilter || undefined,
        mine: isAdmin ? undefined : 'true',
      });
      setRows(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  // Names for the "special price" summaries and the new-request form.
  useEffect(() => {
    fetchAllPages(productsApi.list, { is_active: 'true' }).then(setProductsList).catch(() => {});
    fetchAllPages(distributorsApi.list, { status: 'active' }).then(setDistributorsList).catch(() => {});
  }, []);

  useLiveOrderEvents((e) => {
    if (e.type === 'request:created' || e.type === 'request:reviewed') load();
  });

  const summary = (r) => {
    const p = r.payload || {};
    if (r.type === 'order') {
      const n = (p.items || []).length;
      return `${n} item${n === 1 ? '' : 's'} · ${p.payment_term || '—'}`;
    }
    if (r.type === 'credit_extension') return `New credit limit: ${money(p.new_limit)}`;
    if (r.type === 'price_override') return `${productName.get(p.product_id) || `Product #${p.product_id}`} at ${money(p.price)}`;
    return '';
  };

  const openReview = async (r) => {
    try {
      const res = await requestsApi.get(r.id); // includes credit-limit warnings for pending orders
      setReviewNote('');
      setReviewing(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const decide = async (action) => {
    if (!reviewing || acting) return;
    setActing(true);
    try {
      if (action === 'approve') {
        await requestsApi.approve(reviewing.id, reviewNote || undefined);
        toast.success('Request approved.');
      } else {
        await requestsApi.reject(reviewing.id, reviewNote || undefined);
        toast.success('Request rejected.');
      }
      setReviewing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
      load(); // e.g. someone else already actioned it
    } finally {
      setActing(false);
    }
  };

  const cancelRequest = async (r) => {
    if (!await confirm({
      title: 'Cancel Request?',
      message: 'This withdraws the request. You can submit a new one later.',
      confirmLabel: 'Cancel request',
      danger: true,
    })) return;
    try {
      await requestsApi.cancel(r.id);
      toast.success('Request cancelled.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const submitNew = async () => {
    if (saving) return;
    if (!form.distributor_id) return toast.error('Choose a distributor.');
    let payload;
    if (form.type === 'credit_extension') {
      if (form.new_limit === '' || Number(form.new_limit) < 0) return toast.error('Enter the credit limit you are asking for.');
      payload = { new_limit: Number(form.new_limit) };
    } else {
      if (!form.product_id) return toast.error('Choose a product.');
      if (form.price === '' || Number(form.price) < 0) return toast.error('Enter the special price.');
      payload = { product_id: Number(form.product_id), price: Number(form.price) };
    }
    setSaving(true);
    try {
      await requestsApi.create({
        type: form.type,
        distributor_id: Number(form.distributor_id),
        payload,
        reason: form.reason || undefined,
      });
      toast.success('Request submitted for approval.');
      setCreating(false);
      setForm({ type: 'credit_extension', distributor_id: '', new_limit: '', product_id: '', price: '', reason: '' });
      setStatusFilter('pending');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Requests</h1>
          <p>
            {isAdmin
              ? 'Orders, credit-limit changes and special prices submitted by sales reps. Nothing takes effect until you approve it.'
              : 'Your orders and requests waiting for admin approval.'}
          </p>
        </div>
        <div className="page-header-actions">
          <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </select>
          {!isAdmin && (
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={16} /> New request
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Distributor</th>
                  {isAdmin && <th>Requested by</th>}
                  <th>Details</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-status={r.status}>
                    <td data-label="#">{r.id}</td>
                    <td data-label="Type">{TYPE_LABELS[r.type] || r.type}</td>
                    <td data-label="Distributor">{r.distributor_name}</td>
                    {isAdmin && <td data-label="Requested by">{r.requested_by_name || '—'}</td>}
                    <td data-label="Details">
                      {summary(r)}
                      {r.reason && <div className="cell-note">{r.reason}</div>}
                      {r.review_note && r.status !== 'pending' && (
                        <div className="cell-note">Admin note: {r.review_note}</div>
                      )}
                    </td>
                    <td data-label="Status"><StatusBadge value={r.status} /></td>
                    <td data-label="Submitted">{fmtDate(r.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        {isAdmin && r.status === 'pending' && (
                          <button className="btn btn-sm" onClick={() => openReview(r)}>Review</button>
                        )}
                        {!isAdmin && r.status === 'pending' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => cancelRequest(r)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={isAdmin ? 8 : 7}>
                      <div className="empty-state">
                        {statusFilter === 'pending' ? 'Nothing waiting for approval.' : 'No requests found.'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {reviewing && (
        <Modal title={`Request #${reviewing.id} — ${TYPE_LABELS[reviewing.type] || reviewing.type}`} onClose={() => !acting && setReviewing(null)} width={560}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{reviewing.requested_by_name || 'A sales rep'}</strong> for <strong>{reviewing.distributor_name}</strong>
          </p>
          <p style={{ margin: '0 0 12px' }}>{summary(reviewing)}</p>

          {reviewing.type === 'order' && (reviewing.payload?.items || []).length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13.5 }}>
              {reviewing.payload.items.map((it, i) => (
                <li key={i}>
                  {productName.get(it.product_id) || `Product #${it.product_id}`} × {it.quantity}
                  {it.price_override_id ? ' (special price)' : ''}
                </li>
              ))}
            </ul>
          )}
          {reviewing.reason && <p style={{ margin: '0 0 12px', color: 'var(--ink-muted)' }}>Reason: {reviewing.reason}</p>}

          {(reviewing.warnings || []).map((w) => (
            <div key={w.code} className="field-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{w.message}</span>
            </div>
          ))}

          <div className="field">
            <label htmlFor="review-note">Note (optional)</label>
            <textarea id="review-note" rows={3} maxLength={2000} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button className="btn btn-danger" disabled={acting} onClick={() => decide('reject')}>
              <X size={16} /> Reject
            </button>
            <button className="btn" disabled={acting} onClick={() => decide('approve')}>
              <Check size={16} /> Approve
            </button>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title="New request" onClose={() => !saving && setCreating(false)} width={520}>
          <div className="field">
            <label htmlFor="rq-type">What do you need?</label>
            <select id="rq-type" value={form.type} onChange={setF('type')}>
              <option value="credit_extension">Raise a distributor's credit limit</option>
              <option value="price_override">Special price for a distributor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rq-dist">Distributor</label>
            <select id="rq-dist" value={form.distributor_id} onChange={setF('distributor_id')}>
              <option value="">Select…</option>
              {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {form.type === 'credit_extension' ? (
            <div className="field">
              <label htmlFor="rq-limit">Requested credit limit</label>
              <input id="rq-limit" type="number" min="0" step="0.01" value={form.new_limit} onChange={setF('new_limit')} />
            </div>
          ) : (
            <div className="field-row">
              <div className="field">
                <label htmlFor="rq-prod">Product</label>
                <select id="rq-prod" value={form.product_id} onChange={setF('product_id')}>
                  <option value="">Select…</option>
                  {productsList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rq-price">Special price</label>
                <input id="rq-price" type="number" min="0" step="0.01" value={form.price} onChange={setF('price')} />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="rq-reason">Reason (optional)</label>
            <textarea id="rq-reason" rows={3} maxLength={2000} value={form.reason} onChange={setF('reason')} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" disabled={saving} onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn" disabled={saving} onClick={submitNew}>Submit for approval</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
