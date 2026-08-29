import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { usersApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import PasswordInput from '../components/PasswordInput';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'sales_rep', assigned_zone: '' };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await usersApi.list();
      setRows(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY_FORM); setEditing({}); };
  const openEdit = (u) => { setForm({ ...EMPTY_FORM, ...u, password: '' }); setEditing(u); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing?.id) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await usersApi.update(editing.id, payload);
        toast.success('Account updated.');
      } else {
        await usersApi.create(form);
        toast.success('Account created.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    const newActive = !u.is_active;
    setRows((current) => current.map((row) => (row.id === u.id ? { ...row, is_active: newActive } : row)));

    try {
      await usersApi.update(u.id, { is_active: newActive });
      toast.success(newActive ? 'Account reactivated.' : 'Account deactivated.');
    } catch (err) {
      setRows((current) => current.map((row) => (row.id === u.id ? { ...row, is_active: u.is_active } : row)));
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    try {
      await usersApi.remove(u.id);
      toast.success('Account deleted.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Sales Reps &amp; Admins</h1>
          <p>{rows.length} accounts</p>
        </div>
        <button className="btn" onClick={openNew}><Plus size={16} /> Add Account</button>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={6} rows={4} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Zone</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.email}</td>
                    <td style={{ textTransform: 'capitalize' }}>{u.role.replace('_', ' ')}</td>
                    <td>{u.assigned_zone || '—'}</td>
                    <td>{u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
                    <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}><Pencil size={14} /> Edit</button>
                      {u.id !== currentUser.id && (
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                      {u.id !== currentUser.id && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}><Trash2 size={14} /> Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6}><div className="empty-state">No accounts yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'Edit Account' : 'Add Account'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editing.id} />
            </div>
            <div className="field">
              <label>{editing.id ? 'New Password (leave blank to keep current)' : 'Password'}</label>
              <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing.id} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Role{editing.id === currentUser.id ? ' (you can\'t change your own role)' : ''}</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={editing.id === currentUser.id}
                >
                  <option value="sales_rep">Sales Rep</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="field">
                <label>Assigned Zone (optional)</label>
                <input value={form.assigned_zone} onChange={(e) => setForm({ ...form, assigned_zone: e.target.value })} />
              </div>
            </div>
            <button className="btn" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save Account'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
