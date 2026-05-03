'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { formatMoney, formatPercent, downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const PORTFOLIO_QUALITY = gql`
  query PortfolioQuality($startDate: String, $endDate: String) {
    portfolioMetrics(startDate: $startDate, endDate: $endDate) {
      activeLoans
      activeOutstanding
      parAt1 { count amount pct }
      parAt7 { count amount pct }
      parAt30 { count amount pct }
      parAt60 { count amount pct }
      parAt90 { count amount pct }
      nplRatio
      provisioning { performing specialMention substandard doubtful loss total }
    }
  }
`;

const parTrend = [
  { name: 'Jan', value: 3.2 },
  { name: 'Feb', value: 3.8 },
  { name: 'Mar', value: 4.1 },
  { name: 'Apr', value: 3.6 },
  { name: 'May', value: 4.5 },
  { name: 'Jun', value: 5.2 },
  { name: 'Jul', value: 6.2 },
];

function PortfolioQualityReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(PORTFOLIO_QUALITY, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });
  const m = data?.portfolioMetrics;

  const parRows = [
    { id: 'par1', bucket: 'PAR 1+', count: m?.parAt1?.count ?? 0, amount: m?.parAt1?.amount ?? '0', pct: m?.parAt1?.pct ?? 0 },
    { id: 'par7', bucket: 'PAR 7+', count: m?.parAt7?.count ?? 0, amount: m?.parAt7?.amount ?? '0', pct: m?.parAt7?.pct ?? 0 },
    { id: 'par30', bucket: 'PAR 30+', count: m?.parAt30?.count ?? 0, amount: m?.parAt30?.amount ?? '0', pct: m?.parAt30?.pct ?? 0 },
    { id: 'par60', bucket: 'PAR 60+', count: m?.parAt60?.count ?? 0, amount: m?.parAt60?.amount ?? '0', pct: m?.parAt60?.pct ?? 0 },
    { id: 'par90', bucket: 'PAR 90+', count: m?.parAt90?.count ?? 0, amount: m?.parAt90?.amount ?? '0', pct: m?.parAt90?.pct ?? 0 },
  ];

  const provisionRows = [
    { id: 'p1', category: 'Performing (1%)', amount: m?.provisioning?.performing ?? '0' },
    { id: 'p2', category: 'Special Mention (5%)', amount: m?.provisioning?.specialMention ?? '0' },
    { id: 'p3', category: 'Substandard (20%)', amount: m?.provisioning?.substandard ?? '0' },
    { id: 'p4', category: 'Doubtful (50%)', amount: m?.provisioning?.doubtful ?? '0' },
    { id: 'p5', category: 'Loss (100%)', amount: m?.provisioning?.loss ?? '0' },
  ];

  const csvRows = parRows.map((r) => ({
    bucket: r.bucket,
    count: r.count,
    amount: r.amount,
    pct: formatPercent(Number(r.pct)),
  }));

  const handleCSV = () => downloadCSV(csvRows, 'portfolio-quality-report');
  const handlePDF = () => downloadPDF(t('reports.portfolioQuality.pdfTitle'), csvRows, ['bucket', 'count', 'amount', 'pct']);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.portfolioQuality.title')}
      eyebrow={t('reports.portfolioQuality.eyebrow')}
      subtitle={t('reports.portfolioQuality.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCell label={t('reports.portfolioQuality.metric.activeLoans')} value={String(m?.activeLoans ?? 0)} />
        <KpiCell label={t('reports.portfolioQuality.metric.outstanding')} value={formatMoney(m?.activeOutstanding ?? '0', 'GHS')} accent />
        <KpiCell label={t('reports.portfolioQuality.metric.nplRatio')} value={formatPercent(Number(m?.nplRatio ?? 0))} tone="error" />
      </div>

      <div className="card-glow p-6">
        <TrendChart
          title={t('reports.portfolioQuality.parTrend')}
          data={parTrend}
          dataKey="value"
          type="line"
          color="var(--status-warning)"
        />
      </div>

      <div className="card-glow overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.portfolioQuality.parBreakdown')}
          </h3>
        </div>
        <DataTable
          columns={[
            { header: t('reports.portfolioQuality.column.bucket'), accessor: 'bucket' },
            { header: t('reports.portfolioQuality.column.contracts'), accessor: 'count' },
            { header: t('reports.portfolioQuality.column.amount'), accessor: (r) => <span className="tabular-nums">{formatMoney(String(r.amount), 'GHS')}</span> },
            { header: t('reports.portfolioQuality.column.percentOfPortfolio'), accessor: (r) => formatPercent(Number(r.pct)) },
          ]}
          data={parRows}
        />
      </div>

      <div className="card-glow overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.portfolioQuality.provisioning')}
          </h3>
        </div>
        <DataTable
          columns={[
            { header: t('reports.portfolioQuality.column.category'), accessor: 'category' },
            { header: t('reports.portfolioQuality.column.provisionAmount'), accessor: (r) => <span className="tabular-nums">{formatMoney(String(r.amount), 'GHS')}</span> },
          ]}
          data={provisionRows}
        />
        <div className="flex justify-between mx-6 my-4 pt-4 border-t border-[color:var(--border-subtle)] text-sm font-semibold text-[color:var(--text-primary)]">
          <span>{t('reports.portfolioQuality.totalProvision')}</span>
          <span className="tabular-nums text-[color:var(--accent-primary-deep)]">{formatMoney(String(m?.provisioning?.total ?? '0'), 'GHS')}</span>
        </div>
      </div>
    </ReportLayout>
  );
}

function KpiCell({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: 'error' | 'warning' }) {
  const color = tone === 'error'
    ? 'var(--status-error-text)'
    : tone === 'warning'
      ? 'var(--status-warning-text)'
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

export function PortfolioQualityReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <PortfolioQualityReportInner />
    </Suspense>
  );
}
