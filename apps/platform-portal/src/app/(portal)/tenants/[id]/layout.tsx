'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { setTenantOverrideId } from '@/lib/apollo-client';

export default function TenantDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const tenantId = params?.id as string | undefined;

  useEffect(() => {
    if (tenantId) {
      setTenantOverrideId(tenantId);
    }
    return () => {
      setTenantOverrideId(null);
    };
  }, [tenantId]);

  return <>{children}</>;
}
