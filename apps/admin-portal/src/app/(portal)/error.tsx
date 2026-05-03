'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

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
    <div className="flex items-center justify-center min-h-[60vh] p-6">
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
          {t('common.error')}
        </h2>
        <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed mb-6">
          {error.message}
        </p>
        <button onClick={() => reset()} className="btn-primary text-sm">
          {t('common.tryAgain')}
        </button>
      </div>
    </div>
  );
}
