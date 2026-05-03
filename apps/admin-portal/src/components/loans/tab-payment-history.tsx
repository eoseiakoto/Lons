'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Receipt } from 'lucide-react';

const CONTRACT_REPAYMENTS_QUERY = gql`
  query ContractRepayments($contractId: ID!, $pagination: PaginationInput) {
    repayments(contractId: $contractId, pagination: $pagination) {
      edges {
        node {
          id amount currency paymentMethod referenceNumber
          status paidAt createdAt
          allocation { principal interest fees penalties }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface TabPaymentHistoryProps {
  contractId: string;
  currency: string;
}

export function TabPaymentHistory({ contractId, currency }: TabPaymentHistoryProps) {
  const { t } = useI18n();
  const { data, loading } = useQuery(CONTRACT_REPAYMENTS_QUERY, {
    variables: { contractId, pagination: { first: 50 } },
  });

  const repayments = data?.repayments?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-[color:var(--bg-muted)] rounded" />
        ))}
      </div>
    );
  }

  if (repayments.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('loans.paymentHistory.emptyTitle')}
        description={t('loans.paymentHistory.emptyDescription')}
      />
    );
  }

  return (
    <div className="overflow-hidden">
      <DataTable
        columns={[
          { header: t('loans.paymentHistory.column.date'), accessor: (r: any) => formatDate(r.paidAt || r.createdAt) },
          { header: t('loans.paymentHistory.column.amount'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.amount, r.currency || currency)}</span> },
          {
            header: t('loans.paymentHistory.column.allocation'),
            accessor: (r: any) => {
              const a = r.allocation;
              if (!a) return '-';
              return (
                <div className="text-xs space-y-0.5 tabular-nums">
                  {a.principal && <span className="block">{t('loans.paymentHistory.allocation.principal')} {formatMoney(a.principal, currency)}</span>}
                  {a.interest && <span className="block">{t('loans.paymentHistory.allocation.interest')} {formatMoney(a.interest, currency)}</span>}
                  {a.fees && <span className="block">{t('loans.paymentHistory.allocation.fees')} {formatMoney(a.fees, currency)}</span>}
                  {a.penalties && <span className="block">{t('loans.paymentHistory.allocation.penalties')} {formatMoney(a.penalties, currency)}</span>}
                </div>
              );
            },
          },
          { header: t('loans.paymentHistory.column.method'), accessor: (r: any) => (r.paymentMethod || '-').replace(/_/g, ' ') },
          { header: t('loans.paymentHistory.column.reference'), accessor: (r: any) => r.referenceNumber || '-' },
          { header: t('loans.paymentHistory.column.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        data={repayments}
      />
    </div>
  );
}
