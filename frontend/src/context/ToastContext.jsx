import { createContext, useCallback, useContext, useState, useRef } from 'react';

const ToastContext = createContext(null);
let idCounter = 0;
const EXIT_ANIMATION_MS = 220; // must match .toast-leaving's animation duration in ui.css

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  // Two-phase removal: first mark the toast as leaving so its exit animation
  // plays, then actually drop it from state once that animation has had time
  // to finish. Calling dismiss() again on an already-leaving toast is a no-op.
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target || target.leaving) return prev;
      return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    });
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, EXIT_ANIMATION_MS);
  }, []);

  const push = useCallback((message, type = 'info', duration = 4500) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type, leaving: false }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg) => push(msg, 'success'),
    error: (msg) => push(msg, 'error', 6500),
    info: (msg) => push(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}${t.leaving ? ' toast-leaving' : ''}`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
