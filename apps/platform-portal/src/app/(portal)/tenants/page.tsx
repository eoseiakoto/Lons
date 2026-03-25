'use client';

import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';

const TENANTS_QUERY = gql`
  query Tenants {
    tenants(pagination: { first: 100 }) {
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

export default function TenantsPage() {
  const { data, loading } = useQuery(TENANTS_QUERY);
  const router = useRouter();
  const [search, setSearch] = useState('');

  const tenants: Tenant[] = data?.tenants?.edges?.map((e: any) => e.node) || [];
  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const columns = [
    { header: 'Name', accessor: 'name' as keyof Tenant },
    { header: 'Slug', accessor: 'slug' as keyof Tenant, className: 'text-white/60 font-mono text-xs' },
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Tenants</h3>
          <p className="text-sm text-white/40">
            {loading ? 'Loading...' : `${data?.tenants?.totalCount || 0} total tenants`}
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-64"
          placeholder="Search by name or slug..."
        />
      </div>

      <div className="glass p-6">
        {loading ? (
          <div className="text-center py-8 text-white/40">Loading tenants...</div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            onRowClick={(row) => router.push(`/tenants/${row.id}`)}
            emptyMessage="No tenants match your search"
          />
        )}
      </div>
    </div>
  );
}
