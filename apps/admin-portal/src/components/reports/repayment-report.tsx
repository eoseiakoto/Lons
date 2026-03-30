'use client';

import dynamic from 'next/dynamic';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { formatMoney, formatDate, downloadCSV, downloadPDF } from '@/lib/utils';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const mockData = [
  { id: '1', date: '2026-03-20', totalCollected: '98500.00', principal: '72000.00', interest: '18500.00', fees: '8000.00', count: 62 },
  { id: '2', date: '2026-03-21', totalCollected: '87200.00', principal: '63800.00', interest: '16400.00', fees: '7000.00', count: 55 },
  { id: '3', date: '2026-03-22', totalCollected: '105300.00', principal: '78000.00', interest: '19300.00', fees: '8000.00', count: 71 },
  { id: '4', date: '2026-03-23', totalCollected: '92100.00', principal: '67500.00', interest: '17100.00', fees: '7500.00', count: 58 },
  { id: '5', date: '2026-03-24', totalCollected: '78400.00', principal: '57200.00', interest: '14200.00', fees: '7000.00', count: 49 },
  { id: '6', date: '2026-03-25', totalCollected: '112800.00', principal: '82600.00', interest: '21200.00', fees: '9000.00', count: 74 },
  { id: '7', date: '2026-03-26', totalCollected: '96700.00', principal: '70800.00', interest: '18400.00', fees: '7500.00', count: 63 },
];

const chartData = [
  { name: 'Mar 20', value: 98500 },
  { name: 'Mar 21', value: 87200 },
  { name: 'Mar 22', value: 105300 },
  { name: 'Mar 23', value: 92100 },
  { name: 'Mar 24', value: 78400 },
  { name: 'Mar 25', value: 112800 },
  { name: 'Mar 26', value: 96700 },
];

const columns = ['date', 'totalCollected', 'principal', 'interest', 'fees', 'count'];

export function RepaymentReport() {
  const handleCSV = () => downloadCSV(mockData, 'repayment-report');
  const handlePDF = () => downloadPDF('Repayment Report', mockData, columns);

  return (
    <ReportLayout title="Repayment Report" onExportCSV={handleCSV} onExportPDF={handlePDF}>
      <div className="mb-6">
        <TrendChart
          title="Daily Collections (GHS)"
          data={chartData}
          dataKey="value"
          type="area"
          color="#34d399"
        />
      </div>

      <div className="glass p-4">
        <DataTable
          columns={[
            { header: 'Date', accessor: (r) => formatDate(r.date) },
            { header: 'Total Collected', accessor: (r) => formatMoney(r.totalCollected, 'GHS') },
            { header: 'Principal', accessor: (r) => formatMoney(r.principal, 'GHS') },
            { header: 'Interest', accessor: (r) => formatMoney(r.interest, 'GHS') },
            { header: 'Fees', accessor: (r) => formatMoney(r.fees, 'GHS') },
            { header: 'Payments', accessor: 'count' },
          ]}
          data={mockData}
        />
      </div>
    </ReportLayout>
  );
}
