import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { products as productsApi, manufacturers as mfgApi } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';

const EMPTY_FORM = { manufacturer_id: '', name: '', size_packaging: '', price: '', retail_price: '' };

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProductsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [mfgs, setMfgs] = useState([]);
  const [search, setSearch] = useState('');
  const [mfgFilter, setMfgFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await productsApi.list({ search: search || undefined, manufacturer_id: mfgFilter || undefined });
      setRows(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, mfgFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { mfgApi.list().then((res) => setMfgs(res.data)).catch(() => {}); }, []);

  const openNew = () => { setForm(EMPTY_FORM); setEditing({}); };
  const openEdit = (p) => { setForm({ ...EMPTY_FORM, ...p }); setEditing(p); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, manufacturer_id: Number(form.manufacturer_id), price: Number(form.price), retail_price: Number(form.retail_price) };
      if (editing?.id) {
        await productsApi.update(editing.id, payload);
        toast.success('Product updated.');
      } else {
        await productsApi.create(payload);
        toast.success('Product added.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!await confirm({
      title: 'Delete Product?',
      message: `Delete product "${p.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
    try {
      await productsApi.remove(p.id);
      toast.success('Product deleted.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p>{rows.length} total</p>
        </div>
        <button className="btn" onClick={openNew} disabled={mfgs.length === 0}><Plus size={16} /> Add Product</button>
      </div>

      {mfgs.length === 0 && !loading && (
        <div className="error-banner">
          Add a manufacturer first — products must be linked to one.
        </div>
      )}

       <div className="toolbar">
          <div className="toolbar-group">
            <input id="products-search" type="text" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="toolbar-group">
            <select id="products-manufacturer" value={mfgFilter} onChange={(e) => setMfgFilter(e.target.value)}>
              <option value="">All manufacturers</option>
              {mfgs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

      <div className="card">
        
        {loading ? (
          <TableSkeleton columns={7} rows={5} />
        ) : (
          <div className="table-wrap page-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Manufacturer</th>
                  <th>Size / Packaging</th>
                  <th className="num">Retail Price</th>
                  <th className="num">Invoice Price</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} data-status={p.is_active ? 'active' : 'inactive'}>
                    <td data-label="Product"><strong>{p.name}</strong></td>
                    <td data-label="Manufacturer">{p.manufacturer_name}</td>
                    <td data-label="Size / Packaging">{p.size_packaging || '—'}</td>
                    <td className="num" data-label="Retail Price">{money(p.retail_price)}</td>
                    <td className="num" data-label="Invoice Price">{money(p.price)}</td>
                    <td data-label="Status">{p.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-neutral">inactive</span>}</td>
                    <td className="table-actions">
                      <button className="btn-ghost" onClick={() => openEdit(p)} title="Edit" aria-label="Edit"><Pencil size={15} /></button>
                      <button className="btn-ghost" onClick={() => handleDelete(p)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7}><div className="empty-state">No products found.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="table-footer">
            Showing 1 to {rows.length} of {rows.length} product{rows.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'Edit Product' : 'Add Product'} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Manufacturer</label>
              <select value={form.manufacturer_id} onChange={(e) => setForm({ ...form, manufacturer_id: e.target.value })} required>
                <option value="" disabled>Select a manufacturer</option>
                {mfgs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Product Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Size / Packaging</label>
                <input value={form.size_packaging} onChange={(e) => setForm({ ...form, size_packaging: e.target.value })} placeholder="e.g. 500ml x 24" />
              </div>
              <div className="field">
                <label>Invoice Price</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>Retail Price</label>
              <input type="number" step="0.01" min="0" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} required />
            </div>
            <button className="btn" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
