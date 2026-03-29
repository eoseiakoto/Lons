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

const PORTFOLIO_QUALITY = gql`
  query PortfolioQuality {
    portfolioMetrics {
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

export function PortfolioQualityReport() {
  const { data, loading } = useQuery(PORTFOLIO_QUALITY);
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
  const handlePDF = () => downloadPDF('Portfolio Quality Report', csvRows, ['bucket', 'count', 'amount', 'pct']);

  if (loading) return <div className="text-white/40">Loading...</div>;

  return (
    <ReportLayout title="Portfolio Quality Report" onExportCSV={handleCSV} onExportPDF={handlePDF}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Active Loans</p>
          <p className="text-2xl font-bold text-white">{m?.activeLoans ?? 0}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Outstanding</p>
          <p className="text-2xl font-bold text-white">{formatMoney(m?.activeOutstanding ?? '0', 'GHS')}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">NPL Ratio</p>
          <p className="text-2xl font-bold text-red-400">{formatPercent(Number(m?.nplRatio ?? 0))}</p>
        </div>
      </div>

      <div className="mb-6">
        <TrendChart
          title="PAR 30+ Trend (%)"
          data={parTrend}
          dataKey="value"
          type="line"
          color="#f97316"
        />
      </div>

      <div className="glass p-4 mb-6">
        <h3 className="text-sm font-medium text-white/60 mb-3">Portfolio at Risk Breakdown</h3>
        <DataTable
          columns={[
            { header: 'Bucket', accessor: 'bucket' },
            { header: 'Contracts', accessor: 'count' },
            { header: 'Amount', accessor: (r) => formatMoney(String(r.amount), 'GHS') },
            { header: '% of Portfolio', accessor: (r) => formatPercent(Number(r.pct)) },
          ]}
          data={parRows}
        />
      </div>

      <div className="glass p-4">
        <h3 className="text-sm font-medium text-white/60 mb-3">Provisioning</h3>
        <DataTable
          columns={[
            { header: 'Category', accessor: 'category' },
            { header: 'Provision Amount', accessor: (r) => formatMoney(String(r.amount), 'GHS') },
          ]}
          data={provisionRows}
        />
        <div className="flex justify-between mt-3 pt-3 border-t border-white/10 text-sm font-bold text-white">
          <span>Total Provision</span>
          <span>{formatMoney(String(m?.provisioning?.total ?? '0'), 'GHS')}</span>
        </div>
      </div>
    </ReportLayout>
  );
}
