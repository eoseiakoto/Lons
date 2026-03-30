'use client';

import { Loader2 } from 'lucide-react';

interface PaginationControlsProps {
  hasNextPage: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function PaginationControls({ hasNextPage, loading, onLoadMore }: PaginationControlsProps) {
  if (!hasNextPage) return null;

  return (
    <div className="flex justify-center pt-4">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="glass-button text-sm flex items-center gap-2 disabled:opacity-50"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Loading...' : 'Load More'}
      </button>
    </div>
  );
}
