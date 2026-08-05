// A table full of shimmering placeholder rows, shown while real data loads.
export function TableSkeleton({ columns = 4, rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <div
              key={c}
              className="skeleton skeleton-text"
              style={{ maxWidth: c === 0 ? '40%' : '100%', opacity: 1 - r * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// A row of shimmering stat cards, for the dashboard's stat-grid while loading.
export function StatSkeleton({ count = 4 }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="stat-card" key={i}>
          <div className="skeleton skeleton-text" style={{ width: '60%', height: 11, marginBottom: 10 }} />
          <div className="skeleton skeleton-stat" />
        </div>
      ))}
    </div>
  );
}
