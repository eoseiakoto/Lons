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

const REPAYMENT_REPORT = gql`
  query RepaymentReport($startDate: String, $endDate: String) {
    repaymentReport(startDate: $startDate, endDate: $endDate) {
      entries {
        date
        totalCollected
        principal
        interest
        fees
        count
      }
      totals {
        totalCollected
        principal
        interest
        fees
        totalCount
      }
    }
  }
`;

const chartDataFallback = [
  { name: 'Mar 20', value: 98500 },
  { name: 'Mar 21', value: 87200 },
  { name: 'Mar 22', value: 105300 },
  { name: 'Mar 23', value: 92100 },
  { name: 'Mar 24', value: 78400 },
  { name: 'Mar 25', value: 112800 },
  { name: 'Mar 26', value: 96700 },
];

const columns = ['date', 'totalCollected', 'principal', 'interest', 'fees', 'count'];

function RepaymentReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(REPAYMENT_REPORT, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const entries = data?.repaymentReport?.entries || [];

  const chartData = entries.length > 0
    ? entries.map((e: any) => ({
        name: formatShortDate(e.date),
        value: Number(e.totalCollected),
      }))
    : chartDataFallback;

  const handleCSV = () => downloadCSV(entries, 'repayment-report');
  const handlePDF = () => downloadPDF(t('reports.repayment.pdfTitle'), entries, columns);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.repayment.title')}
      eyebrow={t('reports.repayment.eyebrow')}
      subtitle={t('reports.repayment.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="card-glow p-6">
        <TrendChart
          title={t('reports.repayment.dailyChart')}
          data={chartData}
          dataKey="value"
          type="area"
          color="var(--accent-primary)"
        />
      </div>

      <div className="card-glow overflow-hidden">
        <DataTable
          columns={[
            { header: t('reports.repayment.column.date'), accessor: (r) => formatDate(r.date) },
            { header: t('reports.repayment.column.totalCollected'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.totalCollected, 'GHS')}</span> },
            { header: t('reports.repayment.column.principal'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.principal, 'GHS')}</span> },
            { header: t('reports.repayment.column.interest'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.interest, 'GHS')}</span> },
            { header: t('reports.repayment.column.fees'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.fees, 'GHS')}</span> },
            { header: t('reports.repayment.column.payments'), accessor: 'count' },
          ]}
          data={entries}
        />
      </div>
    </ReportLayout>
  );
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function RepaymentReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <RepaymentReportInner />
    </Suspense>
  );
}
