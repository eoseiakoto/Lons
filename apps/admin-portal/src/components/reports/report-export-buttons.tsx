'use client';

/**
 * Sprint 18 (S18-3) — CSV / PDF export controls for analytics reports.
 *
 * Wraps the `exportReport` GraphQL mutation, decodes the base64 file
 * body, and triggers a browser download via an object URL. Drop one
 * instance into the header of each report screen.
 */

import { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import { Download, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n';

const EXPORT_REPORT = gql`
  mutation ExportReport($input: ExportReportInput!) {
    exportReport(input: $input) {
      filename
      contentType
      content
      rowCount
      generatedAt
    }
  }
`;

export interface ExportFilters {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  status?: string;
}

interface ReportExportButtonsProps {
  /** Server-side report identifier — must match `ReportTypeEnum`. */
  reportType: 'disbursement' | 'repayment' | 'portfolio' | 'collections' | 'settlement';
  filters?: ExportFilters;
  /** Hide PDF button when the report has too many columns to fit landscape. */
  formats?: Array<'csv' | 'pdf'>;
}

export function ReportExportButtons({
  reportType,
  filters,
  formats = ['csv', 'pdf'],
}: ReportExportButtonsProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [exportMut, { loading }] = useMutation(EXPORT_REPORT);
  const [activeFormat, setActiveFormat] = useState<'csv' | 'pdf' | null>(null);

  const triggerDownload = (filename: string, contentType: string, base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    setActiveFormat(format);
    try {
      const { data } = await exportMut({
        variables: {
          input: {
            reportType,
            format,
            dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
            dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
            productId: filters?.productId || undefined,
            status: filters?.status || undefined,
          },
        },
      });
      const result = data?.exportReport;
      if (!result) throw new Error('No export payload returned');
      triggerDownload(result.filename, result.contentType, result.content);
      toast('success', t('reports.exportSuccess') || `Exported ${result.rowCount} rows`);
    } catch (e) {
      toast('error', (e as Error).message || t('reports.exportError') || 'Export failed');
    } finally {
      setActiveFormat(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {formats.includes('csv') && (
        <button
          type="button"
          onClick={() => handleExport('csv')}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          {loading && activeFormat === 'csv'
            ? t('common.working') || 'Working…'
            : t('reports.exportCsv') || 'Export CSV'}
        </button>
      )}
      {formats.includes('pdf') && (
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <FileText className="w-3.5 h-3.5" />
          {loading && activeFormat === 'pdf'
            ? t('common.working') || 'Working…'
            : t('reports.exportPdf') || 'Export PDF'}
        </button>
      )}
    </div>
  );
}
