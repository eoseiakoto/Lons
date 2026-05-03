'use client';

import { useEffect } from 'react';

export default function PortalError({
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
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Something went wrong</h2>
        <p className="text-sm text-[color:var(--text-secondary)]">{error.message}</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-[color:var(--accent-primary)] text-white text-sm rounded-lg hover:bg-[color:var(--accent-primary-hover)] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
