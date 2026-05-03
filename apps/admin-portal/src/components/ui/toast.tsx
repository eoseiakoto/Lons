'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const iconByType: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const accentByType: Record<ToastType, string> = {
  success: 'var(--status-success)',
  error: 'var(--status-error)',
  info: 'var(--status-info)',
};

const textByType: Record<ToastType, string> = {
  success: 'var(--status-success-text)',
  error: 'var(--status-error-text)',
  info: 'var(--status-info-text)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const Icon = iconByType[t.type];
          return (
            <div
              key={t.id}
              className="card-elevated flex items-start gap-3 px-4 py-3 min-w-[280px] animate-[slideInRight_0.24s_cubic-bezier(0.2,0,0,1)]"
              style={{ borderLeft: `3px solid ${accentByType[t.type]}` }}
            >
              <Icon
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: textByType[t.type] }}
              />
              <p className="text-sm text-[color:var(--text-primary)] flex-1 leading-relaxed">
                {t.message}
              </p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors p-0.5 rounded"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(16px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
