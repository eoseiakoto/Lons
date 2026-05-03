'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const { data, loading } = useQuery(COLLECTIONS_METRICS_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const metrics = data?.collectionsMetrics;

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-[color:var(--bg-muted)] rounded w-20 mb-2" />
              <div className="h-8 bg-[color:var(--bg-muted)] rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const agingBuckets = metrics?.agingBuckets || [
    { bucket: t('collections.dashboard.bucket.1_30'), count: metrics?.overdueCount || 0, amount: '0' },
    { bucket: t('collections.dashboard.bucket.31_60'), count: 0, amount: '0' },
    { bucket: t('collections.dashboard.bucket.61_90'), count: metrics?.delinquentCount || 0, amount: '0' },
    { bucket: t('collections.dashboard.bucket.90Plus'), count: metrics?.defaultCount || 0, amount: '0' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title={t('collections.dashboard.totalOverdueAmount')}
          value={metrics?.totalOverdueAmount ? formatMoney(String(metrics.totalOverdueAmount), 'GHS') : formatMoney(String(metrics?.totalInCollections || 0), 'GHS')}
        />
        <MetricCard title={t('collections.dashboard.overdue')} value={metrics?.overdueCount ?? 0} subtitle={t('collections.dashboard.subtitle.1_30dpd')} />
        <MetricCard title={t('collections.dashboard.delinquent')} value={metrics?.delinquentCount ?? 0} subtitle={t('collections.dashboard.subtitle.31_90dpd')} />
        <MetricCard
          title={t('collections.dashboard.recoveryRate')}
          value={metrics?.recoveryRate ? `${(metrics.recoveryRate * 100).toFixed(1)}%` : '--'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title={t('collections.dashboard.default')} value={metrics?.defaultCount ?? 0} subtitle={t('collections.dashboard.subtitle.90PlusDpd')} />
        <MetricCard title={t('collections.dashboard.totalInCollections')} value={metrics?.totalInCollections ?? 0} />
        <MetricCard title={t('collections.dashboard.totalActions')} value={metrics?.totalActions ?? 0} />
      </div>

      <div className="card p-6">
        <h3 className="section-label mb-4">{t('collections.dashboard.agingBucketDistribution')}</h3>
        <div className="h-72">
          <AgingChart data={agingBuckets} />
        </div>
      </div>
    </div>
  );
}
