import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { usersApi, distributors as distributorsApi } from '../api/endpoints';
import { apiErrorMessage, apiErrorFields } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Modal from '../components/Modal';
import PasswordInput from '../components/PasswordInput';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'sales_rep', assigned_zone: '' };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
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

  // Zone options come from whatever zones distributors are actually using —
  // keeps a sales rep's assigned zone consistent with real zone names
  // instead of free text that could drift (typos, casing, abbreviations).
  useEffect(() => {
    distributorsApi.list()
      .then((res) => {
        const distinctZones = Array.from(new Set(res.data.map((d) => d.zone).filter(Boolean))).sort();
        setZones(distinctZones);
      })
      .catch(() => {});
  }, []);

  const openNew = () => { setForm(EMPTY_FORM); setFieldErrors({}); setEditing({}); };
  const openEdit = (u) => { setForm({ ...EMPTY_FORM, ...u, password: '' }); setFieldErrors({}); setEditing(u); };

  // Updates one form field and clears that field's error as soon as the
  // user starts changing it — otherwise a stale "Password must be at least
  // 8 characters" would keep showing under a field they've already fixed,
  // until the next full submit attempt re-validates everything.
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
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
      // Field-specific validation errors (bad email format, short password,
      // etc.) get highlighted right under the field that caused them, in
      // addition to the toast — a single toast alone doesn't tell you WHICH
      // field to fix on a form with five inputs.
      const fields = apiErrorFields(err);
      if (fields) setFieldErrors(fields);
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
    if (!await confirm({
      title: 'Delete User?',
      message: `Delete user "${u.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
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
                  <tr key={u.id} data-status={u.is_active ? 'active' : 'inactive'}>
                    <td data-label="Name"><strong>{u.name}</strong></td>
                    <td data-label="Email">{u.email}</td>
                    <td data-label="Role" style={{ textTransform: 'capitalize' }}>{u.role.replace('_', ' ')}</td>
                    <td data-label="Zone">{u.assigned_zone || '—'}</td>
                    <td data-label="Status">{u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
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
              <input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
                style={fieldErrors.name ? { borderColor: 'var(--status-negative)' } : undefined}
              />
              {fieldErrors.name && <FieldError message={fieldErrors.name} />}
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                required
                disabled={!!editing.id}
                style={fieldErrors.email ? { borderColor: 'var(--status-negative)' } : undefined}
              />
              {fieldErrors.email && <FieldError message={fieldErrors.email} />}
            </div>
            <div className="field">
              <label>{editing.id ? 'New Password (leave blank to keep current)' : 'Password'}</label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                required={!editing.id}
                style={fieldErrors.password ? { outline: '1px solid var(--status-negative)', borderRadius: 6 } : undefined}
              />
              {fieldErrors.password ? <FieldError message={fieldErrors.password} /> : <PasswordStrengthMeter password={form.password} />}
            </div>
            <div className="field-row">
              <div className="field">
                <label>Role{editing.id === currentUser.id ? ' (you can\'t change your own role)' : ''}</label>
                <select
                  value={form.role}
                  onChange={(e) => setField('role', e.target.value)}
                  disabled={editing.id === currentUser.id}
                >
                  <option value="sales_rep">Sales Rep</option>
                  <option value="admin">Admin</option>
                </select>
                {fieldErrors.role && <FieldError message={fieldErrors.role} />}
              </div>
              <div className="field">
                <label>Assigned Zone (optional)</label>
                <select value={form.assigned_zone} onChange={(e) => setField('assigned_zone', e.target.value)}>
                  <option value="">— None —</option>
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                  {/* If this account already has a zone that no distributor currently uses
                      (e.g. that distributor was later reassigned or deleted), keep it
                      selectable so saving the form doesn't silently wipe it out. */}
                  {form.assigned_zone && !zones.includes(form.assigned_zone) && (
                    <option value={form.assigned_zone}>{form.assigned_zone}</option>
                  )}
                </select>
                {fieldErrors.assigned_zone && <FieldError message={fieldErrors.assigned_zone} />}
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

function FieldError({ message }) {
  return (
    <p style={{ color: 'var(--status-negative)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
      {message}
    </p>
  );
}
