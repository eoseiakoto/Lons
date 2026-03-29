'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Download, FileText } from 'lucide-react';

interface ReportLayoutProps {
  title: string;
  children: React.ReactNode;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  productFilter?: boolean;
  productType?: string;
  onProductTypeChange?: (v: string) => void;
  dateRange?: { from: string; to: string };
  onDateRangeChange?: (v: { from: string; to: string }) => void;
}

export function ReportLayout({
  title,
  children,
  onExportCSV,
  onExportPDF,
  productFilter = true,
  productType,
  onProductTypeChange,
  dateRange,
  onDateRangeChange,
}: ReportLayoutProps) {
  const [internalDateRange, setInternalDateRange] = useState({ from: '', to: '' });
  const [internalProductType, setInternalProductType] = useState('');

  const dr = dateRange ?? internalDateRange;
  const setDr = onDateRangeChange ?? setInternalDateRange;
  const pt = productType ?? internalProductType;
  const setPt = onProductTypeChange ?? setInternalProductType;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Reports', href: '/reports' },
          { label: title },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-lg font-semibold text-white/80">{title}</h1>
        <div className="flex items-center gap-2">
          {onExportCSV && (
            <button onClick={onExportCSV} className="glass-button text-sm flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          )}
          {onExportPDF && (
            <button onClick={onExportPDF} className="glass-button text-sm flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker value={dr} onChange={setDr} label="Period" />
        {productFilter && (
          <select
            value={pt}
            onChange={(e) => setPt(e.target.value)}
            className="glass-input text-sm py-1.5 px-2.5"
          >
            <option value="">All Products</option>
            <option value="OVERDRAFT">Overdraft</option>
            <option value="MICRO_LOAN">Micro Loan</option>
            <option value="BNPL">BNPL</option>
            <option value="INVOICE_FACTORING">Invoice Factoring</option>
          </select>
        )}
      </div>

      {children}
    </div>
  );
}
