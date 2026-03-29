'use client';

import { use } from 'react';
import { DisbursementReport } from '@/components/reports/disbursement-report';
import { RepaymentReport } from '@/components/reports/repayment-report';
import { PortfolioQualityReport } from '@/components/reports/portfolio-quality-report';
import { RevenueReport } from '@/components/reports/revenue-report';
import { ReconciliationReport } from '@/components/reports/reconciliation-report';
import { CustomerAcquisitionReport } from '@/components/reports/customer-acquisition-report';
import { ProductPerformanceReport } from '@/components/reports/product-performance-report';
import { CollectionsReport } from '@/components/reports/collections-report';
import { Breadcrumb } from '@/components/ui/breadcrumb';

const reportComponents: Record<string, React.ComponentType> = {
  disbursement: DisbursementReport,
  repayment: RepaymentReport,
  'portfolio-quality': PortfolioQualityReport,
  revenue: RevenueReport,
  reconciliation: ReconciliationReport,
  'customer-acquisition': CustomerAcquisitionReport,
  'product-performance': ProductPerformanceReport,
  collections: CollectionsReport,
};

export default function ReportTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const ReportComponent = reportComponents[type];

  if (!ReportComponent) {
    return (
      <div>
        <Breadcrumb
          items={[
            { label: 'Reports', href: '/reports' },
            { label: 'Not Found' },
          ]}
        />
        <div className="glass p-6 text-center">
          <p className="text-white/60">Report type &quot;{type}&quot; not found.</p>
          <p className="text-sm text-white/30 mt-1">
            Available: disbursement, repayment, portfolio-quality, revenue, reconciliation, customer-acquisition, product-performance, collections
          </p>
        </div>
      </div>
    );
  }

  return <ReportComponent />;
}
