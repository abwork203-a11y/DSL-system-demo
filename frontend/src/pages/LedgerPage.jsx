import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, FileSpreadsheet, FileText, X } from 'lucide-react';
import { ledger as ledgerApi, distributors as distributorsApi, exportApi } from '../api/endpoints';
import { apiErrorMessage, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';

const PAGE_SIZE = 50;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LedgerPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const distributorId = searchParams.get('distributor_id') || '';

  const [distributorsList, setDistributorsList] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [distributor, setDistributor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const downloadingRef = useRef(false);
  const [exportMonth, setExportMonth] = useState(''); // 'YYYY-MM', empty = all time
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Converts a 'YYYY-MM' month string into the start_date/end_date pair the
  // backend already accepts (both exportLedgerExcel/Pdf and the distributor
  // versions filter on these two params) — no new backend date format needed.
  function monthToDateRange(monthStr) {
    if (!monthStr) return { startDate: undefined, endDate: undefined };
    const [year, month] = monthStr.split('-').map(Number);
    const startDate = `${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this month
    const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }

  useEffect(() => { distributorsApi.list().then((res) => setDistributorsList(res.data)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (distributorId) {
        // A single distributor's full history — not paginated (see
        // ledgerController.js for why: naturally bounded to one business
        // relationship rather than the whole company's activity).
        const res = await ledgerApi.distributorSummary(distributorId);
        setDistributor(res.data.distributor);
        setEntries(res.data.entries);
        setPagination(null);
      } else {
        const res = await ledgerApi.list({ page, pageSize: PAGE_SIZE });
        setDistributor(null);
        setEntries(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId, page]);

  useEffect(() => { load(); }, [load]);

  const handleDistributorChange = (val) => {
    setPage(1);
    if (val) setSearchParams({ distributor_id: val });
    else setSearchParams({});
  };

  const handleExport = async (format) => {
    if (downloadingRef.current) return; // guard against a fast double-click starting two downloads
    downloadingRef.current = true;
    setShowDownloadModal(false);
    setDownloading(true);
    setDownloadProgress(null);
    try {
      const { startDate, endDate } = monthToDateRange(exportMonth);
      const monthLabel = exportMonth ? `-${exportMonth}` : '';
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      if (distributorId) {
        // The per-distributor "Customer Ledger" statement (header block +
        // Dr/Cr remarks) is a nicer format than the flat bulk export below —
        // use it whenever we're already filtered down to one distributor.
        const url = exportApi.distributorLedgerUrl(distributorId, format, { start_date: startDate, end_date: endDate });
        await downloadFile(url, `ledger-${distributor?.name || distributorId}${monthLabel}.${ext}`, setDownloadProgress);
      } else {
        const url = exportApi.ledgerUrl(format, { start_date: startDate, end_date: endDate });
        await downloadFile(url, `ledger${monthLabel}.${ext}`, setDownloadProgress);
      }
      toast.success('Ledger exported.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Ledger</h1>
          <p>{distributor ? `${distributor.name} — running balance` : `All distributors${pagination ? ` · ${pagination.total} entries` : ''}`}</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div className="export-toolbar">
              <input
                type="month"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                aria-label="Export month (leave blank for all time)"
                title="Leave blank to export all activity"
              />
              <button className="btn btn-secondary" disabled={downloading} onClick={() => setShowDownloadModal(true)}>
                {downloading && <Loader2 size={16} className="spin" />}
                {downloading ? 'Downloading…' : 'Download'}
              </button>
            </div>
            {downloading && (
              <div style={{ width: 180 }}>
                <div className="progress-track">
                  <div
                    className={`progress-fill${downloadProgress == null ? ' indeterminate' : ''}`}
                    style={downloadProgress != null ? { width: `${downloadProgress}%` } : undefined}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showDownloadModal && (
        <div className="modal-overlay" onClick={() => setShowDownloadModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Download</h2>
              <button className="btn-ghost" onClick={() => setShowDownloadModal(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="download-option" onClick={() => handleExport('excel')}>
                <FileSpreadsheet size={20} />
                Excel (.xlsx)
              </button>
              <button className="download-option" onClick={() => handleExport('pdf')}>
                <FileText size={20} />
                PDF (.pdf)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 240 }}>
          <label>Distributor</label>
          <select value={distributorId} onChange={(e) => handleDistributorChange(e.target.value)}>
            <option value="">All distributors</option>
            {distributorsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {distributor && (
          <div>
            <div className="stat-label">Current Balance</div>
            <div className="stat-value num">{money(distributor.balance)}</div>
          </div>
        )}
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton columns={distributor ? 7 : 8} rows={6} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {!distributor && <th>Distributor</th>}
                  <th>Date</th>
                  <th>Order</th>
                  <th>Payment Term</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                  <th className="num">Running Balance</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    {!distributor && <td>{e.distributor_name}</td>}
                    <td>{new Date(e.entry_date).toLocaleDateString()}</td>
                    <td>{e.order_number || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{e.payment_term || '—'}</td>
                    <td><StatusBadge value={e.type} /></td>
                    <td className="num">{e.type === 'debit' ? '+' : '−'}{money(e.amount)}</td>
                    <td className="num">{money(e.running_balance)}</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{e.note || '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={distributor ? 7 : 8}><div className="empty-state">No ledger entries yet.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!distributor && <Pagination pagination={pagination} onPageChange={setPage} />}
      </div>
    </div>
  );
}
