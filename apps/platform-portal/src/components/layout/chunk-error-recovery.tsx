'use client';

import { useEffect } from 'react';

/**
 * Listens for ChunkLoadError (stale webpack chunks after hot reload)
 * and automatically reloads the page to recover.
 *
 * This prevents the app from getting stuck on "Loading..." after
 * code changes trigger a dev server recompilation.
 */
export function ChunkErrorRecovery() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || '';
      const errorName = event.error?.name || '';

      if (
        errorName === 'ChunkLoadError' ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        // Prevent infinite reload loops: only reload once per 5 seconds
        const lastReload = sessionStorage.getItem('__chunk_reload_at');
        const now = Date.now();
        if (lastReload && now - Number(lastReload) < 5000) {
          return; // Already reloaded recently, don't loop
        }
        sessionStorage.setItem('__chunk_reload_at', String(now));
        window.location.reload();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const name = reason?.name || '';
      const msg = reason?.message || '';

      if (
        name === 'ChunkLoadError' ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        const lastReload = sessionStorage.getItem('__chunk_reload_at');
        const now = Date.now();
        if (lastReload && now - Number(lastReload) < 5000) {
          return;
        }
        sessionStorage.setItem('__chunk_reload_at', String(now));
        window.location.reload();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
