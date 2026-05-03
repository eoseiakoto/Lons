'use client';

import { Suspense } from 'react';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ReportLayout } from './report-layout';
import { useReportDateRange, DateRange } from './report-filter-bar';
import { formatMoney, formatDateTime, downloadCSV, downloadPDF } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const RECONCILIATION_QUERY = gql`
  query ReconciliationReport($first: Int, $startDate: String, $endDate: String) {
    reconciliationRuns(first: $first, startDate: $startDate, endDate: $endDate) {
      edges {
        node {
          id
          runDate
          status
          matchedCount
          unmatchedCount
          exceptionCount
          totalProcessed
        }
      }
    }
  }
`;

const mockRuns = [
  { id: '1', runDate: '2026-03-26T06:00:00Z', status: 'completed', matchedCount: 312, unmatchedCount: 3, exceptionCount: 1, totalProcessed: '487500.00' },
  { id: '2', runDate: '2026-03-25T06:00:00Z', status: 'completed', matchedCount: 298, unmatchedCount: 5, exceptionCount: 2, totalProcessed: '462100.00' },
  { id: '3', runDate: '2026-03-24T06:00:00Z', status: 'completed', matchedCount: 275, unmatchedCount: 2, exceptionCount: 0, totalProcessed: '418300.00' },
  { id: '4', runDate: '2026-03-23T06:00:00Z', status: 'completed', matchedCount: 321, unmatchedCount: 4, exceptionCount: 1, totalProcessed: '503200.00' },
  { id: '5', runDate: '2026-03-22T06:00:00Z', status: 'failed', matchedCount: 189, unmatchedCount: 12, exceptionCount: 8, totalProcessed: '295400.00' },
  { id: '6', runDate: '2026-03-21T06:00:00Z', status: 'completed', matchedCount: 305, unmatchedCount: 1, exceptionCount: 0, totalProcessed: '471800.00' },
];

function ReconciliationReportInner() {
  const { t } = useI18n();
  const dateRange = useReportDateRange();
  const { data, loading } = useQuery(RECONCILIATION_QUERY, {
    variables: { first: 20, startDate: dateRange.startDate, endDate: dateRange.endDate },
  });

  const runs = data?.reconciliationRuns?.edges?.map((e: any) => e.node) ?? [];
  const displayRuns = runs.length > 0 ? runs : mockRuns;

  const totalMatched = displayRuns.reduce((s: number, r: any) => s + (r.matchedCount ?? 0), 0);
  const totalUnmatched = displayRuns.reduce((s: number, r: any) => s + (r.unmatchedCount ?? 0), 0);
  const totalExceptions = displayRuns.reduce((s: number, r: any) => s + (r.exceptionCount ?? 0), 0);

  const csvRows = displayRuns.map((r: any) => ({
    date: r.runDate,
    status: r.status,
    matched: r.matchedCount,
    unmatched: r.unmatchedCount,
    exceptions: r.exceptionCount,
    totalProcessed: r.totalProcessed,
  }));

  const handleCSV = () => downloadCSV(csvRows, 'reconciliation-report');
  const handlePDF = () => downloadPDF(t('reports.reconciliation.pdfTitle'), csvRows, ['date', 'status', 'matched', 'unmatched', 'exceptions', 'totalProcessed']);

  const handleDateRangeChange = (_range: DateRange) => {
    // Will trigger re-render via URL params; useReportDateRange will provide updated values
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;

  return (
    <ReportLayout
      title={t('reports.reconciliation.title')}
      eyebrow={t('reports.reconciliation.eyebrow')}
      subtitle={t('reports.reconciliation.subtitle')}
      onExportCSV={handleCSV}
      onExportPDF={handlePDF}
      productFilter={false}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReconKpi label={t('reports.reconciliation.metric.matched')} value={String(totalMatched)} tone="success" />
        <ReconKpi label={t('reports.reconciliation.metric.unmatched')} value={String(totalUnmatched)} tone="warning" />
        <ReconKpi label={t('reports.reconciliation.metric.exceptions')} value={String(totalExceptions)} tone="error" />
      </div>

      <div className="card-glow overflow-hidden">
        <div className="px-6 py-4 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.reconciliation.runsTitle')}
          </h3>
        </div>
        <DataTable
          columns={[
            { header: t('reports.reconciliation.column.runDate'), accessor: (r: any) => formatDateTime(r.runDate) },
            { header: t('reports.reconciliation.column.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
            { header: t('reports.reconciliation.column.matched'), accessor: 'matchedCount' },
            { header: t('reports.reconciliation.column.unmatched'), accessor: 'unmatchedCount' },
            { header: t('reports.reconciliation.column.exceptions'), accessor: 'exceptionCount' },
            { header: t('reports.reconciliation.column.totalProcessed'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalProcessed, 'GHS')}</span> },
          ]}
          data={displayRuns}
        />
      </div>
    </ReportLayout>
  );
}

function ReconKpi({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' | 'error' }) {
  const color = tone === 'success' ? 'var(--status-success-text)' : tone === 'warning' ? 'var(--status-warning-text)' : 'var(--status-error-text)';
  return (
    <div className="card-glow p-5">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">{label}</p>
      <p
        className="text-[28px] font-semibold tabular-nums leading-none"
        style={{ color, letterSpacing: '-0.025em' }}
      >
        {value}
      </p>
    </div>
  );
}

export function ReconciliationReport() {
  return (
    <Suspense fallback={<div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">Loading…</div>}>
      <ReconciliationReportInner />
    </Suspense>
  );
}
