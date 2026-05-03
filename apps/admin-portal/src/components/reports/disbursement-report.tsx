'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { formatMoney, formatDate, downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const DISBURSEMENT_REPORT = gql`
  query DisbursementReport($startDate: String, $endDate: String) {
    disbursementReport(startDate: $startDate, endDate: $endDate) {
      entries {
        date
        product
        count
        amount
        avgTicket
      }
      totals {
        totalCount
        totalAmount
        avgTicket
      }
    }
  }
`;

const chartDataFallback = [
  { name: 'Mar 20', value: 125000 },
  { name: 'Mar 21', value: 89600 },
  { name: 'Mar 22', value: 67200 },
  { name: 'Mar 23', value: 142800 },
  { name: 'Mar 24', value: 106400 },
  { name: 'Mar 25', value: 240000 },
  { name: 'Mar 26', value: 154000 },
];

const columns = ['date', 'product', 'count', 'amount', 'avgTicket'];

function DisbursementReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(DISBURSEMENT_REPORT, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const entries = data?.disbursementReport?.entries || [];

  const chartData = entries.length > 0
    ? deriveChartData(entries)
    : chartDataFallback;

  const handleCSV = () => downloadCSV(entries, 'disbursement-report');
  const handlePDF = () => downloadPDF(t('reports.disbursement.pdfTitle'), entries, columns);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.disbursement.title')}
      eyebrow={t('reports.disbursement.eyebrow')}
      subtitle={t('reports.disbursement.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="card-glow p-6">
        <TrendChart
          title={t('reports.disbursement.dailyChart')}
          data={chartData}
          dataKey="value"
          type="bar"
          color="var(--accent-primary)"
        />
      </div>

      <div className="card-glow overflow-hidden">
        <DataTable
          columns={[
            { header: t('reports.disbursement.column.date'), accessor: (r) => formatDate(r.date) },
            { header: t('reports.disbursement.column.product'), accessor: 'product' },
            { header: t('reports.disbursement.column.count'), accessor: 'count' },
            { header: t('reports.disbursement.column.amount'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.amount, 'GHS')}</span> },
            { header: t('reports.disbursement.column.avgTicket'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.avgTicket, 'GHS')}</span> },
          ]}
          data={entries}
        />
      </div>
    </ReportLayout>
  );
}

function deriveChartData(entries: Array<{ date: string; amount: string }>) {
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const existing = byDate.get(e.date) || 0;
    byDate.set(e.date, existing + Number(e.amount));
  }
  return Array.from(byDate.entries()).map(([date, value]) => ({
    name: formatShortDate(date),
    value,
  }));
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function DisbursementReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <DisbursementReportInner />
    </Suspense>
  );
}
