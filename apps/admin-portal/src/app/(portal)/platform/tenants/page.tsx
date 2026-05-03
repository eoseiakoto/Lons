'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { useDebounce } from '@/lib/hooks';
import { Search, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { TenantListTable, type TenantRow } from '@/components/platform/tenant-list-table';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';
import { FilterPill } from '@/components/ui/filter-pill';

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
  const { t } = useI18n();
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
    <div className="relative space-y-8 animate-enter">
      <PageHeader
        eyebrow={t('eyebrow.platformTenants')}
        title="Tenants"
        subtitle="Every tenant on Lōns."
        actions={
          <Link href="/platform/tenants/create" className="btn-primary">
            <Plus className="w-4 h-4" />
            Create tenant
          </Link>
        }
      />

      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
            className="rounded-lg pl-9 pr-3 py-1.5 text-[13px] focus:outline-none transition-colors w-72"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            placeholder="Search tenants…"
          />
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] ml-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Filter</span>
        </div>
        <FilterPill
          options={[
            { value: '', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'provisioning', label: 'Onboarding' },
            { value: 'decommissioned', label: 'Decommissioned' },
          ]}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setCursor(null); }}
        />
        <FilterPill
          options={[
            { value: '', label: 'Any plan' },
            { value: 'starter', label: 'Starter' },
            { value: 'professional', label: 'Professional' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
          value={planFilter}
          onChange={(v) => { setPlanFilter(v); setCursor(null); }}
        />
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {connection?.totalCount ?? 0} tenant{(connection?.totalCount ?? 0) === 1 ? '' : 's'}
        </span>
      </section>

      {error && (
        <div
          className="relative z-10 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--status-error-soft)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--status-error)',
          }}
        >
          Failed to load tenants: {error.message}
        </div>
      )}

      <div className="relative z-10 card-glow overflow-hidden">
        <TenantListTable tenants={tenants} loading={loading && tenants.length === 0} />
      </div>

      {pageInfo && (
        <div className="relative z-10 flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-tertiary)] tabular-nums">
            {connection?.totalCount ?? 0} tenant{(connection?.totalCount ?? 0) === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="btn-ghost text-xs disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="btn-secondary text-xs disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
