export default function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-ghost btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
