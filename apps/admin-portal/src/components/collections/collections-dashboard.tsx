'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMoney } from '@/lib/utils';

const AgingChart = dynamic(() => import('./aging-chart').then((m) => m.AgingChart), { ssr: false });

const COLLECTIONS_METRICS_QUERY = gql`
  query CollectionsMetrics {
    collectionsMetrics {
      overdueCount delinquentCount defaultCount
      totalInCollections totalOverdueAmount
      totalActions recoveryRate
      agingBuckets {
        bucket count amount
      }
    }
  }
`;

export function CollectionsDashboard() {
  const { data, loading } = useQuery(COLLECTIONS_METRICS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const metrics = data?.collectionsMetrics;

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass p-6 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-20 mb-2" />
              <div className="h-8 bg-white/5 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const agingBuckets = metrics?.agingBuckets || [
    { bucket: '1-30 DPD', count: metrics?.overdueCount || 0, amount: '0' },
    { bucket: '31-60 DPD', count: 0, amount: '0' },
    { bucket: '61-90 DPD', count: metrics?.delinquentCount || 0, amount: '0' },
    { bucket: '90+ DPD', count: metrics?.defaultCount || 0, amount: '0' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Overdue Amount"
          value={metrics?.totalOverdueAmount ? formatMoney(String(metrics.totalOverdueAmount), 'GHS') : formatMoney(String(metrics?.totalInCollections || 0), 'GHS')}
        />
        <MetricCard title="Overdue" value={metrics?.overdueCount ?? 0} subtitle="1-30 DPD" />
        <MetricCard title="Delinquent" value={metrics?.delinquentCount ?? 0} subtitle="31-90 DPD" />
        <MetricCard
          title="Recovery Rate"
          value={metrics?.recoveryRate ? `${(metrics.recoveryRate * 100).toFixed(1)}%` : '--'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Default" value={metrics?.defaultCount ?? 0} subtitle="90+ DPD" />
        <MetricCard title="Total in Collections" value={metrics?.totalInCollections ?? 0} />
        <MetricCard title="Total Actions" value={metrics?.totalActions ?? 0} />
      </div>

      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Aging Bucket Distribution</h3>
        <div className="h-72">
          <AgingChart data={agingBuckets} />
        </div>
      </div>
    </div>
  );
}
