import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye, Ban, RotateCcw } from 'lucide-react';
import { distributors as distributorsApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', contact_name: '', contact_phone: '', contact_email: '', zone: '', region: '', city: '', area: '', address: '' };

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DistributorsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await distributorsApi.list({ search: search || undefined, status: status || undefined });
      setRows(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY_FORM); setEditing({}); };
  const openEdit = (d) => { setForm({ ...EMPTY_FORM, ...d }); setEditing(d); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing?.id) {
        await distributorsApi.update(editing.id, form);
        toast.success('Distributor updated.');
      } else {
        await distributorsApi.create(form);
        toast.success('Distributor added.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (d) => {
    const newStatus = d.status === 'active' ? 'inactive' : 'active';
    // Optimistic: flip this one row in local state immediately rather than
    // waiting for a round-trip + full reload — a status toggle has no other
    // derived fields to reconcile, so a simple rollback on failure is safe.
    setRows((current) => current.map((row) => (row.id === d.id ? { ...row, status: newStatus } : row)));

    try {
      await distributorsApi.update(d.id, { status: newStatus });
      toast.success(newStatus === 'inactive' ? 'Marked inactive.' : 'Reactivated.');
    } catch (err) {
      setRows((current) => current.map((row) => (row.id === d.id ? { ...row, status: d.status } : row))); // roll back
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete distributor "${d.name}"? This cannot be undone.`)) return;
    try {
      await distributorsApi.remove(d.id);
      toast.success('Distributor deleted.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Distributors</h1>
          <p>{rows.length} total</p>
        </div>
        <button className="btn" onClick={openNew}><Plus size={16} /> Add Distributor</button>
      </div>

        <div className="toolbar">
          <div className="toolbar-group">
            <input id="distributors-search" type="text" placeholder="Search distributors…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="toolbar-group">
            <select id="distributors-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={6} rows={6} />
        ) : (
          <div className="table-wrap page-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Zone / City</th>
                  <th>Contact</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} onClick={() => openEdit(d)} style={{ cursor: 'pointer' }}>
                    <td><strong>{d.name}</strong></td>
                    <td>{[d.zone, d.city].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{d.contact_name || '—'}{d.contact_phone ? ` · ${d.contact_phone}` : ''}</td>
                    <td className="num">{money(d.balance)}</td>
                    <td><StatusBadge value={d.status} /></td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/ledger?distributor_id=${d.id}`} className="btn-ghost" title="View ledger" aria-label="View ledger"><Eye size={15} /></Link>
                      <button className="btn-ghost" onClick={() => openEdit(d)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                      <button className="btn-ghost" onClick={() => toggleStatus(d)} title={d.status === 'active' ? 'Mark inactive' : 'Reactivate'} aria-label={d.status === 'active' ? 'Mark inactive' : 'Reactivate'}>
                        {d.status === 'active' ? <Ban size={15} /> : <RotateCcw size={15} />}
                      </button>
                      {isAdmin && <button className="btn-ghost" onClick={() => handleDelete(d)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state">No distributors found.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="table-footer">
            Showing 1 to {rows.length} of {rows.length} distributor{rows.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'Edit Distributor' : 'Add Distributor'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Contact Name</label>
                <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Contact Phone</label>
                <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Contact Email</label>
              <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Zone</label>
                <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
              </div>
              <div className="field">
                <label>Region</label>
                <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>City</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="field">
                <label>Area</label>
                <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
            </div>
            <button className="btn" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save Distributor'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
