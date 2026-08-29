import { FileSpreadsheet, FileText } from 'lucide-react';
import Modal from './Modal';

// Small modal offering a choice of download format. `onSelect(format)` is
// called with 'excel' or 'pdf' — wire it to whatever download function the
// page already uses for each format (this component doesn't know how to
// actually fetch/save files, it just presents the choice and a progress bar).
//
// `downloading`: '' | 'excel' | 'pdf' — which format is currently in flight,
// if any. `progress`: a 0-100 number, or `null` for an indeterminate bar
// (used when the server response has no Content-Length to compute a real
// percentage from — most of this app's exports stream their response, so
// this is the common case).
//
// While a download is in progress, both format buttons are disabled (so a
// second click can't kick off a second, overlapping download) and closing
// the modal is blocked — the download is still happening in the background
// either way, but closing mid-flight would hide that from the user and
// invite them to click "Download" again.
export default function DownloadFormatModal({ onClose, onSelect, downloading, progress }) {
  const isDownloading = !!downloading;

  return (
    <Modal title="Download" onClose={isDownloading ? () => {} : onClose} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isDownloading}
          onClick={() => onSelect('excel')}
          style={{ justifyContent: 'flex-start' }}
        >
          <FileSpreadsheet size={16} />
          {downloading === 'excel' ? 'Downloading…' : 'Excel (.xlsx)'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isDownloading}
          onClick={() => onSelect('pdf')}
          style={{ justifyContent: 'flex-start' }}
        >
          <FileText size={16} />
          {downloading === 'pdf' ? 'Downloading…' : 'PDF (.pdf)'}
        </button>

        {isDownloading && (
          <div style={{ marginTop: 4 }}>
            <div className="progress-track">
              <div
                className={`progress-fill${progress == null ? ' indeterminate' : ''}`}
                style={progress != null ? { width: `${progress}%` } : undefined}
              />
            </div>
            <p style={{ color: 'var(--ink-muted)', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {progress != null
                ? `Downloading your file… ${progress}%`
                : 'Downloading your file…'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
