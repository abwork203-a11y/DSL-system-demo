import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye, Ban, RotateCcw } from 'lucide-react';
import { distributors as distributorsApi, zonesApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import FilterToolbar from '../components/FilterToolbar';
import { TableSkeleton } from '../components/Skeleton';
import { scrollToTop } from '../utils/scrollToTop';

const EMPTY_FORM = { name: '', contact_name: '', contact_phone: '', contact_email: '', zone_id: '', region: '', city: '', area: '', address: '' };

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DistributorsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState([]);

  useEffect(() => {
    zonesApi.list().then((res) => setZones(res.data)).catch(() => {});
  }, []);

  // Look up a distributor's zone name from its zone_id. Returns '' (not a dash)
  // so .filter(Boolean) below drops it cleanly when there is no zone.
  const zoneName = (d) => zones.find((z) => z.id === d.zone_id)?.name || '';

  const load = useCallback(async () => {
    try {
      const res = await distributorsApi.list({ search: search || undefined, status: status || undefined, page, pageSize: 25 });
      setRows(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (setter) => (value) => { setter(value); setPage(1); };

  // Used by the pagination buttons: switch page, then jump back to the top of the list.
  const changePage = (nextPage) => { setPage(nextPage); scrollToTop(); };

  // Badge count + reset for the mobile "Filters" panel (search is not a filter)
  const activeFilterCount = status ? 1 : 0;
  const resetFilters = () => { setStatus(''); setPage(1); };

  // Reps only see distributors in their assigned zones, so an empty list can
  // simply mean "no zone assigned yet" rather than "nothing exists".
  const emptyMessage = !isAdmin && !search && !status
    ? 'No distributors to show. You only see distributors in your assigned zones — ask an admin to assign you a zone.'
    : 'No distributors found.';

  const openNew = () => { setForm(EMPTY_FORM); setEditing({}); };
  const openEdit = (d) => { setForm({ ...EMPTY_FORM, ...d, zone_id: d.zone_id ?? '' }); setEditing(d); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    // The backend wants zone_id as a number, or left out entirely.
    // An empty dropdown gives '' so we drop the key. The old text "zone" is no longer used.
    const payload = { ...form };
    delete payload.zone;
    if (payload.zone_id === '' || payload.zone_id == null) delete payload.zone_id;
    else payload.zone_id = Number(payload.zone_id);
    try {
      if (editing?.id) {
        await distributorsApi.update(editing.id, payload);
        toast.success('Distributor updated.');
      } else {
        await distributorsApi.create(payload);
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
    if (!await confirm({
      title: 'Delete Distributor?',
      message: `Are you sure you want to delete "${d.name}"? This action cannot be undone and will remove all related data.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
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
          <p>{pagination?.total ?? '…'} total</p>
        </div>
        <button className="btn" onClick={openNew}><Plus size={16} /> Add Distributor</button>
      </div>

      <FilterToolbar
        activeCount={activeFilterCount}
        onReset={resetFilters}
        search={
          <div className="toolbar-group toolbar-search">
            <input id="distributors-search" type="text" aria-label="Search distributors" placeholder="Search distributors…" value={search} onChange={(e) => updateFilter(setSearch)(e.target.value)} />
          </div>
        }
      >
        <div className="toolbar-group">
          <select id="distributors-status" aria-label="Status" value={status} onChange={(e) => updateFilter(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </FilterToolbar>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={6} rows={6} />
        ) : (
          <>
          <div className="list-cards">
            {rows.map((d) => (
              <div key={d.id} className="pill-card" data-status={d.status}>
                <div className="pill-card-left">
                  <div className="pill-card-name">{d.name}</div>
                  <div className="pill-card-sub">{[zoneName(d), d.city].filter(Boolean).join(' · ') || '—'}</div>
                  {(d.contact_name || d.contact_phone) && (
                    <div className="pill-card-meta">
                      {d.contact_name || '—'}{d.contact_phone ? ` · ${d.contact_phone}` : ''}
                    </div>
                  )}
                </div>
                <div className="pill-card-divider" />
                <div className="pill-card-rows">
                  <div className="pill-card-actions-top">
                    <label className="switch" title={d.status === 'active' ? 'Mark inactive' : 'Reactivate'}>
                      <input type="checkbox" checked={d.status === 'active'} onChange={() => toggleStatus(d)} />
                      <span className="switch-track" />
                    </label>
                    <Link to={`/ledger?distributor_id=${d.id}`} className="btn-ghost" title="View ledger" aria-label="View ledger"><Eye size={15} /></Link>
                    <button className="btn-ghost" onClick={() => openEdit(d)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                    {isAdmin && <button className="btn-ghost" onClick={() => handleDelete(d)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>}
                  </div>
                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Status</span>
                    <span className="pill-card-row-value pill-card-row-status" data-status={d.status}>
                      {d.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="pill-card-row">
                    <span className="pill-card-row-label">Balance</span>
                    <span className="pill-card-row-value">{money(d.balance)}</span>
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="empty-state">{emptyMessage}</div>}
          </div>
          <div className="table-wrap">
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
                  <tr key={d.id} data-status={d.status} onClick={() => openEdit(d)} style={{ cursor: 'pointer' }}>
                    <td data-label="Name"><strong>{d.name}</strong></td>
                    <td data-label="Zone / City">{[zoneName(d), d.city].filter(Boolean).join(' · ') || '—'}</td>
                    <td data-label="Contact">{d.contact_name || '—'}{d.contact_phone ? ` · ${d.contact_phone}` : ''}</td>
                    <td className="num" data-label="Balance">{money(d.balance)}</td>
                    <td data-label="Status"><StatusBadge value={d.status} /></td>
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
                  <tr><td colSpan={6}><div className="empty-state">{emptyMessage}</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}

        <Pagination pagination={pagination} onPageChange={changePage} />
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
                <select value={form.zone_id ?? ''} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
                  <option value="">— None —</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
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
