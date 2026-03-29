'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, type DocumentNode, type OperationVariables } from '@apollo/client';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export function usePaginatedQuery<TData = any>(
  query: DocumentNode,
  variables: OperationVariables = {},
  { pageSize = 20 }: { pageSize?: number } = {},
) {
  const { data, loading, error, fetchMore } = useQuery<TData>(query, {
    variables: { first: pageSize, ...variables },
    fetchPolicy: 'cache-and-network',
  });

  const loadMore = useCallback(
    (endCursor: string) =>
      fetchMore({
        variables: { after: endCursor },
        updateQuery: (prev: any, { fetchQueryResult }: any) => {
          if (!fetchQueryResult) return prev;
          const key = Object.keys(fetchQueryResult.data || {}).find(
            (k) => fetchQueryResult.data[k]?.edges,
          );
          if (!key) return prev;
          return {
            ...prev,
            [key]: {
              ...fetchQueryResult.data[key],
              edges: [...(prev[key]?.edges || []), ...fetchQueryResult.data[key].edges],
            },
          };
        },
      }),
    [fetchMore],
  );

  return { data, loading, error, loadMore };
}
