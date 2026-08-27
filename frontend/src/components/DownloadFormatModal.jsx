import { FileSpreadsheet, FileText } from 'lucide-react';
import Modal from './Modal';

// Small modal offering a choice of download format. `onSelect(format)` is
// called with 'excel' or 'pdf' — wire it to whatever download function the
// page already uses for each format (this component doesn't know how to
// actually fetch/save files, it just presents the choice).
export default function DownloadFormatModal({ onClose, onSelect, downloading }) {
  return (
    <Modal title="Download" onClose={onClose} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!!downloading}
          onClick={() => onSelect('excel')}
          style={{ justifyContent: 'flex-start' }}
        >
          <FileSpreadsheet size={16} />
          {downloading === 'excel' ? 'Preparing…' : 'Excel (.xlsx)'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!!downloading}
          onClick={() => onSelect('pdf')}
          style={{ justifyContent: 'flex-start' }}
        >
          <FileText size={16} />
          {downloading === 'pdf' ? 'Preparing…' : 'PDF (.pdf)'}
        </button>
      </div>
    </Modal>
  );
}
