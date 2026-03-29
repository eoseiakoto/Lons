'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { formatMoney, formatDate, downloadCSV, downloadPDF } from '@/lib/utils';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

const PIE_COLORS = ['#60a5fa', '#34d399', '#f97316', '#a78bfa', '#f472b6'];

const SETTLEMENTS_QUERY = gql`
  query SettlementsReport($first: Int) {
    settlements(first: $first) {
      edges {
        node {
          id
          periodStart
          periodEnd
          totalRevenue
          platformFee
          lenderShare
          status
        }
      }
    }
  }
`;

const revenueBreakdown = [
  { name: 'Interest Income', value: 245000 },
  { name: 'Processing Fees', value: 42000 },
  { name: 'Late Penalties', value: 18500 },
  { name: 'Insurance Premium', value: 12000 },
  { name: 'Other Fees', value: 5500 },
];

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
};

// Dynamic wrapper for the pie chart to avoid SSR issues
const RevenuePieChart = dynamic(
  () =>
    Promise.resolve({
      default: function RevenuePie() {
        return (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={revenueBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={((props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`) as any}
              >
                {revenueBreakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.8} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

export function RevenueReport() {
  const { data, loading } = useQuery(SETTLEMENTS_QUERY, { variables: { first: 20 } });

  const settlements = data?.settlements?.edges?.map((e: any) => e.node) ?? [];

  const mockSettlements = settlements.length > 0
    ? settlements
    : [
        { id: '1', periodStart: '2026-03-01', periodEnd: '2026-03-07', totalRevenue: '82500.00', platformFee: '8250.00', lenderShare: '74250.00', status: 'settled' },
        { id: '2', periodStart: '2026-03-08', periodEnd: '2026-03-14', totalRevenue: '91200.00', platformFee: '9120.00', lenderShare: '82080.00', status: 'settled' },
        { id: '3', periodStart: '2026-03-15', periodEnd: '2026-03-21', totalRevenue: '78400.00', platformFee: '7840.00', lenderShare: '70560.00', status: 'settled' },
        { id: '4', periodStart: '2026-03-22', periodEnd: '2026-03-27', totalRevenue: '71000.00', platformFee: '7100.00', lenderShare: '63900.00', status: 'pending' },
      ];

  const csvRows = mockSettlements.map((s: any) => ({
    period: `${s.periodStart} - ${s.periodEnd}`,
    totalRevenue: s.totalRevenue,
    platformFee: s.platformFee,
    lenderShare: s.lenderShare,
    status: s.status,
  }));

  const handleCSV = () => downloadCSV(csvRows, 'revenue-report');
  const handlePDF = () => downloadPDF('Revenue Report', csvRows, ['period', 'totalRevenue', 'platformFee', 'lenderShare', 'status']);

  if (loading) return <div className="text-white/40">Loading...</div>;

  return (
    <ReportLayout title="Revenue Report" onExportCSV={handleCSV} onExportPDF={handlePDF}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass p-5">
          <h3 className="text-sm font-medium text-white/60 mb-3">Revenue Breakdown</h3>
          <RevenuePieChart />
        </div>
        <div className="glass p-5">
          <h3 className="text-sm font-medium text-white/60 mb-3">Summary</h3>
          <div className="space-y-3">
            {revenueBreakdown.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[i] }}
                  />
                  <span className="text-sm text-white/70">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-white">
                  {formatMoney(String(item.value), 'GHS')}
                </span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-3 flex justify-between font-bold text-white">
              <span>Total Revenue</span>
              <span>
                {formatMoney(
                  String(revenueBreakdown.reduce((s, r) => s + r.value, 0)),
                  'GHS',
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass p-4">
        <h3 className="text-sm font-medium text-white/60 mb-3">Settlement Periods</h3>
        <DataTable
          columns={[
            { header: 'Period', accessor: (r: any) => `${formatDate(r.periodStart)} - ${formatDate(r.periodEnd)}` },
            { header: 'Total Revenue', accessor: (r: any) => formatMoney(r.totalRevenue, 'GHS') },
            { header: 'Platform Fee', accessor: (r: any) => formatMoney(r.platformFee, 'GHS') },
            { header: 'Lender Share', accessor: (r: any) => formatMoney(r.lenderShare, 'GHS') },
            { header: 'Status', accessor: 'status' },
          ]}
          data={mockSettlements}
        />
      </div>
    </ReportLayout>
  );
}
