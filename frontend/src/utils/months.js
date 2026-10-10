// Helpers for "YYYY-MM" month strings (the format <input type="month"> uses
// and the format we send to the backend as ?month=2026-10).

export function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// shiftMonth('2026-01', -1) -> '2025-12'
export function shiftMonth(value, delta) {
  const [y, m] = value.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// monthLabel('2026-09') -> 'September 2026'; monthLabel('2026-09', true) -> 'Sep 2026'; '' -> 'All time'
export function monthLabel(value, short = false) {
  if (!value) return 'All time';
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: short ? 'short' : 'long', year: 'numeric' });
}
