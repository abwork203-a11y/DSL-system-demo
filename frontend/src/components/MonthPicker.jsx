import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonthValue, shiftMonth } from '../utils/months';

// value is a 'YYYY-MM' string, or '' meaning "All time" (only when allowAll is set).
export default function MonthPicker({ value, onChange, allowAll = false }) {
  const thisMonth = currentMonthValue();
  const isAll = value === '';

  return (
    <div className="month-picker">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(shiftMonth(value, -1))}
        disabled={isAll}
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>

      <input
        type="month"
        aria-label="Select month"
        value={value}
        max={thisMonth}
        onChange={(e) => {
          // The browser gives '' if the user clears the field.
          if (e.target.value) onChange(e.target.value);
          else if (allowAll) onChange('');
        }}
      />

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={isAll || value >= thisMonth}
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(thisMonth)}
        disabled={value === thisMonth}
      >
        This month
      </button>

      {allowAll && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('')} disabled={isAll}>
          All time
        </button>
      )}
    </div>
  );
}
