'use client';

import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package } from 'lucide-react';

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
    }
  }
`;

export default function TenantProductsPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const { data } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });

  const tenantName = data?.tenant?.name || 'Tenant';

  return (
    <div className="space-y-6">
      <Link href={`/tenants/${tenantId}`} className="inline-flex items-center text-sm text-white/40 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to {tenantName}
      </Link>

      <div className="glass p-8 text-center">
        <Package className="w-12 h-12 text-blue-400/60 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Products for {tenantName}
        </h3>
        <p className="text-sm text-white/40 max-w-md mx-auto">
          Requires platform admin API extension (tenant override query parameter).
          The backend needs to support cross-tenant queries for platform administrators.
        </p>
      </div>
    </div>
  );
}
