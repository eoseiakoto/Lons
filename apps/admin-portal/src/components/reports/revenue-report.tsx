'use client';

import { useState, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Drawer } from '@/components/ui/drawer';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { formatMoney, formatDate, downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

const PIE_COLORS = ['#60a5fa', '#34d399', '#f97316', '#a78bfa', '#f472b6'];

const SETTLEMENT_RUNS_QUERY = gql`
  query SettlementRuns($first: Int, $startDate: String, $endDate: String) {
    settlementRuns(first: $first, startDate: $startDate, endDate: $endDate) {
      edges {
        node {
          id
          periodStart
          periodEnd
          totalRevenue
          status
          approvedBy
          approvedAt
          createdAt
          lines {
            id
            partyType
            partyId
            grossRevenue
            sharePercentage
            shareAmount
            deductions
            netAmount
          }
        }
      }
      totalCount
    }
  }
`;

const REVENUE_BREAKDOWN_QUERY = gql`
  query RevenueBreakdown($periodStart: String!, $periodEnd: String!) {
    revenueBreakdown(periodStart: $periodStart, periodEnd: $periodEnd) {
      interestIncome
      processingFees
      latePenalties
      insurancePremium
      otherFees
      total
    }
  }
`;

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
};

interface SettlementLine {
  id: string;
  partyType: string;
  partyId: string;
  grossRevenue: string;
  sharePercentage: string;
  shareAmount: string;
  deductions: string;
  netAmount: string;
}

interface SettlementRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalRevenue: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  lines: SettlementLine[];
}

interface BreakdownItem {
  name: string;
  value: string;
}

