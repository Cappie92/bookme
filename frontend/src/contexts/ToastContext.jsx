import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

/**
 * Lightweight Toast provider. Use instead of window.alert for success/error feedback.
 * Renders a floating toast at bottom-right, auto-dismisses after 3s.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  /** options.quiet — компактный тост (booking actions), без «тяжёлого» ощущения */
  const showToast = useCallback((message, type = 'success', options = {}) => {
    const quiet = Boolean(options?.quiet);
    setToast({ message, type, quiet });
    const ms = quiet ? 2200 : 3000;
    setTimeout(() => setToast(null), ms);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={
            toast.quiet
              ? 'fixed bottom-4 right-4 z-[9999] max-w-[min(92vw,220px)] rounded-md px-3 py-2 text-xs font-normal leading-snug shadow-md text-white'
              : 'fixed bottom-6 right-6 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium'
          }
          style={{
            backgroundColor: toast.type === 'error' ? '#dc2626' : toast.quiet ? 'rgba(22, 163, 74, 0.92)' : '#16a34a',
          }}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: use console if ToastProvider not mounted (e.g. in tests)
    return {
      showToast: (msg, type, opts) => {
        console.log(`[Toast ${type}]:`, msg, opts);
      },
    };
  }
  return ctx;
}
