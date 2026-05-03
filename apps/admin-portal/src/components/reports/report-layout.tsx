'use client';

import Link from 'next/link';
import { ReportFilterBar, DateRange } from './report-filter-bar';
import { Download, FileText, ArrowLeft } from 'lucide-react';
import { FilterPill } from '@/components/ui/filter-pill';
import { useI18n } from '@/lib/i18n';

interface ReportLayoutProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children: React.ReactNode;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  productFilter?: boolean;
  productType?: string;
  onProductTypeChange?: (v: string) => void;
  onDateRangeChange?: (range: DateRange) => void;
}

export function ReportLayout({
  title,
  eyebrow,
  subtitle,
  children,
  onExportCSV,
  onExportPDF,
  productFilter = true,
  productType,
  onProductTypeChange,
  onDateRangeChange,
}: ReportLayoutProps) {
  const { t } = useI18n();
  return (
    <div className="relative space-y-6 animate-enter">
      <Link
        href="/reports"
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('reports.layout.allReports')}
      </Link>

      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="live-dot" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              {eyebrow ?? t('reports.layout.defaultEyebrow')}
            </span>
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
            style={{ fontSize: 36, lineHeight: 1.05 }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[14px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onExportCSV && (
            <button onClick={onExportCSV} className="btn-secondary text-[12px]">
              <Download className="w-3.5 h-3.5" />
              {t('reports.layout.csv')}
            </button>
          )}
          {onExportPDF && (
            <button onClick={onExportPDF} className="btn-secondary text-[12px]">
              <FileText className="w-3.5 h-3.5" />
              {t('reports.layout.pdf')}
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10">
        <ReportFilterBar onFilter={(range) => onDateRangeChange?.(range)} />
      </div>

      {productFilter && onProductTypeChange && (
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
            {t('reports.layout.productFilter')}
          </span>
          <FilterPill
            options={[
              { value: '', label: t('reports.layout.allProducts') },
              { value: 'OVERDRAFT', label: t('reports.layout.product.overdraft') },
              { value: 'MICRO_LOAN', label: t('reports.layout.product.microLoan') },
              { value: 'BNPL', label: t('reports.layout.product.bnpl') },
              { value: 'INVOICE_FACTORING', label: t('reports.layout.product.invoiceFactoring') },
            ]}
            value={productType ?? ''}
            onChange={onProductTypeChange}
          />
        </div>
      )}

      <div className="relative z-10 space-y-4">{children}</div>
    </div>
  );
}
