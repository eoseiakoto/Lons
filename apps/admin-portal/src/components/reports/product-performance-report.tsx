'use client';

import { DataTable } from '@/components/ui/data-table';
import { ReportLayout } from './report-layout';
import { formatMoney, formatPercent, downloadCSV, downloadPDF } from '@/lib/utils';

const mockData = [
  {
    id: '1',
    product: 'Micro Loan',
    activeContracts: 482,
    totalDisbursed: '1345600.00',
    totalOutstanding: '892400.00',
    repaymentRate: 0.94,
    parRate: 0.038,
    avgTicket: '2790.00',
    avgTenor: '45 days',
    revenue: '124500.00',
  },
  {
    id: '2',
    product: 'Overdraft',
    activeContracts: 315,
    totalDisbursed: '945000.00',
    totalOutstanding: '612300.00',
    repaymentRate: 0.91,
    parRate: 0.052,
    avgTicket: '3000.00',
    avgTenor: '30 days',
    revenue: '87200.00',
  },
  {
    id: '3',
    product: 'BNPL',
    activeContracts: 228,
    totalDisbursed: '547200.00',
    totalOutstanding: '341500.00',
    repaymentRate: 0.96,
    parRate: 0.021,
    avgTicket: '2400.00',
    avgTenor: '90 days',
    revenue: '52100.00',
  },
  {
    id: '4',
    product: 'Invoice Factoring',
    activeContracts: 45,
    totalDisbursed: '2250000.00',
    totalOutstanding: '1680000.00',
    repaymentRate: 0.89,
    parRate: 0.067,
    avgTicket: '50000.00',
    avgTenor: '60 days',
    revenue: '198000.00',
  },
];

const csvColumns = ['product', 'activeContracts', 'totalDisbursed', 'totalOutstanding', 'repaymentRate', 'parRate', 'avgTicket', 'avgTenor', 'revenue'];

export function ProductPerformanceReport() {
  const csvRows = mockData.map((r) => ({
    ...r,
    repaymentRate: formatPercent(r.repaymentRate),
    parRate: formatPercent(r.parRate),
  }));

  const handleCSV = () => downloadCSV(csvRows, 'product-performance-report');
  const handlePDF = () => downloadPDF('Product Performance Report', csvRows, csvColumns);

  return (
    <ReportLayout title="Product Performance Report" onExportCSV={handleCSV} onExportPDF={handlePDF} productFilter={false}>
      <div className="glass p-4">
        <DataTable
          columns={[
            { header: 'Product', accessor: 'product' },
            { header: 'Active', accessor: 'activeContracts' },
            { header: 'Disbursed', accessor: (r) => formatMoney(r.totalDisbursed, 'GHS') },
            { header: 'Outstanding', accessor: (r) => formatMoney(r.totalOutstanding, 'GHS') },
            { header: 'Repayment Rate', accessor: (r) => formatPercent(r.repaymentRate) },
            { header: 'PAR Rate', accessor: (r) => formatPercent(r.parRate) },
            { header: 'Avg Ticket', accessor: (r) => formatMoney(r.avgTicket, 'GHS') },
            { header: 'Tenor', accessor: 'avgTenor' },
            { header: 'Revenue', accessor: (r) => formatMoney(r.revenue, 'GHS') },
          ]}
          data={mockData}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {mockData.map((product) => (
          <div key={product.id} className="glass p-4">
            <h4 className="text-sm font-medium text-white/80 mb-3">{product.product}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Contracts</span>
                <span className="text-white font-medium">{product.activeContracts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Repayment Rate</span>
                <span className="text-emerald-400 font-medium">{formatPercent(product.repaymentRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">PAR Rate</span>
                <span className={product.parRate > 0.05 ? 'text-red-400 font-medium' : 'text-white font-medium'}>
                  {formatPercent(product.parRate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Revenue</span>
                <span className="text-white font-medium">{formatMoney(product.revenue, 'GHS')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ReportLayout>
  );
}
