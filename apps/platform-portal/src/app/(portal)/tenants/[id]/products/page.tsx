'use client';

import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatMoney } from '@/lib/utils';

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
    }
  }
`;

const PRODUCTS_QUERY = gql`
  query Products($pagination: PaginationInput, $tenantId: ID) {
    products(pagination: $pagination, tenantId: $tenantId) {
      edges {
        node {
          id
          code
          name
          type
          currency
          status
          interestRate
          version
          activeContractsCount
          totalDisbursed
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function TenantProductsPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const { data: tenantData } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });
  const { data: productsData, loading } = useQuery(PRODUCTS_QUERY, {
    variables: { pagination: { first: 50 }, tenantId },
  });

  const tenantName = tenantData?.tenant?.name || 'Tenant';
  const products = productsData?.products?.edges?.map((e: any) => e.node) || [];

  return (
    <div className="space-y-8 animate-enter">
      <Link href={`/tenants/${tenantId}`} className="inline-flex items-center text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to {tenantName}
      </Link>

      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Products — {tenantName}</h1>

      {loading ? (
        <div className="text-sm text-[color:var(--text-secondary)]">Loading products...</div>
      ) : (
        <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <DataTable
            columns={[
              { header: 'Code', accessor: 'code' },
              { header: 'Name', accessor: 'name' },
              { header: 'Type', accessor: (r: any) => r.type.replace(/_/g, ' ') },
              { header: 'Currency', accessor: 'currency' },
              { header: 'Rate %', accessor: (r: any) => <span className="tabular-nums">{parseFloat(r.interestRate).toFixed(1)}%</span> },
              { header: 'Active Contracts', accessor: (r: any) => <span className="tabular-nums">{r.activeContractsCount ?? 0}</span> },
              { header: 'Total Disbursed', accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalDisbursed ?? '0', 'GHS')}</span> },
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Created', accessor: (r: any) => formatDate(r.createdAt) },
            ]}
            data={products}
            emptyMessage="No products found for this tenant"
          />
        </div>
      )}
    </div>
  );
}
