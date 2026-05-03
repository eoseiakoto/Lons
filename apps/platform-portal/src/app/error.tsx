'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module')
    ) {
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page p-6">
      <div className="card-elevated p-8 max-w-md text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--status-error-soft)' }}
        >
          <AlertTriangle
            className="w-5 h-5"
            style={{ color: 'var(--status-error)' }}
          />
        </div>
        <h2 className="text-[17px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed mb-6">
          {error.message}
        </p>
        <button onClick={() => reset()} className="btn-primary text-sm">
          Try again
        </button>
      </div>
    </div>
  );
}
