import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import { Loader2, Calendar, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { reports, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useToast } from '../context/ToastContext';
import { TableSkeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import MonthPicker from '../components/MonthPicker';
import { monthLabel } from '../utils/months';

// The three lists offered in the Download popup (keys match the backend routes).
const DOWNLOADS = [
  { key: 'products', label: 'Products' },
  { key: 'orders', label: 'Orders' },
  { key: 'distributors', label: 'Distributors' },
];

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
  const [month, setMonth] = useState(''); // 'YYYY-MM', or '' = all time (the old behaviour)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exporting, setExporting] = useState(''); // '' or e.g. 'orders:pdf' (which list : which format)
  const [exportProgress, setExportProgress] = useState(null);
  const exportingRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    const m = month || undefined; // undefined = don't send the param
    Promise.all([
      reports.monthlySales(12),
      reports.performanceByDistributor({ month: m }),
      reports.performanceByRep(m),
      reports.topProducts(8, m),
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
  }, [month]);

  const periodSuffix = month ? ` — ${monthLabel(month, true)}` : '';

  const handleExport = async (which, format) => {
    if (exportingRef.current) return; // one export at a time — all three buttons are disabled while this is true, but a fast double-click on the same button could still slip through without this
    exportingRef.current = true;
    setExporting(`${which}:${format}`);
    setExportProgress(null);
    try {
      const url = exportApi.tableUrl(which, format);
      await downloadFile(url, `${which}.${format === 'pdf' ? 'pdf' : 'xlsx'}`, setExportProgress);
      toast.success(`${which[0].toUpperCase()}${which.slice(1)} ${format === 'pdf' ? 'PDF' : 'Excel'} downloaded.`);
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
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPickerOpen(true)}
            title="Choose month"
            aria-label={`Choose month (showing ${monthLabel(month)})`}
          >
            <Calendar size={14} />
            {month && <span>{monthLabel(month, true)}</span>}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDownloadOpen(true)}>
            <Download size={14} /> Download
          </button>
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
        <h2 style={{ marginBottom: 16 }}>Top Distributors by Sales{periodSuffix}</h2>
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
        <h2 style={{ marginBottom: 14 }}>Sales Rep Performance{periodSuffix}</h2>
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
        <h2 style={{ marginBottom: 14 }}>Top Products by Revenue{periodSuffix}</h2>
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

      {downloadOpen && (
        <Modal title="Download" onClose={() => setDownloadOpen(false)}>
          <div className="download-list">
            {DOWNLOADS.map((item) => (
              <div key={item.key} className="download-row">
                <span className="download-row-label">{item.label}</span>
                <div className="download-row-actions">
                  <button
                    type="button"
                    className="download-icon-btn download-icon-pdf"
                    disabled={!!exporting}
                    onClick={() => handleExport(item.key, 'pdf')}
                    title={`Download ${item.label} as PDF`}
                    aria-label={`Download ${item.label} as PDF`}
                  >
                    {exporting === `${item.key}:pdf` ? <Loader2 size={18} className="spin" /> : <FileText size={18} />}
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    className="download-icon-btn download-icon-excel"
                    disabled={!!exporting}
                    onClick={() => handleExport(item.key, 'excel')}
                    title={`Download ${item.label} as Excel`}
                    aria-label={`Download ${item.label} as Excel`}
                  >
                    {exporting === `${item.key}:excel` ? <Loader2 size={18} className="spin" /> : <FileSpreadsheet size={18} />}
                    <span>Excel</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {exporting && (
            <div style={{ marginTop: 14 }}>
              <div className="progress-track">
                <div
                  className={`progress-fill${exportProgress == null ? ' indeterminate' : ''}`}
                  style={exportProgress != null ? { width: `${exportProgress}%` } : undefined}
                />
              </div>
              <p className="period-note" style={{ marginTop: 6 }}>
                Downloading your file{exportProgress != null ? `… ${exportProgress}%` : '…'}
              </p>
            </div>
          )}
        </Modal>
      )}

      {pickerOpen && (
        <Modal title="Select Month" onClose={() => setPickerOpen(false)}>
          <MonthPicker value={month} onChange={setMonth} allowAll />
          <p className="period-note" style={{ margin: '14px 0 16px' }}>
            Applies to distributors, reps and products. The monthly trend always shows the last 12 months, and exports are not filtered.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setPickerOpen(false)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Done
          </button>
        </Modal>
      )}

    </div>
  );
}
