'use client';

import dynamic from 'next/dynamic';
import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { downloadCSV, downloadPDF } from '@/lib/utils';

const TrendChart = dynamic(
  () => import('@/components/dashboard/trend-chart').then((m) => ({ default: m.TrendChart })),
  { ssr: false },
);

const mockData = [
  { id: '1', period: 'Week 1 (Mar 1-7)', newCustomers: 142, kycCompleted: 128, firstLoan: 84, conversionRate: '59.2%' },
  { id: '2', period: 'Week 2 (Mar 8-14)', newCustomers: 168, kycCompleted: 151, firstLoan: 97, conversionRate: '57.7%' },
  { id: '3', period: 'Week 3 (Mar 15-21)', newCustomers: 155, kycCompleted: 140, firstLoan: 92, conversionRate: '59.4%' },
  { id: '4', period: 'Week 4 (Mar 22-27)', newCustomers: 131, kycCompleted: 118, firstLoan: 76, conversionRate: '58.0%' },
];

const chartData = [
  { name: 'Week 1', value: 142 },
  { name: 'Week 2', value: 168 },
  { name: 'Week 3', value: 155 },
  { name: 'Week 4', value: 131 },
];

const columns = ['period', 'newCustomers', 'kycCompleted', 'firstLoan', 'conversionRate'];

export function CustomerAcquisitionReport() {
  const handleCSV = () => downloadCSV(mockData, 'customer-acquisition-report');
  const handlePDF = () => downloadPDF('Customer Acquisition Report', mockData, columns);

  const totalNew = mockData.reduce((s, r) => s + r.newCustomers, 0);
  const totalFirstLoan = mockData.reduce((s, r) => s + r.firstLoan, 0);

  return (
    <ReportLayout title="Customer Acquisition Report" onExportCSV={handleCSV} onExportPDF={handlePDF} productFilter={false}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Total New Customers</p>
          <p className="text-2xl font-bold text-white">{totalNew}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">First Loan Taken</p>
          <p className="text-2xl font-bold text-emerald-400">{totalFirstLoan}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-sm text-white/60">Avg Conversion Rate</p>
          <p className="text-2xl font-bold text-blue-400">
            {((totalFirstLoan / totalNew) * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mb-6">
        <TrendChart
          title="Weekly New Customer Registrations"
          data={chartData}
          dataKey="value"
          type="bar"
          color="#a78bfa"
        />
      </div>

      <div className="glass p-4">
        <DataTable
          columns={[
            { header: 'Period', accessor: 'period' },
            { header: 'New Customers', accessor: 'newCustomers' },
            { header: 'KYC Completed', accessor: 'kycCompleted' },
            { header: 'First Loan', accessor: 'firstLoan' },
            { header: 'Conversion Rate', accessor: 'conversionRate' },
          ]}
          data={mockData}
        />
      </div>
    </ReportLayout>
  );
}
