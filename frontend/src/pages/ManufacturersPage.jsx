import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, Ban, RotateCcw } from 'lucide-react';
import { manufacturers as mfgApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', contact_name: '', contact_phone: '', contact_email: '', balance: 0 };

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ManufacturersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await mfgApi.list({ search: search || undefined });
      setRows(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY_FORM); setEditing({}); };
  const openEdit = (m) => { setForm({ ...EMPTY_FORM, ...m }); setEditing(m); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing?.id) {
        await mfgApi.update(editing.id, form);
        toast.success('Manufacturer updated.');
      } else {
        await mfgApi.create(form);
        toast.success('Manufacturer added.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    const newActive = !m.is_active;
    // Optimistic: flip this one row on screen right away, then tell the server.
    // If the server says no, put the row back the way it was.
    setRows((current) => current.map((row) => (row.id === m.id ? { ...row, is_active: newActive } : row)));

    try {
      await mfgApi.update(m.id, { is_active: newActive });
      toast.success(newActive ? 'Reactivated.' : 'Marked inactive.');
    } catch (err) {
      setRows((current) => current.map((row) => (row.id === m.id ? { ...row, is_active: m.is_active } : row))); // roll back
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async (m) => {
    if (!await confirm({
      title: 'Delete Manufacturer?',
      message: `Delete manufacturer "${m.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
    try {
      await mfgApi.remove(m.id);
      toast.success('Manufacturer deleted.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Manufacturers</h1>
          <p>{rows.length} total</p>
        </div>
        <button className="btn" onClick={openNew}><Plus size={16} /> Add Manufacturer</button>
      </div>

       <div className="toolbar">
          <div className="toolbar-group">
            <input id="manufacturers-search" type="text" placeholder="Search manufacturers…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={5} rows={5} />
        ) : (
          <>
          <div className="list-cards">
            {rows.map((m) => (
              <div key={m.id} className="pill-card" data-status={m.is_active ? 'active' : 'inactive'}>
                <div className="pill-card-left">
                  <div className="pill-card-name">{m.name}</div>
                  {(m.contact_name || m.contact_phone) && (
                    <div className="pill-card-sub">
                      {m.contact_name || '—'}{m.contact_phone ? ` · ${m.contact_phone}` : ''}
                    </div>
                  )}
                </div>
                <div className="pill-card-divider" />
                <div className="pill-card-rows">
                  <div className="pill-card-actions-top">
                    <label className="switch" title={m.is_active ? 'Mark inactive' : 'Reactivate'}>
                      <input type="checkbox" checked={!!m.is_active} onChange={() => toggleActive(m)} />
                      <span className="switch-track" />
                    </label>
                    <button className="btn-ghost" onClick={() => openEdit(m)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                    <button className="btn-ghost" onClick={() => handleDelete(m)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                  </div>
                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Status</span>
                    <span className="pill-card-row-value pill-card-row-status" data-status={m.is_active ? 'active' : 'inactive'}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Balance Owed</span>
                    <span className="pill-card-row-value">{money(m.balance)}</span>
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="empty-state">No manufacturers found.</div>}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th className="num">Balance Owed</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} data-status={m.is_active ? 'active' : 'inactive'}>
                    <td data-label="Name"><strong>{m.name}</strong></td>
                    <td data-label="Contact">{m.contact_name || '—'}{m.contact_phone ? ` · ${m.contact_phone}` : ''}</td>
                    <td className="num" data-label="Balance Owed">{money(m.balance)}</td>
                    <td data-label="Status">{m.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
                    <td className="table-actions">
                      <button className="btn-ghost" onClick={() => openEdit(m)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                      <button className="btn-ghost" onClick={() => toggleActive(m)} title={m.is_active ? 'Mark inactive' : 'Reactivate'} aria-label={m.is_active ? 'Mark inactive' : 'Reactivate'}>
                        {m.is_active ? <Ban size={15} /> : <RotateCcw size={15} />}
                      </button>
                      <button className="btn-ghost" onClick={() => handleDelete(m)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5}><div className="empty-state">No manufacturers found.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}

        {!loading && rows.length > 0 && (
          <div className="table-footer">
            Showing 1 to {rows.length} of {rows.length} manufacturer{rows.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'Edit Manufacturer' : 'Add Manufacturer'} onClose={() => setEditing(null)}>
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
              <label>Opening Balance Owed</label>
              <input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save Manufacturer'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
