const TONES = {
  paid: 'green',
  active: 'green',
  completed: 'green',
  credit: 'green',
  partial: 'amber',
  pending: 'amber',
  current: 'amber',
  debit: 'amber',
  unpaid: 'red',
  inactive: 'red',
  cancelled: 'red',
};

export default function StatusBadge({ value }) {
  const tone = TONES[value] || 'neutral';
  return <span className={`badge badge-${tone}`}>{value}</span>;
}
