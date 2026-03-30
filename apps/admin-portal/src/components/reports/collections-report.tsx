'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { formatMoney, formatPercent, downloadCSV, downloadPDF } from '@/lib/utils';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const COLLECTIONS_QUERY = gql`
  query CollectionsReport {
    collectionsMetrics {
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

export function CollectionsReport() {
  const { data, loading } = useQuery(COLLECTIONS_QUERY);
  const metrics = data?.collectionsMetrics;

  const csvRows = recoveryData.map((r) => ({
    action: r.action,
    sent: r.sent,
    responded: r.responded,
    recovered: r.recovered,
    rate: formatPercent(r.rate),
  }));

  const handleCSV = () => downloadCSV(csvRows, 'collections-report');
  const handlePDF = () => downloadPDF('Collections Report', csvRows, ['action', 'sent', 'responded', 'recovered', 'rate']);

  if (loading) return <div className="text-white/40">Loading...</div>;

  return (
    <ReportLayout title="Collections Report" onExportCSV={handleCSV} onExportPDF={handlePDF}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Overdue</p>
          <p className="text-2xl font-bold text-amber-400">{metrics?.overdueCount ?? 156}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Delinquent</p>
          <p className="text-2xl font-bold text-orange-400">{metrics?.delinquentCount ?? 109}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Default</p>
          <p className="text-2xl font-bold text-red-400">{metrics?.defaultCount ?? 28}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Total in Collections</p>
          <p className="text-2xl font-bold text-white">{metrics?.totalInCollections ?? 293}</p>
        </div>
      </div>

      <div className="mb-6">
        <TrendChart
          title="Monthly Recovery Rate (%)"
          data={recoveryTrend}
          dataKey="value"
          type="bar"
          color="#f97316"
        />
      </div>

      <div className="glass p-4 mb-6">
        <h3 className="text-sm font-medium text-white/60 mb-3">Recovery Action Effectiveness</h3>
        <DataTable
          columns={[
            { header: 'Action', accessor: 'action' },
            { header: 'Sent', accessor: 'sent' },
            { header: 'Responded', accessor: 'responded' },
            { header: 'Recovered', accessor: (r) => formatMoney(r.recovered, 'GHS') },
            { header: 'Success Rate', accessor: (r) => formatPercent(r.rate) },
          ]}
          data={recoveryData}
        />
      </div>

      <div className="glass p-4">
        <h3 className="text-sm font-medium text-white/60 mb-3">Aging Analysis</h3>
        <DataTable
          columns={[
            { header: 'Bucket', accessor: 'bucket' },
            { header: 'Contracts', accessor: 'count' },
            { header: 'Amount', accessor: (r) => formatMoney(r.amount, 'GHS') },
            { header: '% of Total', accessor: (r) => formatPercent(r.pctOfTotal) },
          ]}
          data={agingData}
        />
      </div>
    </ReportLayout>
  );
}
