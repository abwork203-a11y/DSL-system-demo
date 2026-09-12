import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmModal } from '../components/StatusModals';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null); // { options } | null
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ options, loading: false });
    });
  }, []);

  const settle = (value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
  };

  // Supports an optional async onConfirm inside options for callers that
  // want the modal to stay open (with its confirm button spinning) until
  // the actual action finishes — e.g. an in-flight delete request — rather
  // than resolving true immediately and closing before the caller's own
  // await completes. Plain confirm({...}) with no onConfirm behaves exactly
  // like window.confirm(): resolves true/false the instant a button is
  // clicked.
  const handleConfirm = async () => {
    const onConfirm = request?.options?.onConfirm;
    if (!onConfirm) return settle(true);

    setRequest((r) => ({ ...r, loading: true }));
    try {
      await onConfirm();
      settle(true);
    } catch {
      // The action itself is responsible for surfacing its own error (e.g.
      // via toast) — this just stops treating the confirmation as settled
      // so the modal closes rather than hanging open silently.
      settle(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmModal
          title={request.options.title || 'Are you sure?'}
          message={request.options.message}
          confirmLabel={request.options.confirmLabel}
          cancelLabel={request.options.cancelLabel}
          danger={request.options.danger}
          icon={request.options.icon}
          loading={request.loading}
          onConfirm={handleConfirm}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
