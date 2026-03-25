'use client';

import { gql, useQuery } from '@apollo/client';
import { MetricCard } from '@/components/ui/metric-card';

const COLLECTIONS_QUERY = gql`
  query Collections {
    collectionsMetrics {
      overdueCount delinquentCount defaultCount totalInCollections totalActions
    }
  }
`;

export default function CollectionsPage() {
  const { data, loading } = useQuery(COLLECTIONS_QUERY);
  const metrics = data?.collectionsMetrics;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Collections</h1>
      {loading ? <div className="text-white/40">Loading...</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <MetricCard title="Overdue" value={metrics?.overdueCount ?? 0} />
            <MetricCard title="Delinquent" value={metrics?.delinquentCount ?? 0} />
            <MetricCard title="Default" value={metrics?.defaultCount ?? 0} />
            <MetricCard title="Total Actions" value={metrics?.totalActions ?? 0} />
          </div>
          <div className="glass p-6">
            <h2 className="text-lg font-semibold text-white/80 mb-4">Collections Queue</h2>
            <p className="text-white/40">View overdue contracts in the Contracts page with status filter set to overdue/delinquent/default.</p>
          </div>
        </>
      )}
    </div>
  );
}
