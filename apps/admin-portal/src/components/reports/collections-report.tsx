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

const COLLECTIONS_QUERY = gql`
  query CollectionsReport($startDate: String, $endDate: String) {
    collectionsMetrics(startDate: $startDate, endDate: $endDate) {
      overdueCount
      delinquentCount
      defaultCount
      totalInCollections
    }
  }
`;

const recoveryData = [
  { id: '1', action: 'SMS Reminder', sent: 1240, responded: 682, recovered: '185400.00', rate: 0.55 },
  { id: '2', action: 'Push Notification', sent: 1240, responded: 496, recovered: '112300.00', rate: 0.40 },
  { id: '3', action: 'Phone Call', sent: 312, responded: 218, recovered: '245600.00', rate: 0.70 },
  { id: '4', action: 'Email Notice', sent: 890, responded: 267, recovered: '78900.00', rate: 0.30 },
  { id: '5', action: 'Field Visit', sent: 45, responded: 38, recovered: '312500.00', rate: 0.84 },
];

const agingData = [
  { id: '1', bucket: '1-7 days', count: 156, amount: '312000.00', pctOfTotal: 0.32 },
  { id: '2', bucket: '8-30 days', count: 98, amount: '245000.00', pctOfTotal: 0.25 },
  { id: '3', bucket: '31-60 days', count: 67, amount: '201000.00', pctOfTotal: 0.21 },
  { id: '4', bucket: '61-90 days', count: 42, amount: '126000.00', pctOfTotal: 0.13 },
  { id: '5', bucket: '90+ days', count: 28, amount: '84000.00', pctOfTotal: 0.09 },
];

const recoveryTrend = [
  { name: 'Jan', value: 42 },
  { name: 'Feb', value: 48 },
  { name: 'Mar', value: 45 },
  { name: 'Apr', value: 52 },
  { name: 'May', value: 55 },
  { name: 'Jun', value: 58 },
  { name: 'Jul', value: 54 },
];

function CollectionsReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(COLLECTIONS_QUERY, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });
  const metrics = data?.collectionsMetrics;

  const csvRows = recoveryData.map((r) => ({
    action: r.action,
    sent: r.sent,
    responded: r.responded,
    recovered: r.recovered,
    rate: formatPercent(r.rate),
  }));

  const handleCSV = () => downloadCSV(csvRows, 'collections-report');
  const handlePDF = () => downloadPDF(t('reports.collections.pdfTitle'), csvRows, ['action', 'sent', 'responded', 'recovered', 'rate']);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.collections.title')}
      eyebrow={t('reports.collections.eyebrow')}
      subtitle={t('reports.collections.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ColKpi label={t('reports.collections.metric.overdue')} value={String(metrics?.overdueCount ?? 156)} tone="warning" />
        <ColKpi label={t('reports.collections.metric.delinquent')} value={String(metrics?.delinquentCount ?? 109)} tone="warning" />
        <ColKpi label={t('reports.collections.metric.default')} value={String(metrics?.defaultCount ?? 28)} tone="error" />
        <ColKpi label={t('reports.collections.metric.totalInCollections')} value={String(metrics?.totalInCollections ?? 293)} />
      </div>

      <div className="card-glow p-6">
        <TrendChart
          title={t('reports.collections.monthlyRecoveryRate')}
          data={recoveryTrend}
          dataKey="value"
          type="bar"
          color="var(--status-warning)"
        />
      </div>

      <div className="card-glow overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.collections.recoveryEffectiveness')}
          </h3>
        </div>
        <DataTable
          columns={[
            { header: t('reports.collections.column.action'), accessor: 'action' },
            { header: t('reports.collections.column.sent'), accessor: 'sent' },
            { header: t('reports.collections.column.responded'), accessor: 'responded' },
            { header: t('reports.collections.column.recovered'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.recovered, 'GHS')}</span> },
            { header: t('reports.collections.column.successRate'), accessor: (r) => formatPercent(r.rate) },
          ]}
          data={recoveryData}
        />
      </div>

      <div className="card-glow overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.collections.agingAnalysis')}
          </h3>
        </div>
        <DataTable
          columns={[
            { header: t('reports.collections.column.bucket'), accessor: 'bucket' },
            { header: t('reports.collections.column.contracts'), accessor: 'count' },
            { header: t('reports.collections.column.amount'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.amount, 'GHS')}</span> },
            { header: t('reports.collections.column.percentOfTotal'), accessor: (r) => formatPercent(r.pctOfTotal) },
          ]}
          data={agingData}
        />
      </div>
    </ReportLayout>
  );
}

function ColKpi({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'error' }) {
  const color = tone === 'error' ? 'var(--status-error-text)' : tone === 'warning' ? 'var(--status-warning-text)' : 'var(--text-primary)';
  return (
    <div className="card-glow p-5">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">{label}</p>
      <p className="text-[28px] font-semibold tabular-nums leading-none" style={{ color, letterSpacing: '-0.025em' }}>
        {value}
      </p>
    </div>
  );
}

export function CollectionsReport() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>}>
      <CollectionsReportInner />
    </Suspense>
  );
}
