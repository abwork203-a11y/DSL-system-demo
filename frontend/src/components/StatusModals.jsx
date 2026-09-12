import { Trash2, HelpCircle, CheckCircle2, XCircle, Info, Loader2, Check, Save } from 'lucide-react';

// Shared shell for every status-style modal: overlay, centered card, a
// colored icon circle, title, and a body slot for message/actions. This is
// deliberately a different shape from components/Modal.jsx (which has a
// header bar with title+X, used for the Create/Edit forms) — status modals
// communicate a state (working, done, failed, confirm?) rather than
// hosting a form, so they lead with an icon instead of a header.
//
// Tones map to the app's existing fixed-meaning status tokens, never
// theme-adaptive ones — --status-positive is green in every theme, the
// same way a "success" checkmark should never mean something different
// just because someone switched the app's visual theme.
function StatusModalShell({ tone, icon: Icon, iconSpin, title, onClose, width = 400, children }) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <div className="status-modal" style={{ maxWidth: width }}>
        {onClose && (
          <button className="status-modal-close" onClick={onClose} aria-label="Close">✕</button>
        )}
        <div className={`status-modal-icon status-modal-icon-${tone}`}>
          <Icon size={26} className={iconSpin ? 'spin' : undefined} />
        </div>
        <h2 className="status-modal-title">{title}</h2>
        <div className="status-modal-body">{children}</div>
      </div>
    </div>
  );
}

// Generic confirm/cancel — the app-wide replacement for window.confirm().
// `danger` switches both the icon/tone and the confirm button to the red
// danger treatment, for destructive actions specifically (deletes,
// discards) as opposed to neutral confirmations.
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  icon,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const Icon = icon || (danger ? Trash2 : HelpCircle);
  return (
    <StatusModalShell
      tone={danger ? 'negative' : 'neutral'}
      icon={Icon}
      title={title}
      onClose={loading ? undefined : onCancel}
    >
      {message && <p className="status-modal-message">{message}</p>}
      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
        <button className={danger ? 'btn btn-danger' : 'btn'} disabled={loading} onClick={onConfirm}>
          {loading && <Loader2 size={16} className="spin" />}
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </StatusModalShell>
  );
}

export function SuccessModal({ title, message, primaryLabel = 'Close', onPrimary, secondaryLabel, onSecondary }) {
  return (
    <StatusModalShell tone="positive" icon={CheckCircle2} title={title} onClose={onPrimary}>
      {message && <p className="status-modal-message">{message}</p>}
      <div className="modal-actions" style={{ justifyContent: secondaryLabel ? 'space-between' : 'flex-end' }}>
        {secondaryLabel && <button className="btn btn-secondary" onClick={onSecondary}>{secondaryLabel}</button>}
        <button className="btn" onClick={onPrimary}>{primaryLabel}</button>
      </div>
    </StatusModalShell>
  );
}

export function ErrorModal({ title = 'Something went wrong!', message, detail, retryLabel = 'Try Again', onRetry, onClose }) {
  return (
    <StatusModalShell tone="negative" icon={XCircle} title={title} onClose={onClose}>
      {message && <p className="status-modal-message">{message}</p>}
      {detail && <div className="status-modal-detail">{detail}</div>}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        {onRetry && <button className="btn" onClick={onRetry}>{retryLabel}</button>}
      </div>
    </StatusModalShell>
  );
}

export function InfoModal({ title, children, onClose }) {
  return (
    <StatusModalShell tone="neutral" icon={Info} title={title} onClose={onClose}>
      <div className="status-modal-message">{children}</div>
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </StatusModalShell>
  );
}

// No onClose, ever — same "don't interrupt this" framing as SavingModal
// below, for a multi-step operation the user shouldn't back out of
// mid-flight (e.g. order creation, once the request is already in transit).
export function LoadingModal({ title = 'Processing…', message = 'Please wait while we complete your request.', steps }) {
  return (
    <StatusModalShell tone="neutral" icon={Loader2} iconSpin title={title}>
      <p className="status-modal-message">{message}</p>
      {steps && (
        <ul className="status-modal-steps">
          {steps.map((s) => (
            <li key={s.label} className={`status-modal-step status-modal-step-${s.status}`}>
              {s.status === 'done' && <Check size={14} />}
              {s.status === 'active' && <Loader2 size={14} className="spin" />}
              {s.status === 'pending' && <span className="status-modal-step-dot" />}
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </StatusModalShell>
  );
}

// Also never closeable — "Please don't close this window" is the point.
// `progress` is an optional 0-100 number; omit it for an operation with no
// meaningful sense of percent-complete (the bar just doesn't render).
export function SavingModal({ title = 'Saving Changes…', message = "Please don't close this window.", progress }) {
  return (
    <StatusModalShell tone="neutral" icon={Save} title={title}>
      <p className="status-modal-message">{message}</p>
      {typeof progress === 'number' && (
        <div className="status-modal-progress">
          <div className="status-modal-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </StatusModalShell>
  );
}