// Dynamic wrapper for the pie chart to avoid SSR issues
function createRevenuePieChart(breakdown: BreakdownItem[], noDataLabel: string) {
  return dynamic(
    () =>
      Promise.resolve({
        default: function RevenuePie() {
          const numericData = breakdown.map((d) => ({
            name: d.name,
            value: parseFloat(d.value) || 0,
          }));
          const hasData = numericData.some((d) => d.value > 0);
          if (!hasData) {
            return (
              <div className="flex items-center justify-center h-[280px] text-[color:var(--text-tertiary)] text-sm">
                {noDataLabel}
              </div>
            );
          }
          return (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={numericData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={((props: any) =>
                    `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`) as any}
                >
                  {numericData
                    .filter((d) => d.value > 0)
                    .map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.8} />
                    ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          );
        },
      }),
    { ssr: false },
  );
}

function SettlementLinesTable({
  lines,
  labels,
  columnLabels,
}: {
  lines: SettlementLine[];
  labels: Record<string, string>;
  columnLabels: { party: string; grossRevenue: string; sharePercent: string; netAmount: string };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">
              {columnLabels.party}
            </th>
            <th className="px-3 py-2 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">
              {columnLabels.grossRevenue}
            </th>
            <th className="px-3 py-2 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">
              {columnLabels.sharePercent}
            </th>
            <th className="px-3 py-2 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">
              {columnLabels.netAmount}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-[color:var(--border-subtle)]">
              <td className="px-3 py-2 text-sm text-[color:var(--text-primary)]">
                {labels[line.partyType] ?? line.partyType}
              </td>
              <td className="px-3 py-2 text-sm text-[color:var(--text-primary)] text-right tabular-nums">
                {formatMoney(line.grossRevenue, 'GHS')}
              </td>
              <td className="px-3 py-2 text-sm text-[color:var(--text-primary)] text-right tabular-nums">
                {parseFloat(line.sharePercentage).toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-sm font-medium text-[color:var(--status-success-text)] text-right tabular-nums">
                {formatMoney(line.netAmount, 'GHS')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function addStr(a: string, b: string): string {
  const result = (parseFloat(a) || 0) + (parseFloat(b) || 0);
  return result.toFixed(4);
}

function computeSettlementSummary(settlements: SettlementRun[]) {
  let totalRevenue = '0';
  let platformFee = '0';
  let spNet = '0';

  for (const s of settlements) {
    totalRevenue = addStr(totalRevenue, s.totalRevenue);
    for (const line of s.lines) {
      if (line.partyType === 'platform') {
        platformFee = addStr(platformFee, line.shareAmount);
      }
      if (line.partyType === 'sp') {
        spNet = addStr(spNet, line.netAmount);
      }
    }
  }

  return { totalRevenue, platformFee, spNet };
}

function RevenueReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const [selectedRun, setSelectedRun] = useState<SettlementRun | null>(null);

  const PARTY_LABELS: Record<string, string> = {
    platform: t('reports.revenue.party.lonsFee'),
    sp: t('reports.revenue.party.spNet'),
    lender: t('reports.revenue.party.lenderShare'),
    sp_product: t('reports.revenue.party.spRemainder'),
  };

  const linesColumnLabels = {
    party: t('reports.revenue.column.party'),
    grossRevenue: t('reports.revenue.column.grossRevenue'),
    sharePercent: t('reports.revenue.column.sharePercent'),
    netAmount: t('reports.revenue.column.netAmount'),
  };

  const { data: settlementsData, loading: settlementsLoading } = useQuery(SETTLEMENT_RUNS_QUERY, {
    variables: { first: 50, startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const { data: breakdownData, loading: breakdownLoading } = useQuery(REVENUE_BREAKDOWN_QUERY, {
    variables: { periodStart: dateRange.startDate, periodEnd: dateRange.endDate },
  });

  const settlements: SettlementRun[] = useMemo(
    () => settlementsData?.settlementRuns?.edges?.map((e: any) => e.node) ?? [],
    [settlementsData],
  );

  const breakdown = breakdownData?.revenueBreakdown;

  const revenueBreakdownItems: BreakdownItem[] = useMemo(() => {
    if (!breakdown) return [];
    return [
      { name: t('reports.revenue.breakdown.interest'), value: breakdown.interestIncome },
      { name: t('reports.revenue.breakdown.processingFees'), value: breakdown.processingFees },
      { name: t('reports.revenue.breakdown.latePenalties'), value: breakdown.latePenalties },
      { name: t('reports.revenue.breakdown.insurancePremium'), value: breakdown.insurancePremium },
      { name: t('reports.revenue.breakdown.otherFees'), value: breakdown.otherFees },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown]);

  const noRevenueDataLabel = t('reports.revenue.noData');
  const RevenuePieChart = useMemo(
    () => createRevenuePieChart(revenueBreakdownItems, noRevenueDataLabel),
    [revenueBreakdownItems, noRevenueDataLabel],
  );

  const summary = useMemo(() => computeSettlementSummary(settlements), [settlements]);

  const csvRows = settlements.map((s) => ({
    period: `${s.periodStart} - ${s.periodEnd}`,
    totalRevenue: s.totalRevenue,
    status: s.status,
  }));

  const handleCSV = () => downloadCSV(csvRows, 'revenue-report');
  const handlePDF = () =>
    downloadPDF(t('reports.revenue.pdfTitle'), csvRows, ['period', 'totalRevenue', 'status']);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  const loading = settlementsLoading || breakdownLoading;

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  const hasNoData = settlements.length === 0 && !breakdown;

  return (
    <ReportLayout
      title={t('reports.revenue.title')}
      eyebrow={t('reports.revenue.eyebrow')}
      subtitle={t('reports.revenue.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      onDateRangeChange={handleDateRangeChange}
    >
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RevKpi label={t('reports.revenue.kpi.totalRevenue')} value={breakdown ? formatMoney(breakdown.total, 'GHS') : formatMoney('0', 'GHS')} accent />
        <RevKpi label={t('reports.revenue.kpi.platformFee')} value={formatMoney(summary.platformFee, 'GHS')} tone="accent-deep" />
        <RevKpi label={t('reports.revenue.kpi.spNetRevenue')} value={formatMoney(summary.spNet, 'GHS')} tone="info" />
      </div>

      {hasNoData ? (
        <div className="card-glow p-12 text-center">
          <p className="text-[color:var(--text-secondary)] text-sm">
            {t('reports.revenue.noSettlementData')}
          </p>
        </div>
      ) : (
        <>
          {/* Revenue Breakdown Chart + Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="card-glow p-6">
              <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-4">
                {t('reports.revenue.revenueBreakdown')}
              </h3>
              {breakdownLoading ? (
                <div className="flex items-center justify-center h-[280px] text-[color:var(--text-tertiary)] text-sm">
                  {t('common.loading')}
                </div>
              ) : (
                <RevenuePieChart />
              )}
            </div>
            <div className="card-glow p-6">
              <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-4">
                {t('reports.revenue.summary')}
              </h3>
              {revenueBreakdownItems.length === 0 ? (
                <div className="text-[color:var(--text-tertiary)] text-sm py-8 text-center">
                  {t('reports.revenue.noBreakdownData')}
                </div>
              ) : (
                <div className="space-y-3">
                  {revenueBreakdownItems.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: PIE_COLORS[i],
                            boxShadow: `0 0 6px ${PIE_COLORS[i]}`,
                          }}
                        />
                        <span className="text-[13px] text-[color:var(--text-primary)]">{item.name}</span>
                      </div>
                      <span className="text-[13px] font-medium text-[color:var(--text-primary)] tabular-nums">
                        {formatMoney(item.value, 'GHS')}
                      </span>
                    </div>
                  ))}
                  <div
                    className="pt-3 mt-1 flex justify-between font-semibold"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <span className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                      {t('reports.revenue.totalRevenue')}
                    </span>
                    <span
                      className="text-[16px] tabular-nums"
                      style={{
                        color: 'var(--accent-primary-deep)',
                        textShadow: '0 0 16px rgba(var(--accent-primary-rgb), 0.30)',
                      }}
                    >
                      {formatMoney(breakdown?.total ?? '0', 'GHS')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Settlement Runs Table */}
          <div className="card-glow overflow-hidden">
            <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
              <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                {t('reports.revenue.settlementPeriods')}
              </h3>
            </div>
            <DataTable
              columns={[
                {
                  header: t('reports.revenue.period.period'),
                  accessor: (r: any) =>
                    `${formatDate(r.periodStart)} - ${formatDate(r.periodEnd)}`,
                },
                {
                  header: t('reports.revenue.period.totalRevenue'),
                  accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalRevenue, 'GHS')}</span>,
                },
                {
                  header: t('reports.revenue.period.platformFee'),
                  accessor: (r: any) => {
                    const platformLine = r.lines?.find(
                      (l: SettlementLine) => l.partyType === 'platform',
                    );
                    return <span className="tabular-nums">{formatMoney(platformLine?.shareAmount ?? '0', 'GHS')}</span>;
                  },
                },
                {
                  header: t('reports.revenue.period.lenderShare'),
                  accessor: (r: any) => {
                    const lenderLine = r.lines?.find(
                      (l: SettlementLine) => l.partyType === 'lender',
                    );
                    return <span className="tabular-nums">{formatMoney(lenderLine?.shareAmount ?? '0', 'GHS')}</span>;
                  },
                },
                {
                  header: t('reports.revenue.period.spShare'),
                  accessor: (r: any) => {
                    const spLine = r.lines?.find(
                      (l: SettlementLine) => l.partyType === 'sp',
                    );
                    return <span className="tabular-nums">{formatMoney(spLine?.netAmount ?? '0', 'GHS')}</span>;
                  },
                },
                {
                  header: t('reports.revenue.period.status'),
                  accessor: (r: any) => <StatusBadge status={r.status} />,
                },
              ]}
              data={settlements}
              onRowClick={(row: any) => setSelectedRun(row)}
              emptyMessage={t('reports.revenue.noSettlementRuns')}
            />
          </div>
        </>
      )}

      {/* Settlement Detail Drawer */}
      <Drawer
        open={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        title={t('reports.revenue.drawer.settlementDetail')}
        width="w-[600px]"
      >
        {selectedRun && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[color:var(--text-secondary)]">{t('reports.revenue.drawer.period')}</span>
                <span className="text-sm text-[color:var(--text-primary)]">
                  {formatDate(selectedRun.periodStart)} - {formatDate(selectedRun.periodEnd)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[color:var(--text-secondary)]">{t('reports.revenue.drawer.status')}</span>
                <StatusBadge status={selectedRun.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[color:var(--text-secondary)]">{t('reports.revenue.drawer.totalRevenue')}</span>
                <span className="text-sm font-semibold text-[color:var(--status-success-text)] tabular-nums">
                  {formatMoney(selectedRun.totalRevenue, 'GHS')}
                </span>
              </div>
            </div>

            {/* Platform Billing */}
            <div>
              <h4 className="text-sm font-medium text-[color:var(--text-secondary)] mb-3">{t('reports.revenue.drawer.platformBilling')}</h4>
              {(() => {
                const platformLines = selectedRun.lines.filter(
                  (l) => l.partyType === 'platform' || l.partyType === 'sp',
                );
                if (platformLines.length === 0) {
                  return (
                    <div className="text-center py-4 text-[color:var(--text-tertiary)] text-sm">
                      {t('reports.revenue.drawer.noBillingLines')}
                    </div>
                  );
                }
                return (
                  <SettlementLinesTable lines={platformLines} labels={PARTY_LABELS} columnLabels={linesColumnLabels} />
                );
              })()}
            </div>

            {/* SP Internal Splits */}
            {(() => {
              const internalLines = selectedRun.lines.filter(
                (l) => l.partyType === 'lender' || l.partyType === 'sp_product',
              );
              if (internalLines.length === 0) return null;
              return (
                <div>
                  <h4 className="text-sm font-medium text-[color:var(--text-secondary)] mb-3">{t('reports.revenue.drawer.spSplits')}</h4>
                  <SettlementLinesTable lines={internalLines} labels={PARTY_LABELS} columnLabels={linesColumnLabels} />
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>
    </ReportLayout>
  );
}

function RevKpi({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'accent-deep' | 'info';
}) {
  const color = tone === 'info'
    ? 'var(--status-info-text)'
    : tone === 'accent-deep'
      ? 'var(--accent-primary-deep)'
      : accent
        ? 'var(--accent-primary-deep)'
        : 'var(--text-primary)';
  return (
    <div className="card-glow p-5">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">
        {label}
      </p>
      <p
        className="text-[28px] font-semibold tabular-nums leading-none"
        style={{
          color,
          textShadow: accent ? '0 0 16px rgba(var(--accent-primary-rgb), 0.30)' : undefined,
          letterSpacing: '-0.025em',
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function RevenueReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <RevenueReportInner />
    </Suspense>
  );
}
