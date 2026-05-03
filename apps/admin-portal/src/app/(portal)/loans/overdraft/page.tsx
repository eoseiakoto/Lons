'use client';

import { useMemo, useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import {
  CreditCard,
  Activity,
  Snowflake,
  Banknote,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
import { ProgressBar } from '@/components/ui/progress-bar';

// ─── GraphQL ────────────────────────────────────────────────────────────────

const CREDIT_LINES_QUERY = gql`
  query CreditLines($status: String, $first: Int) {
    creditLines(status: $status, first: $first) {
      edges {
        node {
          id
          customerId
          productId
          currency
          status
          approvedLimit
          availableBalance
          outstandingAmount
          interestAccrued
          feesOutstanding
          penaltiesAccrued
          activatedAt
          expiresAt
        }
      }
      totalCount
    }
  }
`;

const FREEZE_MUTATION = gql`
  mutation FreezeCreditLine($id: ID!, $reason: String!, $key: String!) {
    freezeCreditLine(creditLineId: $id, reason: $reason, idempotencyKey: $key) {
      id
      status
    }
  }
`;

const UNFREEZE_MUTATION = gql`
  mutation UnfreezeCreditLine($id: ID!, $key: String!) {
    unfreezeCreditLine(creditLineId: $id, idempotencyKey: $key) {
      id
      status
    }
  }
`;

interface CreditLine {
  id: string;
  customerId: string;
  productId: string;
  currency: string;
  status: 'pending_activation' | 'active' | 'frozen' | 'suspended' | 'closed' | 'expired';
  approvedLimit: string;
  availableBalance: string;
  outstandingAmount: string;
  interestAccrued: string;
  feesOutstanding: string;
  penaltiesAccrued: string;
  activatedAt?: string;
  expiresAt?: string;
}

// STATUS_OPTIONS is built inside the component so values stay constant but
// labels respond to the user's locale.

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OverdraftDashboardPage() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading, refetch } = useQuery(CREDIT_LINES_QUERY, {
    variables: { status: statusFilter || undefined, first: 200 },
    fetchPolicy: 'cache-and-network',
  });
  const [freezeLine] = useMutation(FREEZE_MUTATION);
  const [unfreezeLine] = useMutation(UNFREEZE_MUTATION);

  const STATUS_OPTIONS = [
    { value: '', label: t('loans.overdraft.filter.anyStatus') },
    { value: 'active', label: t('loans.overdraft.filter.active') },
    { value: 'frozen', label: t('loans.overdraft.filter.frozen') },
    { value: 'suspended', label: t('loans.overdraft.filter.suspended') },
    { value: 'expired', label: t('loans.overdraft.filter.expired') },
    { value: 'closed', label: t('loans.overdraft.filter.closed') },
  ];

  const lines: CreditLine[] = data?.creditLines?.edges?.map((e: any) => e.node) ?? [];

  // Aggregates for the metric strip + utilization gauge.
  const stats = useMemo(() => {
    const active = lines.filter((c) => c.status === 'active');
    const frozen = lines.filter((c) => c.status === 'frozen');
    const expired = lines.filter((c) => c.status === 'expired');
    const totalLimit = active.reduce((s, c) => s + Number(c.approvedLimit), 0);
    const totalOutstanding = active.reduce((s, c) => s + Number(c.outstandingAmount), 0);
    const totalDue = lines.reduce(
      (s, c) =>
        s +
        Number(c.outstandingAmount) +
        Number(c.interestAccrued) +
        Number(c.feesOutstanding) +
        Number(c.penaltiesAccrued),
      0,
    );
    const utilization = totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 100) : 0;
    return {
      activeCount: active.length,
      frozenCount: frozen.length,
      expiredCount: expired.length,
      totalLimit,
      totalOutstanding,
      totalDue,
      utilization,
    };
  }, [lines]);

  const handleFreezeToggle = async (line: CreditLine) => {
    const key = `freeze-${line.id}-${Date.now()}`;
    try {
      if (line.status === 'frozen') {
        await unfreezeLine({ variables: { id: line.id, key } });
      } else if (line.status === 'active') {
        const reason = window.prompt(t('loans.overdraft.freezeReasonPrompt'));
        if (!reason) return;
        await freezeLine({ variables: { id: line.id, reason, key } });
      }
      void refetch();
    } catch (e) {
      window.alert(t('loans.overdraft.actionFailed', { error: e instanceof Error ? e.message : t('common.unexpectedError') }));
    }
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.recoveryOperations')}
        title={t('loans.overdraft.title')}
        subtitle={lines.length === 1 ? t('loans.overdraft.subtitleOne', { count: lines.length }) : t('loans.overdraft.subtitleOther', { count: lines.length })}
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('loans.overdraft.kpi.activeCreditLines')}
          value={loading ? '—' : stats.activeCount}
          subtitle={t('loans.overdraft.kpi.totalLimit', { amount: formatMoney(stats.totalLimit.toFixed(2), 'GHS') })}
          icon={<CreditCard className="w-4 h-4" />}
          live={stats.activeCount > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.overdraft.kpi.totalOutstanding')}
          value={loading ? '—' : formatMoney(stats.totalOutstanding.toFixed(2), 'GHS')}
          subtitle={t('loans.overdraft.kpi.utilization', { percent: stats.utilization })}
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('loans.overdraft.kpi.frozen')}
          value={loading ? '—' : stats.frozenCount}
          subtitle={t('loans.overdraft.kpi.frozenSubtitle')}
          icon={<Snowflake className="w-4 h-4" />}
          live={stats.frozenCount > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.overdraft.kpi.expired')}
          value={loading ? '—' : stats.expiredCount}
          subtitle={t('loans.overdraft.kpi.expiredSubtitle')}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
      </section>

      {/* Utilization gauge across all active lines */}
      <section className="relative z-10 card-glow p-5 grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        <div className="md:col-span-1">
          <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
            {t('loans.overdraft.portfolioUtilization')}
          </p>
          <p className="text-[32px] font-semibold tabular-nums text-[color:var(--accent-primary-deep)] mt-1">
            {stats.utilization}%
          </p>
          <p className="text-[12px] text-[color:var(--text-secondary)] mt-1">
            {t('loans.overdraft.outstandingOfLimit', { outstanding: formatMoney(stats.totalOutstanding.toFixed(2), 'GHS'), limit: formatMoney(stats.totalLimit.toFixed(2), 'GHS') })}
          </p>
        </div>
        <div className="md:col-span-2">
          <ProgressBar value={stats.utilization} max={100} variant={stats.utilization > 80 ? 'warning' : 'accent'} />
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">
            {t('loans.overdraft.activeLinesPrefix')}{' '}
            <span className="text-[color:var(--text-primary)] font-medium">
              {formatMoney(stats.totalDue.toFixed(2), 'GHS')}
            </span>{' '}
            {t('loans.overdraft.activeLinesSuffix')}
          </p>
        </div>
      </section>

      {/* Filter row */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <span className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">{t('common.filter')}</span>
        <FilterPill options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} label={t('loans.overdraft.filterByStatus')} />
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('loans.overdraft.linesCount', { shown: lines.length, total: data?.creditLines?.totalCount ?? lines.length })}
        </span>
      </section>

      {/* Credit lines table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>{t('loans.overdraft.column.creditLine')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('loans.overdraft.column.approvedLimit')}</Th>
                <Th>{t('loans.overdraft.column.available')}</Th>
                <Th>{t('loans.outstanding')}</Th>
                <Th>{t('loans.overdraft.column.totalOwed')}</Th>
                <Th>{t('loans.overdraft.column.utilization')}</Th>
                <Th className="w-32">{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[color:var(--text-tertiary)]">
                    {t('loans.overdraft.loadingLines')}
                  </td>
                </tr>
              ) : lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Banknote className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {statusFilter ? t('loans.overdraft.noLinesForStatus', { status: statusFilter }) : t('loans.overdraft.noLines')}
                    </p>
                  </td>
                </tr>
              ) : (
                lines.map((c, i) => {
                  const totalDue =
                    Number(c.outstandingAmount) +
                    Number(c.interestAccrued) +
                    Number(c.feesOutstanding) +
                    Number(c.penaltiesAccrued);
                  const utilization = Number(c.approvedLimit) > 0
                    ? Math.round((Number(c.outstandingAmount) / Number(c.approvedLimit)) * 100)
                    : 0;
                  return (
                    <tr
                      key={c.id}
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                    >
                      <Td>
                        <span className="text-[12px] font-mono text-[color:var(--text-tertiary)]">
                          {c.id.slice(0, 8)}…
                        </span>
                      </Td>
                      <Td>
                        <StatusPill status={c.status} />
                      </Td>
                      <Td>{formatMoney(c.approvedLimit, c.currency)}</Td>
                      <Td>{formatMoney(c.availableBalance, c.currency)}</Td>
                      <Td>{formatMoney(c.outstandingAmount, c.currency)}</Td>
                      <Td>
                        <span className={totalDue > 0 ? 'text-[color:var(--text-primary)] font-medium' : ''}>
                          {formatMoney(totalDue.toFixed(2), c.currency)}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <ProgressBar value={utilization} max={100} variant={utilization > 80 ? 'warning' : 'accent'} size="sm" />
                          <span className="text-[11px] tabular-nums text-[color:var(--text-tertiary)]">
                            {utilization}%
                          </span>
                        </div>
                      </Td>
                      <Td>
                        {c.status === 'active' && (
                          <button
                            onClick={() => handleFreezeToggle(c)}
                            className="text-[11px] px-2 py-1 rounded-md border border-[color:var(--border-subtle)] hover:bg-[color:var(--status-warning-soft)] hover:text-[color:var(--status-warning-text)] transition-colors"
                          >
                            {t('loans.overdraft.action.freeze')}
                          </button>
                        )}
                        {c.status === 'frozen' && (
                          <button
                            onClick={() => handleFreezeToggle(c)}
                            className="text-[11px] px-2 py-1 rounded-md border border-[color:var(--border-subtle)] hover:bg-[color:var(--status-success-soft)] hover:text-[color:var(--status-success-text)] transition-colors"
                          >
                            {t('loans.overdraft.action.unfreeze')}
                          </button>
                        )}
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

// ─── Cells ─────────────────────────────────────────────────────────────────

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left px-4 py-3 text-[10px] uppercase tracking-wider font-medium text-[color:var(--text-tertiary)] ${className}`}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function StatusPill({ status }: { status: CreditLine['status'] }) {
  const styles: Record<CreditLine['status'], string> = {
    pending_activation: 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]',
    active: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)]',
    frozen: 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)]',
    suspended: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]',
    closed: 'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)]',
    expired: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]',
  };
  const Icon =
    status === 'frozen' ? Snowflake : status === 'expired' ? AlertTriangle : status === 'suspended' ? ShieldAlert : Activity;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full ${styles[status]}`}>
      <Icon className="w-3 h-3" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
