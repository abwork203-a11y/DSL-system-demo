import { useId, useState } from 'react';
import { SlidersHorizontal, FilterX } from 'lucide-react';

/**
 * Search + filters bar.
 *
 * Desktop: renders exactly like a normal .toolbar (search and filters inline).
 * <=768px: the search box sits next to a "Filters" button; the filters live in
 * a collapsible panel with a Reset button (see COLLAPSIBLE TOOLBAR in ui.css).
 *
 * Props
 *  - search:      the search .toolbar-group (give it className "toolbar-group toolbar-search")
 *  - children:    the filter .toolbar-group elements
 *  - activeCount: number of filters currently applied (search excluded) — shown as a badge
 *  - onReset:     clears the filters; the panel also collapses afterwards
 */
export default function FilterToolbar({ search, children, activeCount = 0, onReset }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const handleReset = () => {
    onReset?.();
    setOpen(false);
  };

  return (
    <div className="toolbar toolbar-collapsible">
      <div className="toolbar-search-row">
        {search}

        <button
          type="button"
          className={`toolbar-filter-btn${open ? ' is-open' : ''}${activeCount > 0 ? ' has-active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <SlidersHorizontal size={16} strokeWidth={2} />
          Filters
          {activeCount > 0 && <span className="toolbar-filter-badge">{activeCount}</span>}
        </button>
      </div>

      <div id={panelId} className={`toolbar-filters${open ? ' is-open' : ''}`}>
        <div className="toolbar-filters-inner">
          {children}

          <div className="toolbar-filters-footer">
            <button
              type="button"
              className="toolbar-reset-btn"
              onClick={handleReset}
              disabled={activeCount === 0}
            >
              <FilterX size={15} strokeWidth={2} />
              Reset filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
