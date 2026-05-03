'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';
import { formatMoney, formatDate } from '@/lib/utils';
import { Receipt } from 'lucide-react';

const CUSTOMER_REPAYMENTS_QUERY = gql`
  query CustomerRepayments($customerId: ID!, $pagination: PaginationInput) {
    repayments(customerId: $customerId, pagination: $pagination) {
      edges {
        node {
          id contractId amount currency paymentMethod
          referenceNumber status paidAt createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
      totalAmount
    }
  }
`;

interface TabRepaymentHistoryProps {
  customerId: string;
  currency?: string;
}

export function TabRepaymentHistory({ customerId, currency = 'GHS' }: TabRepaymentHistoryProps) {
  const { t } = useI18n();
  const { data, loading } = useQuery(CUSTOMER_REPAYMENTS_QUERY, {
    variables: { customerId, pagination: { first: 50 } },
  });

  const repayments = data?.repayments?.edges?.map((e: any) => e.node) || [];
  const totalCount = data?.repayments?.totalCount ?? repayments.length;
  const totalAmount = data?.repayments?.totalAmount ?? null;

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

  if (repayments.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Receipt}
          title={t('customers.repaymentHistory.emptyTitle')}
          description={t('customers.repaymentHistory.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.repaymentHistory.totalPayments')}</p>
          <p className="text-xl font-bold text-[color:var(--text-primary)] mt-1">{totalCount}</p>
        </div>
        {totalAmount !== null && (
          <div className="card p-4">
            <p className="section-label">{t('customers.repaymentHistory.totalAmountPaid')}</p>
            <p className="text-xl font-semibold text-[color:var(--status-success-text)] mt-1 tabular-nums">{formatMoney(String(totalAmount), currency)}</p>
          </div>
        )}
      </div>

      <div className="card-flush overflow-hidden">
        <DataTable
          columns={[
            { header: t('customers.repaymentHistory.date'), accessor: (r: any) => formatDate(r.paidAt || r.createdAt) },
            { header: t('common.amount'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.amount, r.currency || currency)}</span> },
            { header: t('customers.repaymentHistory.contract'), accessor: (r: any) => (r.contractId || '').slice(0, 8) + '...' },
            { header: t('customers.repaymentHistory.method'), accessor: (r: any) => (r.paymentMethod || '-').replace(/_/g, ' ') },
            { header: t('customers.repaymentHistory.reference'), accessor: (r: any) => r.referenceNumber || '-' },
            { header: t('common.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
          ]}
          data={repayments}
        />
      </div>
    </div>
  );
}
