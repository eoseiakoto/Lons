'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { useDebounce } from '@/lib/hooks';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { TenantListTable, type TenantRow } from '@/components/platform/tenant-list-table';

const GET_TENANTS = gql`
  query GetTenants($first: Int, $after: String, $status: String, $planTier: String, $search: String) {
    tenants(first: $first, after: $after, status: $status, planTier: $planTier, search: $search) {
      edges {
        cursor
        node {
          id
          name
          slug
          status
          planTier
          spCount
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

const PAGE_SIZE = 20;

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const { data, loading, error } = useQuery(GET_TENANTS, {
    variables: {
      first: PAGE_SIZE,
      after: cursor,
      status: statusFilter || undefined,
      planTier: planFilter || undefined,
      search: debouncedSearch || undefined,
    },
    fetchPolicy: 'cache-and-network',
  });

  const connection = data?.tenants;
  const tenants: TenantRow[] = (connection?.edges || []).map((e: any) => e.node);
  const pageInfo = connection?.pageInfo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenant Management</h1>
          <p className="text-sm text-white/40 mt-1">
            Manage platform tenants and their configurations
          </p>
        </div>
        <Link href="/platform/tenants/create" className="glass-button-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Create Tenant
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            className="w-full glass-input pl-10"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
          />
        </div>
        <select
          className="glass-input text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursor(null);
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="provisioning">Onboarding</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
        <select
          className="glass-input text-sm"
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setCursor(null);
          }}
        >
          <option value="">All Plans</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="glass p-4 border-red-500/30">
          <p className="text-sm text-red-400">Failed to load tenants: {error.message}</p>
        </div>
      )}

      {/* Table */}
      <TenantListTable tenants={tenants} loading={loading && tenants.length === 0} />

      {/* Pagination */}
      {pageInfo && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">
            {connection?.totalCount != null
              ? `${connection.totalCount} tenant${connection.totalCount === 1 ? '' : 's'}`
              : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
