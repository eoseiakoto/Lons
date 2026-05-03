'use client';

import { useParams } from 'next/navigation';
import { DisbursementReport } from '@/components/reports/disbursement-report';
import { RepaymentReport } from '@/components/reports/repayment-report';
import { PortfolioQualityReport } from '@/components/reports/portfolio-quality-report';
import { RevenueReport } from '@/components/reports/revenue-report';
import { ReconciliationReport } from '@/components/reports/reconciliation-report';
import { CustomerAcquisitionReport } from '@/components/reports/customer-acquisition-report';
import { ProductPerformanceReport } from '@/components/reports/product-performance-report';
import { CollectionsReport } from '@/components/reports/collections-report';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { useI18n } from '@/lib/i18n';

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

export default function ReportTypePage() {
  const params = useParams();
  const { t } = useI18n();
  const type = String(params?.type ?? '');
  const ReportComponent = reportComponents[type];

  if (!ReportComponent) {
    return (
      <div className="space-y-6 animate-enter">
        <Breadcrumb
          items={[
            { label: t('reports.title'), href: '/reports' },
            { label: t('common.notFound') },
          ]}
        />
        <div className="card-glow p-12 text-center">
          <p className="text-[color:var(--text-primary)] font-medium">{t('reports.typeNotFound', { type })}</p>
          <p className="text-[12px] text-[color:var(--text-tertiary)] mt-2">
            {t('reports.availableTypes')}
          </p>
        </div>
      </div>
    );
  }

  return <ReportComponent />;
}
