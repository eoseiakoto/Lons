'use client';

import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { MetricCard } from '@/components/ui/metric-card';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';

const PLATFORM_DASHBOARD_QUERY = gql`
  query PlatformDashboard {
    tenants(pagination: { first: 50 }) {
      edges {
        node {
          id
          name
          slug
          country
          status
          planTier
          createdAt
        }
      }
      totalCount
    }
  }
`;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: string;
  planTier: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { data, loading } = useQuery(PLATFORM_DASHBOARD_QUERY);
  const router = useRouter();

  const tenants: Tenant[] = data?.tenants?.edges?.map((e: any) => e.node) || [];
  const totalCount = data?.tenants?.totalCount || 0;
  const activeCount = tenants.filter((t) => t.status === 'active').length;

  const planCounts = tenants.reduce<Record<string, number>>((acc, t) => {
    const plan = t.planTier || 'unknown';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});

  const topPlan = Object.entries(planCounts).sort((a, b) => b[1] - a[1])[0];

  const columns = [
    { header: 'Name', accessor: 'name' as keyof Tenant },
    { header: 'Country', accessor: 'country' as keyof Tenant },
    {
      header: 'Plan',
      accessor: (row: Tenant) => (
        <span className="capitalize">{row.planTier?.replace(/_/g, ' ') || '-'}</span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Tenant) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Created',
      accessor: (row: Tenant) => formatDate(row.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Tenants" value={loading ? '...' : totalCount} />
        <MetricCard title="Active Tenants" value={loading ? '...' : activeCount} />
        <MetricCard
          title="Top Plan"
          value={loading ? '...' : topPlan ? topPlan[0].replace(/_/g, ' ') : '-'}
          subtitle={topPlan ? `${topPlan[1]} tenants` : undefined}
        />
        <MetricCard
          title="Countries"
          value={loading ? '...' : new Set(tenants.map((t) => t.country)).size}
        />
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white mb-4">All Tenants</h3>
        {loading ? (
          <div className="text-center py-8 text-white/40">Loading tenants...</div>
        ) : (
          <DataTable
            columns={columns}
            data={tenants}
            onRowClick={(row) => router.push(`/tenants/${row.id}`)}
            emptyMessage="No tenants found"
          />
        )}
      </div>
    </div>
  );
}
