'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { CalendarCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const { data, loading } = useQuery(PTP_QUERY, {
    variables: { pagination: { first: 50 } },
    fetchPolicy: 'cache-and-network',
  });

  const ptps = data?.promiseToPay?.edges?.map((e: any) => e.node) || [];

  if (loading && ptps.length === 0) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-[color:var(--bg-muted)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (ptps.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={CalendarCheck}
          title={t('collections.ptp.emptyTitle')}
          description={t('collections.ptp.emptyDescription')}
        />
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('collections.ptp.upcoming')}</p>
          <p className="text-xl font-bold text-[color:var(--status-warning-text)] mt-1">
            {ptps.filter((p: any) => !p.fulfilled && p.status !== 'fulfilled' && new Date(p.ptpDate) >= now).length}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('collections.ptp.overduePtps')}</p>
          <p className="text-xl font-bold text-[color:var(--status-error-text)] mt-1">
            {ptps.filter((p: any) => !p.fulfilled && p.status !== 'fulfilled' && new Date(p.ptpDate) < now).length}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('collections.ptp.fulfilled')}</p>
          <p className="text-xl font-bold text-[color:var(--status-success-text)] mt-1">
            {ptps.filter((p: any) => p.fulfilled || p.status === 'fulfilled').length}
          </p>
        </div>
      </div>

      <div className="card-flush overflow-hidden">
        <DataTable
          columns={[
            { header: t('collections.ptp.column.contractNumber'), accessor: (r: any) => r.contractNumber || r.contractId?.slice(0, 8) },
            { header: t('collections.ptp.column.customer'), accessor: (r: any) => r.customerName || '-' },
            {
              header: t('collections.ptp.column.ptpDate'),
              accessor: (r: any) => {
                const ptpDate = new Date(r.ptpDate);
                const isOverdue = !r.fulfilled && r.status !== 'fulfilled' && ptpDate < now;
                return (
                  <span className={cn(isOverdue ? 'text-[color:var(--status-error-text)] font-medium' : '')}>
                    {formatDate(r.ptpDate)}
                  </span>
                );
              },
            },
            { header: t('collections.ptp.column.amount'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(String(r.ptpAmount), r.currency || 'GHS')}</span> },
            {
              header: t('collections.ptp.column.status'),
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
            { header: t('collections.ptp.column.created'), accessor: (r: any) => formatDate(r.createdAt) },
          ]}
          data={ptps}
        />
      </div>
    </div>
  );
}
