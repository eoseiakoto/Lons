'use client';

import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading } = useQuery(CUSTOMER_CONTRACTS_QUERY, {
    variables: { customerId, pagination: { first: 50 } },
  });

  const contracts = data?.contracts?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-[color:var(--bg-muted)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={FileText}
          title={t('customers.contracts.emptyTitle')}
          description={t('customers.contracts.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <div className="card-flush overflow-hidden">
      <DataTable
        columns={[
          { header: t('customers.contracts.contractNumber'), accessor: 'contractNumber' },
          { header: t('customers.contracts.product'), accessor: 'productId' },
          { header: t('customers.contracts.principal'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.principalAmount, r.currency)}</span> },
          { header: t('customers.contracts.outstanding'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalOutstanding || '0', r.currency)}</span> },
          { header: t('common.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
          { header: t('customers.contracts.classification'), accessor: (r: any) => <StatusBadge status={r.classification} /> },
          { header: t('customers.contracts.disbursed'), accessor: (r: any) => formatDate(r.startDate) },
        ]}
        data={contracts}
        onRowClick={(r: any) => router.push(`/loans/contracts/${r.id}`)}
      />
    </div>
  );
}
