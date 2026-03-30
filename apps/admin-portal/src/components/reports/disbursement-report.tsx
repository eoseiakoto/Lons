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
  { id: '1', date: '2026-03-20', product: 'Micro Loan', count: 45, amount: '125000.00', avgTicket: '2777.78' },
  { id: '2', date: '2026-03-21', product: 'Overdraft', count: 32, amount: '89600.00', avgTicket: '2800.00' },
  { id: '3', date: '2026-03-22', product: 'BNPL', count: 28, amount: '67200.00', avgTicket: '2400.00' },
  { id: '4', date: '2026-03-23', product: 'Micro Loan', count: 51, amount: '142800.00', avgTicket: '2800.00' },
  { id: '5', date: '2026-03-24', product: 'Overdraft', count: 38, amount: '106400.00', avgTicket: '2800.00' },
  { id: '6', date: '2026-03-25', product: 'Invoice Factoring', count: 12, amount: '240000.00', avgTicket: '20000.00' },
  { id: '7', date: '2026-03-26', product: 'Micro Loan', count: 55, amount: '154000.00', avgTicket: '2800.00' },
];

const chartData = [
  { name: 'Mar 20', value: 125000 },
  { name: 'Mar 21', value: 89600 },
  { name: 'Mar 22', value: 67200 },
  { name: 'Mar 23', value: 142800 },
  { name: 'Mar 24', value: 106400 },
  { name: 'Mar 25', value: 240000 },
  { name: 'Mar 26', value: 154000 },
];

const columns = ['date', 'product', 'count', 'amount', 'avgTicket'];

export function DisbursementReport() {
  const handleCSV = () => downloadCSV(mockData, 'disbursement-report');
  const handlePDF = () => downloadPDF('Disbursement Report', mockData, columns);

  return (
    <ReportLayout title="Disbursement Report" onExportCSV={handleCSV} onExportPDF={handlePDF}>
      <div className="mb-6">
        <TrendChart
          title="Daily Disbursement Volume (GHS)"
          data={chartData}
          dataKey="value"
          type="bar"
          color="#60a5fa"
        />
      </div>

      <div className="glass p-4">
        <DataTable
          columns={[
            { header: 'Date', accessor: (r) => formatDate(r.date) },
            { header: 'Product', accessor: 'product' },
            { header: 'Count', accessor: 'count' },
            { header: 'Amount', accessor: (r) => formatMoney(r.amount, 'GHS') },
            { header: 'Avg Ticket', accessor: (r) => formatMoney(r.avgTicket, 'GHS') },
          ]}
          data={mockData}
        />
      </div>
    </ReportLayout>
  );
}
