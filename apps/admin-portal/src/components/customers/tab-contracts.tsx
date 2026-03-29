'use client';

import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { FileText } from 'lucide-react';

const CUSTOMER_CONTRACTS_QUERY = gql`
  query CustomerContracts($customerId: ID!, $pagination: PaginationInput) {
    contracts(customerId: $customerId, pagination: $pagination) {
      edges {
        node {
          id contractNumber productId currency
          principalAmount totalOutstanding
          status classification
          startDate maturityDate createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface TabContractsProps {
  customerId: string;
}

export function TabContracts({ customerId }: TabContractsProps) {
  const router = useRouter();
  const { data, loading } = useQuery(CUSTOMER_CONTRACTS_QUERY, {
    variables: { customerId, pagination: { first: 50 } },
  });

  const contracts = data?.contracts?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="glass p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="glass">
        <EmptyState
          icon={FileText}
          title="No Contracts"
          description="This customer does not have any contracts yet."
        />
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <DataTable
        columns={[
          { header: 'Contract #', accessor: 'contractNumber' },
          { header: 'Product', accessor: 'productId' },
          { header: 'Principal', accessor: (r: any) => formatMoney(r.principalAmount, r.currency) },
          { header: 'Outstanding', accessor: (r: any) => formatMoney(r.totalOutstanding || '0', r.currency) },
          { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
          { header: 'Classification', accessor: (r: any) => <StatusBadge status={r.classification} /> },
          { header: 'Disbursed', accessor: (r: any) => formatDate(r.startDate) },
        ]}
        data={contracts}
        onRowClick={(r: any) => router.push(`/loans/contracts/${r.id}`)}
      />
    </div>
  );
}
