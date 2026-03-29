'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
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
  const { data, loading } = useQuery(CUSTOMER_REPAYMENTS_QUERY, {
    variables: { customerId, pagination: { first: 50 } },
  });

  const repayments = data?.repayments?.edges?.map((e: any) => e.node) || [];
  const totalCount = data?.repayments?.totalCount ?? repayments.length;
  const totalAmount = data?.repayments?.totalAmount ?? null;

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

  if (repayments.length === 0) {
    return (
      <div className="glass">
        <EmptyState
          icon={Receipt}
          title="No Repayments"
          description="This customer has not made any repayments yet."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass p-4">
          <p className="text-xs font-medium text-white/40 uppercase">Total Payments</p>
          <p className="text-xl font-bold text-white mt-1">{totalCount}</p>
        </div>
        {totalAmount !== null && (
          <div className="glass p-4">
            <p className="text-xs font-medium text-white/40 uppercase">Total Amount Paid</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{formatMoney(String(totalAmount), currency)}</p>
          </div>
        )}
      </div>

      <div className="glass overflow-hidden">
        <DataTable
          columns={[
            { header: 'Date', accessor: (r: any) => formatDate(r.paidAt || r.createdAt) },
            { header: 'Amount', accessor: (r: any) => formatMoney(r.amount, r.currency || currency) },
            { header: 'Contract', accessor: (r: any) => (r.contractId || '').slice(0, 8) + '...' },
            { header: 'Method', accessor: (r: any) => (r.paymentMethod || '-').replace(/_/g, ' ') },
            { header: 'Reference', accessor: (r: any) => r.referenceNumber || '-' },
            { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
          ]}
          data={repayments}
        />
      </div>
    </div>
  );
}
