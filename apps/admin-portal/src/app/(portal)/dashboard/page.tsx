'use client';

import { gql, useQuery } from '@apollo/client';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMoney } from '@/lib/utils';
import { NpsWidget } from '@/components/survey/nps-widget';
import { useAuth } from '@/lib/auth-context';

const PORTFOLIO_METRICS = gql`
  query PortfolioMetrics {
    portfolioMetrics {
      activeLoans
      activeOutstanding
      parAt30 { count amount pct }
      nplRatio
      provisioning { total }
    }
    collectionsMetrics {
      overdueCount
      delinquentCount
      defaultCount
      totalInCollections
    }
  }
`;

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useQuery(PORTFOLIO_METRICS);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass p-6 animate-pulse">
            <div className="h-3 w-24 bg-white/5 rounded mb-3" />
            <div className="h-7 w-16 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass p-6 border-red-400/30">
        <p className="text-red-400">Failed to load dashboard metrics.</p>
        <p className="text-white/40 text-sm mt-1">{error.message}</p>
      </div>
    );
  }

  const metrics = data?.portfolioMetrics;
  const collections = data?.collectionsMetrics;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard title="Active Loans" value={metrics?.activeLoans ?? 0} />
        <MetricCard
          title="Outstanding Portfolio"
          value={formatMoney(metrics?.activeOutstanding ?? '0', 'GHS')}
        />
        <MetricCard
          title="PAR > 30 Days"
          value={`${((Number(metrics?.parAt30?.pct) || 0) * 100).toFixed(1)}%`}
          subtitle={`${metrics?.parAt30?.count ?? 0} contracts`}
        />
        <MetricCard
          title="NPL Ratio"
          value={`${((Number(metrics?.nplRatio) || 0) * 100).toFixed(1)}%`}
        />
      </div>

      <h2 className="text-lg font-semibold text-white/80 mb-4">Collections</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Overdue Contracts" value={collections?.overdueCount ?? 0} />
        <MetricCard title="Delinquent" value={collections?.delinquentCount ?? 0} />
        <MetricCard title="Default" value={collections?.defaultCount ?? 0} />
      </div>

      <div className="glass p-6">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Total in Collections</h2>
        <p className="text-3xl font-bold text-red-400">{collections?.totalInCollections ?? 0}</p>
        <p className="text-sm text-white/40 mt-1">contracts requiring attention</p>
      </div>

      {/* NPS Survey Widget */}
      {user && (
        <NpsWidget tenantId={user.tenantId} userId={user.userId} />
      )}
    </div>
  );
}
