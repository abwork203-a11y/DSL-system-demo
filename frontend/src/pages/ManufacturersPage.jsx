import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { manufacturers as mfgApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', contact_name: '', contact_phone: '', contact_email: '', balance: 0 };

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ManufacturersPage() {
  const toast = useToast();
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

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete manufacturer "${m.name}"? This cannot be undone.`)) return;
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

      <div className="card">
        <div className="toolbar">
          <input type="text" placeholder="Search manufacturers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <TableSkeleton columns={5} rows={5} />
        ) : (
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
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.contact_name || '—'}{m.contact_phone ? ` · ${m.contact_phone}` : ''}</td>
                    <td className="num">{money(m.balance)}</td>
                    <td>{m.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
                    <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}><Pencil size={14} /> Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m)}><Trash2 size={14} /> Delete</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5}><div className="empty-state">No manufacturers found.</div></td></tr>
                )}
              </tbody>
            </table>
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
