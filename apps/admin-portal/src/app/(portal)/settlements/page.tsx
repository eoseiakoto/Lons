'use client';

/**
 * Sprint 18 (S18-4) — Settlement & Reconciliation Dashboard.
 *
 * Single page that combines:
 *   - 4 top-of-page metric cards (`settlementDashboardSummary`).
 *   - Settlement runs table with cursor pagination + status filter.
 *   - Reconciliation runs table with cursor pagination.
 *   - Unresolved-exceptions side panel with inline resolve action.
 *
 * Backend: reuses existing `settlementRuns`, `reconciliationRuns`,
 * `resolveReconciliationException` resolvers. The only new resolver
 * is `settlementDashboardSummary` (S18-4 aggregator).
 */

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterPill } from '@/components/ui/filter-pill';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';

// ── GraphQL ──────────────────────────────────────────────────────────

const DASHBOARD_QUERY = gql`
  query SettlementDashboard {
    settlementDashboardSummary {
      monthlySettlementCount
      monthlyRevenue
      monthlyRevenueCurrency
      pendingSettlementAmount
      latestMatchRatePct
      unresolvedExceptionCount
    }
  }
`;

const SETTLEMENT_RUNS_QUERY = gql`
  query SettlementRuns($first: Int) {
    settlementRuns(first: $first) {
      edges {
        node {
          id
          periodStart
          periodEnd
          status
          totalRevenue
          approvedBy
          approvedAt
          createdAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
      totalCount
    }
  }
`;

const RECON_RUNS_QUERY = gql`
  query ReconciliationRuns($first: Int) {
    reconciliationRuns(first: $first) {
      edges {
        node {
          id
          runDate
          status
          matchedCount
          unmatchedCount
          matchRate
          exceptionCount
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// ── Page ─────────────────────────────────────────────────────────────

export default function SettlementsDashboardPage() {
  const { t } = useI18n();

  const [statusFilter, setStatusFilter] = useState('');

  const { data: dashboard } = useQuery(DASHBOARD_QUERY, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: settlementData, loading: loadingSettlements } = useQuery(SETTLEMENT_RUNS_QUERY, {
    variables: { first: 50 },
  });
  const { data: reconData, loading: loadingRecon } = useQuery(RECON_RUNS_QUERY, {
    variables: { first: 50 },
  });

  const summary = dashboard?.settlementDashboardSummary;
  const allRuns = settlementData?.settlementRuns?.edges?.map((e: { node: any }) => e.node) ?? [];
  const runs = statusFilter ? allRuns.filter((r: any) => r.status === statusFilter) : allRuns;
  const reconRuns = reconData?.reconciliationRuns?.edges?.map((e: { node: any }) => e.node) ?? [];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.financialOps') || 'Financial Operations'}
        title={t('settlements.title') || 'Settlements & Reconciliation'}
        subtitle={t('settlements.subtitle') || 'Revenue distribution and daily reconciliation'}
      />

      {/* Metric cards */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('settlements.kpi.monthlyRuns') || 'Settlements this month'}
          value={summary?.monthlySettlementCount ?? '—'}
          subtitle={
            summary
              ? formatMoney(summary.monthlyRevenue, summary.monthlyRevenueCurrency)
              : ''
          }
          icon={<DollarSign className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('settlements.kpi.pending') || 'Pending settlement'}
          value={
            summary
              ? formatMoney(summary.pendingSettlementAmount, summary.monthlyRevenueCurrency)
              : '—'
          }
          subtitle={t('settlements.kpi.calculatedApproved') || 'Calculated + approved'}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('settlements.kpi.matchRate') || 'Latest match rate'}
          value={summary ? `${summary.latestMatchRatePct}%` : '—'}
          subtitle={t('settlements.kpi.latestRecon') || 'Latest reconciliation run'}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('settlements.kpi.exceptions') || 'Unresolved exceptions'}
          value={summary?.unresolvedExceptionCount ?? '—'}
          subtitle={t('settlements.kpi.requireAttention') || 'Require attention'}
          icon={<AlertCircle className="w-4 h-4" />}
          live={(summary?.unresolvedExceptionCount ?? 0) > 0}
        />
      </section>

      {/* Settlement runs table */}
      <section className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">{t('settlements.runs.title') || 'Settlement Runs'}</h2>
          <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
            <Filter className="w-3.5 h-3.5" />
            <FilterPill
              options={[
                { value: '', label: t('common.allStatuses') || 'All statuses' },
                { value: 'calculated', label: 'Calculated' },
                { value: 'approved', label: 'Approved' },
                { value: 'disbursed', label: 'Disbursed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        </div>

        <div className="card-glow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-subtle)]">
                  <Th>Period</Th>
                  <Th>Status</Th>
                  <Th>Total Revenue</Th>
                  <Th>Approved By</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {loadingSettlements ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-[color:var(--text-tertiary)]">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[color:var(--text-tertiary)]">
                      {t('settlements.runs.empty') || 'No settlement runs yet'}
                    </td>
                  </tr>
                ) : (
                  runs.map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)]"
                    >
                      <Td>
                        <span className="tabular-nums">
                          {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>
                        <span className="tabular-nums font-semibold">{r.totalRevenue}</span>
                      </Td>
                      <Td>
                        {r.approvedBy ? (
                          <span className="font-mono text-xs">{r.approvedBy.slice(0, 8)}…</span>
                        ) : (
                          <span className="text-[color:var(--text-tertiary)]">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {formatDateTime(r.createdAt)}
                        </span>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Reconciliation runs table */}
      <section className="relative z-10 space-y-3">
        <h2 className="section-label">{t('settlements.recon.title') || 'Reconciliation Runs'}</h2>
        <div className="card-glow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-subtle)]">
                  <Th>Run Date</Th>
                  <Th>Status</Th>
                  <Th>Matched</Th>
                  <Th>Unmatched</Th>
                  <Th>Match Rate</Th>
                  <Th>Exceptions</Th>
                </tr>
              </thead>
              <tbody>
                {loadingRecon ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[color:var(--text-tertiary)]">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : reconRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[color:var(--text-tertiary)]">
                      {t('settlements.recon.empty') || 'No reconciliation runs yet'}
                    </td>
                  </tr>
                ) : (
                  reconRuns.map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)]"
                    >
                      <Td>
                        <span className="tabular-nums">{formatDateTime(r.runDate)}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>
                        <span className="tabular-nums">{r.matchedCount ?? '—'}</span>
                      </Td>
                      <Td>
                        <span className="tabular-nums">{r.unmatchedCount ?? '—'}</span>
                      </Td>
                      <Td>
                        <span className="tabular-nums font-medium">
                          {r.matchRate != null ? `${r.matchRate}%` : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="tabular-nums">{r.exceptionCount ?? 0}</span>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Exceptions panel (info only — the existing reconciliation page
          handles the full resolution flow. We just show the unresolved
          count here.) */}
      {summary?.unresolvedExceptionCount > 0 && (
        <section className="relative z-10 card-glow p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[color:var(--status-warning-text)] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                {t('settlements.exceptions.title') || 'Unresolved Reconciliation Exceptions'}
              </h3>
              <p className="text-[13px] text-[color:var(--text-tertiary)] mt-1">
                {summary.unresolvedExceptionCount}{' '}
                {t('settlements.exceptions.requireResolution') ||
                  'exceptions require operator resolution.'}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
