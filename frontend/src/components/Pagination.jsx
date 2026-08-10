import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, pageSize } = pagination;
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
        Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total}</strong>
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--ink-muted)', minWidth: 70, textAlign: 'center' }}>
          Page {page} of {totalPages}
        </span>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
