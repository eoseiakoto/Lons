'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const CUSTOMER_ACQUISITION_REPORT = gql`
  query CustomerAcquisitionReport($startDate: String, $endDate: String) {
    customerAcquisitionReport(startDate: $startDate, endDate: $endDate) {
      entries {
        period
        newCustomers
        kycCompleted
        firstLoan
        conversionRate
      }
      totals {
        totalNew
        totalFirstLoan
        avgConversionRate
      }
    }
  }
`;

const chartDataFallback = [
  { name: 'Week 1', value: 142 },
  { name: 'Week 2', value: 168 },
  { name: 'Week 3', value: 155 },
  { name: 'Week 4', value: 131 },
];

const columns = ['period', 'newCustomers', 'kycCompleted', 'firstLoan', 'conversionRate'];

function CustomerAcquisitionReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(CUSTOMER_ACQUISITION_REPORT, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const entries = data?.customerAcquisitionReport?.entries || [];
  const totals = data?.customerAcquisitionReport?.totals;

  const totalNew = totals?.totalNew ?? entries.reduce((s: number, r: any) => s + r.newCustomers, 0);
  const totalFirstLoan = totals?.totalFirstLoan ?? entries.reduce((s: number, r: any) => s + r.firstLoan, 0);
  const avgConversionRate = totals?.avgConversionRate ??
    (totalNew > 0 ? ((totalFirstLoan / totalNew) * 100).toFixed(1) + '%' : '0.0%');

  const chartData = entries.length > 0
    ? entries.map((e: any, idx: number) => ({
        name: `Week ${idx + 1}`,
        value: e.newCustomers,
      }))
    : chartDataFallback;

  const handleCSV = () => downloadCSV(entries, 'customer-acquisition-report');
  const handlePDF = () => downloadPDF(t('reports.customerAcquisition.pdfTitle'), entries, columns);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.customerAcquisition.title')}
      eyebrow={t('reports.customerAcquisition.eyebrow')}
      subtitle={t('reports.customerAcquisition.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      productFilter={false}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AcqKpi label={t('reports.customerAcquisition.metric.newCustomers')} value={String(totalNew)} />
        <AcqKpi label={t('reports.customerAcquisition.metric.firstLoan')} value={String(totalFirstLoan)} tone="success" />
        <AcqKpi label={t('reports.customerAcquisition.metric.avgConversion')} value={avgConversionRate} accent />
      </div>

      <div className="card-glow p-6">
        <TrendChart
          title={t('reports.customerAcquisition.weeklyChart')}
          data={chartData}
          dataKey="value"
          type="bar"
          color="var(--accent-secondary)"
        />
      </div>

      <div className="card-glow overflow-hidden">
        <DataTable
          columns={[
            { header: t('reports.customerAcquisition.column.period'), accessor: 'period' },
            { header: t('reports.customerAcquisition.column.newCustomers'), accessor: 'newCustomers' },
            { header: t('reports.customerAcquisition.column.kycCompleted'), accessor: 'kycCompleted' },
            { header: t('reports.customerAcquisition.column.firstLoan'), accessor: 'firstLoan' },
            { header: t('reports.customerAcquisition.column.conversionRate'), accessor: 'conversionRate' },
          ]}
          data={entries}
        />
      </div>
    </ReportLayout>
  );
}

function AcqKpi({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: 'success' }) {
  const color = tone === 'success' ? 'var(--status-success-text)' : accent ? 'var(--accent-primary-deep)' : 'var(--text-primary)';
  return (
    <div className="card-glow p-5">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">{label}</p>
      <p
        className="text-[28px] font-semibold tabular-nums leading-none"
        style={{ color, textShadow: accent ? '0 0 16px rgba(var(--accent-primary-rgb), 0.30)' : undefined, letterSpacing: '-0.025em' }}
      >
        {value}
      </p>
    </div>
  );
}

export function CustomerAcquisitionReport() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>}>
      <CustomerAcquisitionReportInner />
    </Suspense>
  );
}
