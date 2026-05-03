'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useParams } from 'next/navigation';

interface TenantOverrideContextValue {
  tenantId: string | null;
}

const TenantOverrideContext = createContext<TenantOverrideContextValue>({ tenantId: null });

export function useTenantOverride() {
  return useContext(TenantOverrideContext);
}

/**
 * Provides a tenant override context for platform admin drill-down pages.
 * Wraps children and exposes the tenantId from the URL params.
 */
export function TenantOverrideProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const tenantId = (params?.id as string) || null;
  const value = useMemo(() => ({ tenantId }), [tenantId]);
  return (
    <TenantOverrideContext.Provider value={value}>
      {children}
    </TenantOverrideContext.Provider>
  );
}
