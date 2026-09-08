import { useEffect, useState } from 'react';
import client, { apiErrorMessage } from '../api/client';
import { exportApi, orders as ordersApi, backups as backupsApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import {
  requestGoogleAccessToken, findOrCreateFolder, uploadFileToFolder, driveFolderUrl,
} from '../utils/googleDrive';
import { monthToDateRange } from '../utils/dateRange';
import { GOOGLE_CLIENT_ID } from '../config';

const PARENT_FOLDER_NAME = 'DSL System Backups';

function timestampFolderName(monthStr) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
  if (!monthStr) return `Backup ${stamp}`;
  const label = new Date(`${monthStr}-01T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  return `${label} Backup — ${stamp}`;
}

async function fetchBlob(url) {
  const res = await client.get(url, { responseType: 'blob' });
  return res.data;
}

// The orders endpoint is now paginated (see orderController.js) — a backup
// needs every order regardless of how many pages that is, so we walk pages
// until there's nothing left rather than assuming one request returns
// everything (which would silently only back up the first ~50 orders once a
// business has more than that).
async function fetchAllOrders({ date_from, date_to } = {}) {
  const all = [];
  let page = 1;
  const pageSize = 200; // MAX_PAGE_SIZE server-side — fewest round-trips while staying within what the API allows
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await ordersApi.list({ page, pageSize, date_from, date_to });
    all.push(...res.data.data);
    if (page >= res.data.pagination.totalPages) break;
    page += 1;
  }
  return all;
}

export default function BackupPage() {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total, label }
  const [lastResult, setLastResult] = useState(null); // { folderUrl, fileCount }
  const [month, setMonth] = useState(''); // '' = all-time, otherwise 'YYYY-MM'
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await backupsApi.list(10);
      setHistory(res.data);
    } catch {
      // History is a nice-to-have on this page — a failed fetch shouldn't
      // block the backup button itself, so just leave the list empty.
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const runBackup = async () => {
    setRunning(true);
    setLastResult(null);
    const { startDate, endDate } = monthToDateRange(month);
    try {
      setProgress({ current: 0, total: 1, label: 'Signing in to Google…' });
      const accessToken = await requestGoogleAccessToken();

      setProgress({ current: 0, total: 1, label: 'Preparing Drive folders…' });
      const parentId = await findOrCreateFolder(accessToken, PARENT_FOLDER_NAME);
      const folderName = timestampFolderName(month);
      const folderId = await findOrCreateFolder(accessToken, folderName, parentId);

      // Build the full list of files this backup will contain up front so we
      // can show real progress instead of a spinner with no sense of scale.
      setProgress({ current: 0, total: 1, label: 'Fetching order list…' });
      const allOrders = await fetchAllOrders({ date_from: startDate, date_to: endDate });

      const jobs = [
        { filename: 'products.xlsx', url: exportApi.productsUrl() },
        { filename: 'distributors.xlsx', url: exportApi.distributorsUrl() },
        { filename: 'ledger.xlsx', url: exportApi.ledgerUrl('excel', { start_date: startDate, end_date: endDate }) },
        ...allOrders.map((o) => ({
          filename: `invoice-${o.order_number}.xlsx`,
          url: exportApi.invoiceUrl(o.id, 'excel'),
        })),
      ];

      let uploaded = 0;
      const failures = [];
      for (const job of jobs) {
        setProgress({ current: uploaded, total: jobs.length, label: `Backing up ${job.filename}…` });
        try {
          const blob = await fetchBlob(job.url);
          await uploadFileToFolder(accessToken, folderId, job.filename, blob);
        } catch (err) {
          failures.push(job.filename);
        }
        uploaded += 1;
        setProgress({ current: uploaded, total: jobs.length, label: `Backed up ${uploaded} of ${jobs.length}…` });
      }

      const folderUrl = driveFolderUrl(folderId);
      const fileCount = jobs.length - failures.length;
      setLastResult({ folderUrl, fileCount, failures });

      // Log the receipt server-side — no files, just the summary — so
      // Backup History and the month-end reminder have something to check.
      // This is best-effort: if it fails, the backup itself already
      // succeeded and shouldn't be reported as an error to the user.
      try {
        await backupsApi.create({
          folder_name: folderName,
          folder_url: folderUrl,
          period_start: startDate || null,
          period_end: endDate || null,
          file_count: fileCount,
          failed_count: failures.length,
        });
        loadHistory();
      } catch {
        // Non-fatal — see comment above.
      }

      if (failures.length === 0) {
        toast.success(`Backup complete — ${jobs.length} files uploaded to Google Drive.`);
      } else {
        toast.error(`Backup finished with ${failures.length} file(s) that failed to upload.`);
      }
    } catch (err) {
      toast.error(err.message || apiErrorMessage(err));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="content" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div>
          <h1>Backup to Google Drive</h1>
          <p>Exports every product, distributor, ledger entry, and order invoice as Excel files into your own Google Drive.</p>
        </div>
      </div>

      {!GOOGLE_CLIENT_ID && (
        <div className="error-banner" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>
          Google Drive backup isn't configured yet. See <code>GOOGLE_DRIVE_SETUP.md</code> for how to get a
          Google Client ID and add it to <code>frontend/.env</code>.
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 10 }}>How this works</h2>
        <ul style={{ color: 'var(--ink-muted)', fontSize: 13.5, lineHeight: 1.9, paddingLeft: 18, marginBottom: 20 }}>
          <li>You'll be asked to sign in to Google <strong>every time</strong> — nothing about your Google account is ever stored by this app.</li>
          <li>Files upload directly from your browser to your Drive; this app's server never sees your Google credentials.</li>
          <li>Access is limited to files this app creates (Google's "drive.file" scope) — it cannot see or touch anything else in your Drive.</li>
          <li>Each backup creates a new dated folder inside <strong>{PARENT_FOLDER_NAME}</strong>, so previous backups are never overwritten.</li>
          <li>For businesses with many orders, this can take a little while — a separate invoice file is created per order.</li>
        </ul>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 6 }}>
            Scope
          </label>
         <select
  className="form-control"
  value={month ? 'month' : 'all'}
  onChange={(e) => setMonth(e.target.value === 'all' ? '' : month || new Date().toISOString().slice(0, 7))}
  disabled={running}
  style={{ marginRight: 8 }}
>
  <option value="all">All-time (everything)</option>
  <option value="month">One month only</option>
</select>
{month !== '' && (
  <input
    className="form-control"
    type="month"
    value={month}
    onChange={(e) => setMonth(e.target.value)}
    disabled={running}
    max={new Date().toISOString().slice(0, 7)}
  />
)}
          <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>
            {month
              ? 'Orders, invoices, and ledger entries will be limited to that month. Products and distributors are always the current full list — they aren\'t "for" a specific month.'
              : 'Backs up every order, invoice, and ledger entry — the full history, not just recent activity.'}
          </p>
        </div>

        <button className="btn" onClick={runBackup} disabled={running || !GOOGLE_CLIENT_ID}>
          {running ? 'Backing up…' : 'Backup Now'}
        </button>

        {progress && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 6 }}>{progress.label}</div>
            <div style={{ background: 'var(--surface-sunken)', borderRadius: 100, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                background: 'var(--accent)', height: '100%', transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        {lastResult && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13.5 }}>
              Uploaded <strong className="num">{lastResult.fileCount}</strong> file(s).{' '}
              <a href={lastResult.folderUrl} target="_blank" rel="noopener noreferrer" className="link-btn">Open folder in Drive →</a>
            </p>
            {lastResult.failures.length > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>
                Failed: {lastResult.failures.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 12 }}>Backup History</h2>
        {historyLoading ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>No backups recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Scope</th>
                <th>Files</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.created_at).toLocaleString()}</td>
                  <td>
                    {b.period_start
                      ? new Date(`${b.period_start}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
                      : 'All-time'}
                  </td>
                  <td>
                    {b.file_count}
                    {b.failed_count > 0 && (
                      <span style={{ color: 'var(--red)', marginLeft: 6 }}>({b.failed_count} failed)</span>
                    )}
                  </td>
                  <td>{b.user_name || '—'}</td>
                  <td>
                    <a href={b.folder_url} target="_blank" rel="noopener noreferrer" className="link-btn">
                      Open in Drive →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
