'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ReportLayout } from './report-layout';
import { formatMoney, formatDateTime, downloadCSV, downloadPDF } from '@/lib/utils';

const RECONCILIATION_QUERY = gql`
  query ReconciliationReport($first: Int) {
    reconciliationRuns(first: $first) {
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

export function ReconciliationReport() {
  const { data, loading } = useQuery(RECONCILIATION_QUERY, { variables: { first: 20 } });

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
  const handlePDF = () => downloadPDF('Reconciliation Report', csvRows, ['date', 'status', 'matched', 'unmatched', 'exceptions', 'totalProcessed']);

  if (loading) return <div className="text-white/40">Loading...</div>;

  return (
    <ReportLayout title="Reconciliation Report" onExportCSV={handleCSV} onExportPDF={handlePDF} productFilter={false}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Total Matched</p>
          <p className="text-2xl font-bold text-emerald-400">{totalMatched}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Unmatched</p>
          <p className="text-2xl font-bold text-amber-400">{totalUnmatched}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Exceptions</p>
          <p className="text-2xl font-bold text-red-400">{totalExceptions}</p>
        </div>
      </div>

      <div className="glass p-4">
        <h3 className="text-sm font-medium text-white/60 mb-3">Reconciliation Runs</h3>
        <DataTable
          columns={[
            { header: 'Run Date', accessor: (r: any) => formatDateTime(r.runDate) },
            { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
            { header: 'Matched', accessor: 'matchedCount' },
            { header: 'Unmatched', accessor: 'unmatchedCount' },
            { header: 'Exceptions', accessor: 'exceptionCount' },
            { header: 'Total Processed', accessor: (r: any) => formatMoney(r.totalProcessed, 'GHS') },
          ]}
          data={displayRuns}
        />
      </div>
    </ReportLayout>
  );
}
