import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import { Loader2 } from 'lucide-react';
import { reports, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/Skeleton';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const toast = useToast();
  const [monthly, setMonthly] = useState([]);
  const [byDistributor, setByDistributor] = useState([]);
  const [byRep, setByRep] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(''); // '' | 'orders' | 'distributors' | 'products'
  const [exportProgress, setExportProgress] = useState(null);
  const exportingRef = useRef(false);

  useEffect(() => {
    Promise.all([
      reports.monthlySales(12),
      reports.performanceByDistributor(),
      reports.performanceByRep(),
      reports.topProducts(8),
    ])
      .then(([m, d, r, p]) => {
        setMonthly(m.data.map((row) => ({ ...row, month: new Date(row.month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), total_sales: Number(row.total_sales) })));
        setByDistributor(d.data.filter((row) => Number(row.total_sales) > 0).slice(0, 10));
        setByRep(r.data);
        setTopProducts(p.data);
      })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (which) => {
    if (exportingRef.current) return; // one export at a time — all three buttons are disabled while this is true, but a fast double-click on the same button could still slip through without this
    exportingRef.current = true;
    setExporting(which);
    setExportProgress(null);
    try {
      const url = which === 'orders' ? exportApi.ordersUrl() : which === 'distributors' ? exportApi.distributorsUrl() : exportApi.productsUrl();
      await downloadFile(url, `${which}.xlsx`, setExportProgress);
      toast.success(`${which[0].toUpperCase()}${which.slice(1)} exported.`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      exportingRef.current = false;
      setExporting('');
      setExportProgress(null);
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Sales performance and export tools.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={!!exporting} onClick={() => handleExport('orders')}>
              {exporting === 'orders' && <Loader2 size={14} className="spin" />} Export Orders
            </button>
            <button className="btn btn-secondary btn-sm" disabled={!!exporting} onClick={() => handleExport('distributors')}>
              {exporting === 'distributors' && <Loader2 size={14} className="spin" />} Export Distributors
            </button>
            <button className="btn btn-secondary btn-sm" disabled={!!exporting} onClick={() => handleExport('products')}>
              {exporting === 'products' && <Loader2 size={14} className="spin" />} Export Products
            </button>
          </div>
          {exporting && (
            <div style={{ width: 220 }}>
              <div className="progress-track">
                <div
                  className={`progress-fill${exportProgress == null ? ' indeterminate' : ''}`}
                  style={exportProgress != null ? { width: `${exportProgress}%` } : undefined}
                />
              </div>
              <p style={{ color: 'var(--ink-muted)', fontSize: 11.5, marginTop: 4, marginBottom: 0, textAlign: 'right' }}>
                Downloading your file{exportProgress != null ? `… ${exportProgress}%` : '…'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Monthly Sales — Last 12 Months</h2>
        {loading ? <TableSkeleton columns={1} rows={6} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthly} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E1D6" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#656F63' }} />
              <YAxis tick={{ fontSize: 12, fill: '#656F63' }} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #E2E1D6' }} />
              <Line type="monotone" dataKey="total_sales" stroke="#2F5D50" strokeWidth={2} dot={{ r: 3 }} name="Sales" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Top Distributors by Sales</h2>
        {loading ? <TableSkeleton columns={1} rows={5} /> : byDistributor.length === 0 ? <div className="empty-state">No sales data yet.</div> : (
          <ResponsiveContainer width="100%" height={Math.max(220, byDistributor.length * 34)}>
            <BarChart data={byDistributor} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E1D6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#656F63' }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#1B211D' }} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #E2E1D6' }} />
              <Bar dataKey="total_sales" fill="#2F5D50" radius={[0, 4, 4, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Sales Rep Performance</h2>
        {loading ? <TableSkeleton columns={3} rows={3} /> : (
          <>
            {/* Small screens: pill cards (shown only below 640px).
                Must sit directly before .table-wrap. */}
            <div className="list-cards">
              {byRep.map((r) => (
                <div key={r.id} className="pill-card">
                  <div className="pill-card-left">
                    <div className="pill-card-name">{r.name}</div>
                  </div>
                  <div className="pill-card-divider" />
                  <div className="pill-card-rows">
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Orders</span>
                      <span className="pill-card-row-value">{r.order_count}</span>
                    </div>
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Total Sales</span>
                      <span className="pill-card-row-value">{money(r.total_sales)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {byRep.length === 0 && <div className="empty-state">No sales reps yet.</div>}
            </div>

            {/* Larger screens: the original table, unchanged. */}
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Rep</th><th className="num">Orders</th><th className="num">Total Sales</th></tr></thead>
                <tbody>
                  {byRep.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Rep">{r.name}</td>
                      <td className="num" data-label="Orders">{r.order_count}</td>
                      <td className="num" data-label="Total Sales">{money(r.total_sales)}</td>
                    </tr>
                  ))}
                  {byRep.length === 0 && <tr><td colSpan={3}><div className="empty-state">No sales reps yet.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Top Products by Revenue</h2>
        {loading ? <TableSkeleton columns={4} rows={5} /> : (
          <>
            {/* Small screens: pill cards (shown only below 640px). */}
            <div className="list-cards">
              {topProducts.map((p) => (
                <div key={p.id} className="pill-card">
                  <div className="pill-card-left">
                    <div className="pill-card-name">{p.name}</div>
                    <div className="pill-card-sub">{p.manufacturer_name}</div>
                  </div>
                  <div className="pill-card-divider" />
                  <div className="pill-card-rows">
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Qty Sold</span>
                      <span className="pill-card-row-value">{Number(p.total_quantity)}</span>
                    </div>
                    <div className="pill-card-row">
                      <span className="pill-card-row-label">Revenue</span>
                      <span className="pill-card-row-value">{money(p.total_revenue)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && <div className="empty-state">No sales data yet.</div>}
            </div>

            {/* Larger screens: the original table, unchanged. */}
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Manufacturer</th><th className="num">Qty Sold</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Product">{p.name}</td>
                      <td data-label="Manufacturer">{p.manufacturer_name}</td>
                      <td className="num" data-label="Qty Sold">{Number(p.total_quantity)}</td>
                      <td className="num" data-label="Revenue">{money(p.total_revenue)}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={4}><div className="empty-state">No sales data yet.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
