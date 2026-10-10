import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Ban, RotateCcw } from 'lucide-react';
import { usersApi, zonesApi } from '../api/endpoints';
import { apiErrorMessage, apiErrorFields } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Modal from '../components/Modal';
import PasswordInput from '../components/PasswordInput';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'sales_rep', zone_ids: [] };

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

  const loadZones = useCallback(() => {
    zonesApi.list().then((res) => setZones(res.data)).catch(() => {});
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  const [newZoneName, setNewZoneName] = useState('');
  const [creatingZone, setCreatingZone] = useState(false);

  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    setCreatingZone(true);
    try {
      await zonesApi.create(newZoneName.trim());
      setNewZoneName('');
      loadZones();
      toast.success('Zone added.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCreatingZone(false);
    }
  };

  const openNew = () => { setForm(EMPTY_FORM); setFieldErrors({}); setEditing({}); };
  const openEdit = (u) => {
    // The API gives us zones as [{id, name}]; the checkboxes need plain ids.
    setForm({ ...EMPTY_FORM, ...u, password: '', zone_ids: (u.zones || []).map((z) => z.id) });
    setFieldErrors({});
    setEditing(u);
  };

  // Updates one form field and clears that field's error as soon as the
  // user starts changing it — otherwise a stale "Password must be at least
  // 8 characters" would keep showing under a field they've already fixed,
  // until the next full submit attempt re-validates everything.
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
  };

  const toggleZone = (zoneId) => {
    setForm((f) => {
      const has = f.zone_ids.includes(zoneId);
      return { ...f, zone_ids: has ? f.zone_ids.filter((id) => id !== zoneId) : [...f.zone_ids, zoneId] };
    });
  };

  const zoneNames = (u) => (u.zones || []).map((z) => z.name).join(', ');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      if (editing?.id) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        // zone_ids is always sent (so the checkboxes are the source of truth);
        // these two are read-only display fields from the API, not something to send back.
        delete payload.zones;
        delete payload.assigned_zone;
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

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Manage Zones</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {zones.map((z) => <span key={z.id} className="badge badge-neutral">{z.name}</span>)}
          {zones.length === 0 && <span style={{ color: 'var(--ink-muted)' }}>No zones yet.</span>}
        </div>
        <form onSubmit={handleCreateZone} style={{ display: 'flex', gap: 8 }}>
          <input
            aria-label="New zone name"
            placeholder="New zone name"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit" disabled={creatingZone}>
            {creatingZone ? 'Adding…' : 'Add Zone'}
          </button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={6} rows={4} />
        ) : (
          <>
          <div className="list-cards">
            {rows.map((u) => (
              <div key={u.id} className="pill-card" data-status={u.is_active ? 'active' : 'inactive'}>
                <div className="pill-card-left">
                  <div className="pill-card-name">{u.name}</div>
                  <div className="pill-card-sub">{u.email}</div>
                  <div className="pill-card-meta" style={{ textTransform: 'capitalize' }}>
                    {u.role.replace('_', ' ')}{zoneNames(u) ? ` · ${zoneNames(u)}` : ''}
                  </div>
                </div>
                <div className="pill-card-divider" />
                <div className="pill-card-rows">
                  <div className="pill-card-actions-top">
                    {u.id !== currentUser.id && (
                      <label className="switch" title={u.is_active ? 'Deactivate' : 'Reactivate'}>
                        <input type="checkbox" checked={!!u.is_active} onChange={() => toggleActive(u)} />
                        <span className="switch-track" />
                      </label>
                    )}
                    <button className="btn-ghost" onClick={() => openEdit(u)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                    {u.id !== currentUser.id && (
                      <button className="btn-ghost" onClick={() => handleDelete(u)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                    )}
                  </div>
                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Status</span>
                    <span className="pill-card-row-value pill-card-row-status" data-status={u.is_active ? 'active' : 'inactive'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="empty-state">No accounts yet.</div>}
          </div>
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
                    <td data-label="Zone">{zoneNames(u) || '—'}</td>
                    <td data-label="Status">{u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
                    <td className="table-actions">
                      <button className="btn-ghost" onClick={() => openEdit(u)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                      {u.id !== currentUser.id && (
                        <button className="btn-ghost" onClick={() => toggleActive(u)} title={u.is_active ? 'Deactivate' : 'Reactivate'} aria-label={u.is_active ? 'Deactivate' : 'Reactivate'}>
                          {u.is_active ? <Ban size={15} /> : <RotateCcw size={15} />}
                        </button>
                      )}
                      {u.id !== currentUser.id && (
                        <button className="btn-ghost" onClick={() => handleDelete(u)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6}><div className="empty-state">No accounts yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
          </>
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
                <label>Assigned Zones (optional)</label>
                <div className="checkbox-list">
                  {zones.map((z) => (
                    <label key={z.id} className="checkbox-row">
                      <input type="checkbox" checked={form.zone_ids.includes(z.id)} onChange={() => toggleZone(z.id)} />
                      {z.name}
                    </label>
                  ))}
                  {zones.length === 0 && <span style={{ color: 'var(--ink-muted)' }}>No zones yet — add one in Manage Zones.</span>}
                </div>
                {fieldErrors.zone_ids && <FieldError message={fieldErrors.zone_ids} />}
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
