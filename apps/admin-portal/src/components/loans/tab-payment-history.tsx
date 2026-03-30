'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
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
  const { data, loading } = useQuery(CONTRACT_REPAYMENTS_QUERY, {
    variables: { contractId, pagination: { first: 50 } },
  });

  const repayments = data?.repayments?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  if (repayments.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No Payments"
        description="No payments have been recorded for this contract."
      />
    );
  }

  return (
    <div className="overflow-hidden">
      <DataTable
        columns={[
          { header: 'Date', accessor: (r: any) => formatDate(r.paidAt || r.createdAt) },
          { header: 'Amount', accessor: (r: any) => formatMoney(r.amount, r.currency || currency) },
          {
            header: 'Allocation',
            accessor: (r: any) => {
              const a = r.allocation;
              if (!a) return '-';
              return (
                <div className="text-xs space-y-0.5">
                  {a.principal && <span className="block">P: {formatMoney(a.principal, currency)}</span>}
                  {a.interest && <span className="block">I: {formatMoney(a.interest, currency)}</span>}
                  {a.fees && <span className="block">F: {formatMoney(a.fees, currency)}</span>}
                  {a.penalties && <span className="block">Pen: {formatMoney(a.penalties, currency)}</span>}
                </div>
              );
            },
          },
          { header: 'Method', accessor: (r: any) => (r.paymentMethod || '-').replace(/_/g, ' ') },
          { header: 'Reference', accessor: (r: any) => r.referenceNumber || '-' },
          { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        data={repayments}
      />
    </div>
  );
}
