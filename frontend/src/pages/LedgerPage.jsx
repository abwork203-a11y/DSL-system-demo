import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const handleExport = async () => {
    setDownloading(true);
    try {
      await downloadFile(exportApi.ledgerUrl(distributorId || undefined), 'ledger.xlsx');
      toast.success('Ledger exported.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDownloading(false);
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
          <button className="btn btn-secondary" disabled={downloading} onClick={handleExport}>
            {downloading ? 'Preparing…' : 'Export Excel'}
          </button>
        )}
      </div>

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
          <TableSkeleton columns={distributor ? 6 : 7} rows={6} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {!distributor && <th>Distributor</th>}
                  <th>Date</th>
                  <th>Order</th>
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
                    <td><StatusBadge value={e.type} /></td>
                    <td className="num">{e.type === 'debit' ? '+' : '−'}{money(e.amount)}</td>
                    <td className="num">{money(e.running_balance)}</td>
                    <td style={{ color: 'var(--ink-muted)' }}>{e.note || '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={distributor ? 6 : 7}><div className="empty-state">No ledger entries yet.</div></td></tr>
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
