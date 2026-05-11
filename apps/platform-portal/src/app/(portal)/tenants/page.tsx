'use client';

import { useMemo, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Building2,
  CheckCircle2,
  Sparkles,
  Globe2,
  ArrowUpRight,
} from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
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

const PLAN_LABEL: Record<string, string> = {
  enterprise: 'Enterprise',
  professional: 'Growth',
  starter: 'Starter',
  trial: 'Trial',
};

const PLAN_BADGE_COLOR: Record<string, string> = {
  enterprise: 'var(--accent-primary)',
  professional: 'var(--accent-secondary)',
  starter: 'var(--accent-primary-deep)',
  trial: 'var(--text-tertiary)',
};

export default function TenantsPage() {
  const { data, loading } = useQuery(TENANTS_QUERY);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  const tenants: Tenant[] = data?.tenants?.edges?.map((e: any) => e.node) || [];
  const totalCount: number = data?.tenants?.totalCount || 0;

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'active').length;
    const provisioning = tenants.filter((t) => t.status === 'provisioning').length;
    const suspended = tenants.filter((t) => t.status === 'suspended').length;
    const planSet = new Set(tenants.map((t) => t.planTier?.toLowerCase()).filter(Boolean));
    const countrySet = new Set(tenants.map((t) => t.country).filter(Boolean));
    return {
      active,
      provisioning,
      suspended,
      planCount: planSet.size,
      countryList: Array.from(countrySet).sort(),
    };
  }, [tenants]);

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || t.status === statusFilter;
    const matchesPlan = !planFilter || t.planTier?.toLowerCase() === planFilter;
    const matchesCountry = !countryFilter || t.country === countryFilter;
    return matchesSearch && matchesStatus && matchesPlan && matchesCountry;
  });

  const filtersActive = Boolean(statusFilter || planFilter || countryFilter || search);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Live · Service provider directory"
        title="Tenants"
        subtitle={
          loading
            ? 'Loading…'
            : `${totalCount} service provider${totalCount === 1 ? '' : 's'} on Lōns.`
        }
        actions={
          <button onClick={() => router.push('/tenants/create')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New tenant
          </button>
        }
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          variant="glow"
          title="Total"
          value={loading ? '—' : totalCount}
          subtitle="On platform"
          icon={<Building2 className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Active"
          value={loading ? '—' : stats.active}
          subtitle={`${totalCount > 0 ? Math.round((stats.active / totalCount) * 100) : 0}% live`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          live={stats.active > 0}
        />
        <MetricCard
          variant="glow"
          title="Onboarding"
          value={loading ? '—' : stats.provisioning}
          subtitle="Provisioning"
          icon={<Sparkles className="w-4 h-4" />}
          live={stats.provisioning > 0}
        />
        <MetricCard
          variant="glow"
          title="Suspended"
          value={loading ? '—' : stats.suspended}
          subtitle="Inactive"
          icon={<ArrowUpRight className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Markets"
          value={loading ? '—' : stats.countryList.length}
          subtitle={stats.countryList.slice(0, 3).join(' · ') || '—'}
          icon={<Globe2 className="w-4 h-4" />}
        />
      </section>

      {/* Filter row + search */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg pl-9 pr-3 py-1.5 text-[13px] focus:outline-none transition-colors w-72"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            placeholder="Search by name or slug…"
          />
        </div>
        <FilterPill
          options={[
            { value: '', label: 'Any status' },
            { value: 'active', label: 'Active' },
            { value: 'provisioning', label: 'Provisioning' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'decommissioned', label: 'Decommissioned' },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterPill
          options={[
            { value: '', label: 'Any plan' },
            { value: 'enterprise', label: 'Enterprise' },
            { value: 'growth', label: 'Growth' },
            { value: 'starter', label: 'Starter' },
            { value: 'trial', label: 'Trial' },
          ]}
          value={planFilter}
          onChange={setPlanFilter}
        />
        <FilterPill
          options={[
            { value: '', label: 'Any market' },
            ...stats.countryList.map((c) => ({ value: c, label: c })),
          ]}
          value={countryFilter}
          onChange={setCountryFilter}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setStatusFilter('');
              setPlanFilter('');
              setCountryFilter('');
              setSearch('');
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {filtered.length} of {totalCount}
        </span>
      </section>

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th>Country</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    Loading tenants…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Building2 className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? 'No tenants match these filters.' : 'No tenants yet.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/tenants/${t.id}`)}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary-deep)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[color:var(--text-primary)] font-medium">{t.name}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[12px] font-mono text-[color:var(--text-tertiary)]">
                        {t.slug}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)]">{t.country}</span>
                    </Td>
                    <Td>
                      {t.planTier && (
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                PLAN_BADGE_COLOR[t.planTier.toLowerCase()] ?? 'var(--text-tertiary)',
                              boxShadow: `0 0 6px ${PLAN_BADGE_COLOR[t.planTier.toLowerCase()] ?? 'var(--text-tertiary)'}`,
                            }}
                          />
                          {PLAN_LABEL[t.planTier.toLowerCase()] ?? t.planTier}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={t.status} />
                    </Td>
                    <Td>
                      <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                        {formatDate(t.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
