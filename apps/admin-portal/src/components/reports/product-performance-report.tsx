'use client';

import { Suspense } from 'react';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { formatMoney, formatPercent, downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const PRODUCT_PERFORMANCE_REPORT = gql`
  query ProductPerformanceReport($startDate: String, $endDate: String) {
    productPerformanceReport(startDate: $startDate, endDate: $endDate) {
      products {
        product
        activeContracts
        totalDisbursed
        totalOutstanding
        repaymentRate
        parRate
        avgTicket
        avgTenor
        revenue
      }
    }
  }
`;

const csvColumns = ['product', 'activeContracts', 'totalDisbursed', 'totalOutstanding', 'repaymentRate', 'parRate', 'avgTicket', 'avgTenor', 'revenue'];

function ProductPerformanceReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(PRODUCT_PERFORMANCE_REPORT, {
    variables: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const products = data?.productPerformanceReport?.products || [];

  const csvRows = products.map((r: any) => ({
    ...r,
    repaymentRate: formatPercent(r.repaymentRate),
    parRate: formatPercent(r.parRate),
  }));

  const handleCSV = () => downloadCSV(csvRows, 'product-performance-report');
  const handlePDF = () => downloadPDF(t('reports.productPerformance.pdfTitle'), csvRows, csvColumns);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.productPerformance.title')}
      eyebrow={t('reports.productPerformance.eyebrow')}
      subtitle={t('reports.productPerformance.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      productFilter={false}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="card-glow overflow-hidden">
        <DataTable
          columns={[
            { header: t('reports.productPerformance.column.product'), accessor: 'product' },
            { header: t('reports.productPerformance.column.active'), accessor: 'activeContracts' },
            { header: t('reports.productPerformance.column.disbursed'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.totalDisbursed, 'GHS')}</span> },
            { header: t('reports.productPerformance.column.outstanding'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.totalOutstanding, 'GHS')}</span> },
            { header: t('reports.productPerformance.column.repaymentRate'), accessor: (r) => formatPercent(r.repaymentRate) },
            { header: t('reports.productPerformance.column.parRate'), accessor: (r) => formatPercent(r.parRate) },
            { header: t('reports.productPerformance.column.avgTicket'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.avgTicket, 'GHS')}</span> },
            { header: t('reports.productPerformance.column.tenor'), accessor: 'avgTenor' },
            { header: t('reports.productPerformance.column.revenue'), accessor: (r) => <span className="tabular-nums">{formatMoney(r.revenue, 'GHS')}</span> },
          ]}
          data={products}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {products.map((product: any) => (
          <div key={product.product} className="card-glow p-5">
            <h4 className="text-[13px] font-semibold text-[color:var(--text-primary)] mb-3">
              {product.product}
            </h4>
            <dl className="space-y-2 text-[12px]">
              <Row label={t('reports.productPerformance.row.contracts')} value={String(product.activeContracts)} />
              <Row label={t('reports.productPerformance.row.repaymentRate')} value={formatPercent(product.repaymentRate)} tone="success" />
              <Row
                label={t('reports.productPerformance.row.parRate')}
                value={formatPercent(product.parRate)}
                tone={product.parRate > 0.05 ? 'error' : 'default'}
              />
              <Row label={t('reports.productPerformance.row.revenue')} value={formatMoney(product.revenue, 'GHS')} />
            </dl>
          </div>
        ))}
      </div>
    </ReportLayout>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'error' | 'default' }) {
  const color = tone === 'success' ? 'var(--status-success-text)' : tone === 'error' ? 'var(--status-error-text)' : 'var(--text-primary)';
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-[color:var(--text-tertiary)]">{label}</dt>
      <dd className="tabular-nums font-medium" style={{ color }}>{value}</dd>
    </div>
  );
}

export function ProductPerformanceReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <ProductPerformanceReportInner />
    </Suspense>
  );
}
