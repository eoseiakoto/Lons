'use client';

import { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  Users,
  CheckCircle2,
  ShieldAlert,
  UserX,
  Filter,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n/i18n-context';
import { countryName } from '@/lib/constants';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';

const CUSTOMERS_QUERY = gql`
  query Customers($pagination: PaginationInput, $status: String, $kycLevel: String) {
    customers(pagination: $pagination, status: $status, kycLevel: $kycLevel) {
      edges {
        node {
          id
          externalId
          fullName
          phonePrimary
          email
          kycLevel
          status
          watchlist
          country
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface Customer {
  id: string;
  externalId: string;
  fullName: string;
  phonePrimary?: string;
  email?: string;
  kycLevel: string;
  status: string;
  watchlist?: boolean;
  country?: string;
  createdAt: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState('');
  const [kycFilter, setKycFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading } = useQuery(CUSTOMERS_QUERY, {
    variables: {
      pagination: { first: 100 },
      status: statusFilter || undefined,
      kycLevel: kycFilter || undefined,
    },
  });
  const customers: Customer[] = data?.customers?.edges?.map((e: any) => e.node) || [];

  const stats = useMemo(() => {
    const active = customers.filter((c) => c.status === 'active').length;
    const suspended = customers.filter((c) => c.status === 'suspended').length;
    const blacklisted = customers.filter((c) => c.status === 'blacklisted').length;
    const watchlist = customers.filter((c) => c.watchlist).length;
    return { active, suspended, blacklisted, watchlist };
  }, [customers]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.fullName?.toLowerCase().includes(q) ||
      c.externalId?.toLowerCase().includes(q) ||
      c.phonePrimary?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const filtersActive = Boolean(statusFilter || kycFilter || search);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.customerDirectory')}
        title={t('customers.title')}
        subtitle={t(customers.length === 1 ? 'customers.subtitleOne' : 'customers.subtitleMany', { count: customers.length })}
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('common.total')}
          value={loading ? '—' : customers.length}
          subtitle={t('customers.visibleToOperator')}
          icon={<Users className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('common.active')}
          value={loading ? '—' : stats.active}
          subtitle={t('customers.percentOfTotal', { pct: customers.length > 0 ? Math.round((stats.active / customers.length) * 100) : 0 })}
          icon={<CheckCircle2 className="w-4 h-4" />}
          live={stats.active > 0}
        />
        <MetricCard
          variant="glow"
          title={t('customers.watchlist')}
          value={loading ? '—' : stats.watchlist}
          subtitle={t('customers.flaggedForReview')}
          icon={<ShieldAlert className="w-4 h-4" />}
          live={stats.watchlist > 0}
        />
        <MetricCard
          variant="glow"
          title={t('customers.statuses.blacklisted')}
          value={loading ? '—' : stats.blacklisted}
          subtitle={t('customers.suspendedCount', { count: stats.suspended })}
          icon={<UserX className="w-4 h-4" />}
        />
      </section>

      {/* Filters */}
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
            placeholder={t('customers.searchPlaceholder')}
          />
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] ml-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          options={[
            { value: '', label: t('customers.anyStatus') },
            { value: 'active', label: t('customers.statuses.active') },
            { value: 'suspended', label: t('customers.statuses.suspended') },
            { value: 'blacklisted', label: t('customers.statuses.blacklisted') },
            { value: 'anonymized', label: t('customers.anonymized') },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterPill
          options={[
            { value: '', label: t('customers.anyKyc') },
            { value: 'tier_0', label: t('customers.kycTier', { tier: 0 }) },
            { value: 'tier_1', label: t('customers.kycTier', { tier: 1 }) },
            { value: 'tier_2', label: t('customers.kycTier', { tier: 2 }) },
            { value: 'tier_3', label: t('customers.kycTier', { tier: 3 }) },
          ]}
          value={kycFilter}
          onChange={setKycFilter}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setStatusFilter('');
              setKycFilter('');
              setSearch('');
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            {t('customers.clear')}
          </button>
        )}
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('customers.filteredOf', { filtered: filtered.length, total: customers.length })}
        </span>
      </section>

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>{t('customers.externalId')}</Th>
                <Th>{t('customers.name')}</Th>
                <Th>{t('customers.phone')}</Th>
                <Th>{t('customers.kycLevel')}</Th>
                <Th>{t('customers.country')}</Th>
                <Th>{t('customers.status')}</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Users className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? t('customers.noMatchFilters') : t('customers.noCustomersYet')}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <Td>
                      <span className="text-[12px] font-mono text-[color:var(--text-tertiary)]">
                        {c.externalId}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary-deep)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {(c.fullName || c.externalId || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[color:var(--text-primary)] font-medium">
                            {c.fullName}
                          </span>
                          {c.watchlist && (
                            <span
                              title={t('customers.watchlist')}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                backgroundColor: 'var(--status-warning)',
                                boxShadow: '0 0 6px var(--status-warning)',
                              }}
                            />
                          )}
                          {c.status === 'anonymized' && (
                            <span className="pill pill-accent text-[10px]">{t('customers.anonymized')}</span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[12px] text-[color:var(--text-secondary)] tabular-nums">
                        {c.phonePrimary || '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)] capitalize">
                        {c.kycLevel.replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)]">
                        {countryName(c.country || '')}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={c.status} />
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
