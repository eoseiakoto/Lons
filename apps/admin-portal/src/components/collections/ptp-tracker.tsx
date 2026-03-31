'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { CalendarCheck } from 'lucide-react';

const PTP_QUERY = gql`
  query PTPTracker($pagination: PaginationInput) {
    promiseToPay(pagination: $pagination) {
      edges {
        node {
          id contractId contractNumber customerName
          ptpDate ptpAmount currency
          status fulfilled
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export function PTPTracker() {
  const { data, loading } = useQuery(PTP_QUERY, {
    variables: { pagination: { first: 50 } },
    fetchPolicy: 'cache-and-network',
  });

  const ptps = data?.promiseToPay?.edges?.map((e: any) => e.node) || [];

  if (loading && ptps.length === 0) {
    return (
      <div className="glass p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (ptps.length === 0) {
    return (
      <div className="glass">
        <EmptyState
          icon={CalendarCheck}
          title="No Promises to Pay"
          description="No promise-to-pay commitments have been recorded yet."
        />
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-4">
          <p className="text-xs font-medium text-white/40 uppercase">Upcoming</p>
          <p className="text-xl font-bold text-amber-400 mt-1">
            {ptps.filter((p: any) => !p.fulfilled && p.status !== 'fulfilled' && new Date(p.ptpDate) >= now).length}
          </p>
        </div>
        <div className="glass p-4">
          <p className="text-xs font-medium text-white/40 uppercase">Overdue PTPs</p>
          <p className="text-xl font-bold text-red-400 mt-1">
            {ptps.filter((p: any) => !p.fulfilled && p.status !== 'fulfilled' && new Date(p.ptpDate) < now).length}
          </p>
        </div>
        <div className="glass p-4">
          <p className="text-xs font-medium text-white/40 uppercase">Fulfilled</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">
            {ptps.filter((p: any) => p.fulfilled || p.status === 'fulfilled').length}
          </p>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <DataTable
          columns={[
            { header: 'Contract #', accessor: (r: any) => r.contractNumber || r.contractId?.slice(0, 8) },
            { header: 'Customer', accessor: (r: any) => r.customerName || '-' },
            {
              header: 'PTP Date',
              accessor: (r: any) => {
                const ptpDate = new Date(r.ptpDate);
                const isOverdue = !r.fulfilled && r.status !== 'fulfilled' && ptpDate < now;
                return (
                  <span className={cn(isOverdue ? 'text-red-400 font-medium' : '')}>
                    {formatDate(r.ptpDate)}
                  </span>
                );
              },
            },
            { header: 'Amount', accessor: (r: any) => formatMoney(String(r.ptpAmount), r.currency || 'GHS') },
            {
              header: 'Status',
              accessor: (r: any) => {
                if (r.fulfilled || r.status === 'fulfilled') {
                  return <StatusBadge status="fulfilled" />;
                }
                const ptpDate = new Date(r.ptpDate);
                if (ptpDate < now) {
                  return <StatusBadge status="overdue" />;
                }
                return <StatusBadge status="pending" />;
              },
            },
            { header: 'Created', accessor: (r: any) => formatDate(r.createdAt) },
          ]}
          data={ptps}
        />
      </div>
    </div>
  );
}
