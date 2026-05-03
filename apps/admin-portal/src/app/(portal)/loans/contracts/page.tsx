'use client';

import { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Filter,
  Search,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';

const CONTRACTS_QUERY = gql`
  query Contracts($pagination: PaginationInput, $status: String) {
    contracts(pagination: $pagination, status: $status) {
      edges {
        node {
          id contractNumber customerId productId currency
          principalAmount totalOutstanding daysPastDue
          status classification repaymentMethod
          startDate maturityDate createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface Contract {
  id: string;
  contractNumber: string;
  customerId: string;
  productId: string;
  currency: string;
  principalAmount: string;
  totalOutstanding?: string;
  daysPastDue?: number;
  status: string;
  classification?: string;
  repaymentMethod?: string;
  startDate?: string;
  maturityDate?: string;
  createdAt: string;
}

export default function ContractsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading } = useQuery(CONTRACTS_QUERY, {
    variables: { pagination: { first: 100 }, status: statusFilter || undefined },
  });
  const contracts: Contract[] = data?.contracts?.edges?.map((e: any) => e.node) || [];

  const stats = useMemo(() => {
    const performing = contracts.filter((c) => c.status === 'performing').length;
    const overdue = contracts.filter((c) => c.status === 'overdue').length;
    const default_ = contracts.filter((c) => c.status === 'default_status').length;
    const totalOutstanding = contracts.reduce(
      (sum, c) => sum + Number(c.totalOutstanding ?? 0),
      0,
    );
    return { performing, overdue, default: default_, totalOutstanding };
  }, [contracts]);

  const filtered = contracts.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q || c.contractNumber?.toLowerCase().includes(q);
    const matchesClass = !classFilter || c.classification === classFilter;
    return matchesSearch && matchesClass;
  });

  const filtersActive = Boolean(search || statusFilter || classFilter);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.contractLedger')}
        title={t('loans.contracts')}
        subtitle={contracts.length === 1 ? t('loans.contractsList.subtitleOne', { count: contracts.length }) : t('loans.contractsList.subtitleOther', { count: contracts.length })}
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('loans.contractsList.kpi.performing')}
          value={loading ? '—' : stats.performing}
          subtitle={t('loans.contractsList.kpi.performingSubtitle', { percent: contracts.length > 0 ? Math.round((stats.performing / contracts.length) * 100) : 0 })}
          icon={<CheckCircle2 className="w-4 h-4" />}
          live={stats.performing > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.contractsList.kpi.overdue')}
          value={loading ? '—' : stats.overdue}
          subtitle={t('loans.contractsList.kpi.overdueSubtitle')}
          icon={<AlertTriangle className="w-4 h-4" />}
          live={stats.overdue > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.contractsList.kpi.default')}
          value={loading ? '—' : stats.default}
          subtitle={t('loans.contractsList.kpi.defaultSubtitle')}
          icon={<ShieldAlert className="w-4 h-4" />}
          live={stats.default > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.contractsList.kpi.outstanding')}
          value={
            loading
              ? '—'
              : formatMoney(String(stats.totalOutstanding.toFixed(2)), 'GHS')
          }
          subtitle={t('loans.contractsList.kpi.outstandingSubtitle', { count: contracts.length })}
          icon={<FileText className="w-4 h-4" />}
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
            placeholder={t('loans.contractsList.searchPlaceholder')}
          />
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] ml-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          options={[
            { value: '', label: t('loans.contractsList.filter.anyStatus') },
            { value: 'performing', label: t('loans.contractsList.filter.performing') },
            { value: 'cooling_off', label: t('loans.contractsList.filter.coolingOff') },
            { value: 'due', label: t('loans.contractsList.filter.due') },
            { value: 'overdue', label: t('loans.contractsList.filter.overdue') },
            { value: 'delinquent', label: t('loans.contractsList.filter.delinquent') },
            { value: 'default_status', label: t('loans.contractsList.filter.default') },
            { value: 'settled', label: t('loans.contractsList.filter.settled') },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterPill
          options={[
            { value: '', label: t('loans.contractsList.filter.anyClassification') },
            { value: 'performing', label: t('loans.contractsList.filter.performing') },
            { value: 'special_mention', label: t('loans.contractsList.filter.watch') },
            { value: 'substandard', label: t('loans.contractsList.filter.substandard') },
            { value: 'doubtful', label: t('loans.contractsList.filter.doubtful') },
            { value: 'loss', label: t('loans.contractsList.filter.loss') },
          ]}
          value={classFilter}
          onChange={setClassFilter}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setClassFilter('');
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            {t('loans.contractsList.clear')}
          </button>
        )}
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('loans.contractsList.filteredCount', { filtered: filtered.length, total: contracts.length })}
        </span>
      </section>

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>{t('loans.contractNumber')}</Th>
                <Th>{t('loans.principal')}</Th>
                <Th>{t('loans.outstanding')}</Th>
                <Th>{t('loans.dpd')}</Th>
                <Th>{t('loans.status')}</Th>
                <Th>{t('loans.classification')}</Th>
                <Th>{t('loans.startDate')}</Th>
                <Th>{t('loans.maturity')}</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <FileText className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? t('loans.contractsList.noMatch') : t('loans.contractsList.noContracts')}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const dpd = Number(r.daysPastDue ?? 0);
                  const dpdColor =
                    dpd > 30
                      ? 'var(--status-error)'
                      : dpd > 0
                        ? 'var(--status-warning)'
                        : 'var(--text-tertiary)';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/loans/contracts/${r.id}`)}
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                    >
                      <Td>
                        <span className="text-[12px] font-mono text-[color:var(--text-primary)] font-medium">
                          {r.contractNumber}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-primary)] tabular-nums">
                          {formatMoney(r.principalAmount, r.currency)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--accent-primary-deep)] tabular-nums font-semibold">
                          {formatMoney(r.totalOutstanding || '0', r.currency)}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] tabular-nums font-medium"
                          style={{ color: dpdColor }}
                        >
                          {dpd > 0 && (
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: dpdColor, boxShadow: `0 0 6px ${dpdColor}` }}
                            />
                          )}
                          {dpd}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>
                        {r.classification && <StatusBadge status={r.classification} />}
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {r.startDate ? formatDate(r.startDate) : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {r.maturityDate ? formatDate(r.maturityDate) : '—'}
                        </span>
                      </Td>
                      <Td>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                      </Td>
                    </tr>
                  );
                })
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
