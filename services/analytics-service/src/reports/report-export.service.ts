import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '@lons/database';
import { add, bankersRound, divide } from '@lons/common';

/**
 * Sprint 18 (S18-3) — CSV + PDF export of the existing analytics
 * reports surfaced by `ReportResolver`.
 *
 * CSV strategy: hand-rolled with a UTF-8 BOM at the head so Excel
 * opens accented values correctly. Money values are kept as strings
 * (never converted to floats). The column list per report is fixed —
 * if a downstream consumer needs custom columns they should fork the
 * report definition rather than parametrising this service.
 *
 * PDF strategy: PDFKit, A4 landscape, columns split evenly across the
 * page width. Sprint-18 follow-up flipped the previous lazy `require()`
 * fallback to a normal top-of-file import once `pdfkit` was added to
 * the package dependencies — the lazy form's only purpose was to let
 * the analytics-service ship before the dep landed.
 */

export type ReportType =
  | 'disbursement'
  | 'repayment'
  | 'portfolio'
  | 'collections'
  | 'settlement';

export type ExportFormat = 'csv' | 'pdf';

export interface ReportColumn {
  key: string;
  label: string;
  format?: 'money' | 'date' | 'datetime' | 'percent' | 'int' | 'string';
  width?: number;
}

export interface ReportData {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface ExportInput {
  reportType: ReportType;
  format: ExportFormat;
  dateFrom?: Date;
  dateTo?: Date;
  productId?: string;
  status?: string;
}

export interface ExportResult {
  filename: string;
  contentType: 'text/csv' | 'application/pdf';
  buffer: Buffer;
  rowCount: number;
}

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  // UTF-8 BOM — Excel needs this to detect encoding on Windows.
  private static readonly UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

  constructor(private prisma: PrismaService) {}

  /** End-to-end: fetch data + format + return a buffer. */
  async export(
    tenantId: string,
    input: ExportInput,
  ): Promise<ExportResult> {
    const data = await this.fetchReportData(tenantId, input);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${input.reportType}-report-${stamp}.${input.format}`;

    if (input.format === 'csv') {
      const buffer = this.generateCsv(data.columns, data.rows);
      return {
        filename,
        contentType: 'text/csv',
        buffer,
        rowCount: data.rows.length,
      };
    }

    const buffer = await this.generatePdf(data);
    return {
      filename,
      contentType: 'application/pdf',
      buffer,
      rowCount: data.rows.length,
    };
  }

  /**
   * Produce a UTF-8 BOM-prefixed CSV buffer. Each row is formatted
   * according to its column's `format` hint — money stays a string.
   */
  generateCsv(columns: ReportColumn[], rows: Record<string, unknown>[]): Buffer {
    const lines: string[] = [];
    lines.push(columns.map((c) => this.escapeCsv(c.label)).join(','));

    for (const row of rows) {
      const cells = columns.map((col) => {
        const value = row[col.key];
        if (value === null || value === undefined) return '';
        switch (col.format) {
          case 'money':
            return this.escapeCsv(String(value));
          case 'date':
            return this.escapeCsv(this.toISODate(value));
          case 'datetime':
            return this.escapeCsv(this.toISO(value));
          case 'percent':
            return this.escapeCsv(`${value}%`);
          case 'int': {
            // FIX-BA-3 — preserve exact integer values for `Prisma.Decimal`,
            // `bigint`, and any string past `Number.MAX_SAFE_INTEGER`. The
            // prior `Math.trunc(Number(value))` and the spec-suggested
            // `parseInt(...)` both round-trip through an IEEE-754 double,
            // which silently drops the low bits. BigInt is exact, so we
            // strip any fractional portion (preserving the sign on the
            // integer part) and route through BigInt instead.
            const raw = String(value).trim();
            const dot = raw.indexOf('.');
            const intPart = dot === -1 ? raw : raw.slice(0, dot);
            // Empty (e.g. value === '.5') and obviously non-integer
            // strings fall back to '0' so the column still rendered.
            const normalized =
              intPart === '' || intPart === '-' || intPart === '+'
                ? '0'
                : intPart;
            return this.escapeCsv(BigInt(normalized).toString());
          }
          default:
            return this.escapeCsv(String(value));
        }
      });
      lines.push(cells.join(','));
    }

    const body = Buffer.from(lines.join('\r\n') + '\r\n', 'utf-8');
    return Buffer.concat([ReportExportService.UTF8_BOM, body]);
  }

  /**
   * Render `data` to an A4-landscape PDF buffer via PDFKit. Throws
   * only if PDFKit itself faults during streaming — the prior
   * "dependency not installed" branch is gone now that `pdfkit` is
   * a hard dependency of analytics-service.
   */
  async generatePdf(data: ReportData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(16).text(data.title, { align: 'left' });
        if (data.subtitle) {
          doc.moveDown(0.2).fontSize(10).fillColor('#666').text(data.subtitle);
        }
        doc.fillColor('#000').moveDown(0.3);
        doc.fontSize(8).fillColor('#999').text(
          `Generated ${new Date().toISOString()} · Lōns Platform`,
        );
        doc.fillColor('#000').moveDown(0.6);

        // Table — column widths split evenly across page width.
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const widths = data.columns.map((c) => c.width ?? pageWidth / data.columns.length);

        // Header row
        doc.fontSize(9).fillColor('#000');
        let x = doc.page.margins.left;
        const headerY = doc.y;
        data.columns.forEach((col, i) => {
          doc.text(col.label, x, headerY, { width: widths[i], ellipsis: true });
          x += widths[i];
        });
        doc.moveDown(0.4);
        doc.moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .stroke();
        doc.moveDown(0.3);

        // Body
        doc.fontSize(8);
        for (const row of data.rows) {
          if (doc.y > doc.page.height - 40) {
            doc.addPage();
          }
          const rowY = doc.y;
          let cx = doc.page.margins.left;
          data.columns.forEach((col, i) => {
            const v = row[col.key];
            const text = v === null || v === undefined ? '' : String(v);
            doc.text(text, cx, rowY, { width: widths[i], ellipsis: true });
            cx += widths[i];
          });
          doc.moveDown(0.4);
        }

        doc.end();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  /**
   * Build the report data for the requested type. Reuses the same
   * Prisma reads as `ReportResolver` so the export rows match what
   * operators see on screen.
   */
  async fetchReportData(tenantId: string, input: ExportInput): Promise<ReportData> {
    switch (input.reportType) {
      case 'disbursement':
        return this.disbursementData(tenantId, input);
      case 'repayment':
        return this.repaymentData(tenantId, input);
      case 'portfolio':
        return this.portfolioData(tenantId, input);
      case 'collections':
        return this.collectionsData(tenantId, input);
      case 'settlement':
        return this.settlementData(tenantId, input);
      default:
        throw new Error(`Unknown report type: ${input.reportType as string}`);
    }
  }

  private async disbursementData(tenantId: string, input: ExportInput): Promise<ReportData> {
    const where: Record<string, unknown> = { tenantId, status: 'completed' };
    if (input.dateFrom || input.dateTo) {
      const range: Record<string, Date> = {};
      if (input.dateFrom) range.gte = input.dateFrom;
      if (input.dateTo) range.lte = input.dateTo;
      where.completedAt = range;
    }
    if (input.productId) {
      where.contract = { productId: input.productId };
    }

    const disbursements = await this.prisma.disbursement.findMany({
      where,
      include: { contract: { include: { product: { select: { name: true } } } } },
      orderBy: { completedAt: 'asc' },
    });

    const rows = disbursements.map((d) => ({
      date: d.completedAt ?? d.createdAt,
      contractId: d.contractId,
      product: d.contract?.product?.name ?? 'Unknown',
      amount: String(d.amount ?? '0'),
      currency: d.currency,
      channel: d.channel ?? '',
      reference: d.externalRef ?? '',
    }));

    return {
      title: 'Disbursement Report',
      subtitle: this.subtitleForRange(input),
      columns: [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'contractId', label: 'Contract ID' },
        { key: 'product', label: 'Product' },
        { key: 'amount', label: 'Amount', format: 'money' },
        { key: 'currency', label: 'Currency' },
        { key: 'channel', label: 'Channel' },
        { key: 'reference', label: 'Reference' },
      ],
      rows,
    };
  }

  private async repaymentData(tenantId: string, input: ExportInput): Promise<ReportData> {
    const where: Record<string, unknown> = { tenantId, status: 'completed' };
    if (input.dateFrom || input.dateTo) {
      const range: Record<string, Date> = {};
      if (input.dateFrom) range.gte = input.dateFrom;
      if (input.dateTo) range.lte = input.dateTo;
      where.completedAt = range;
    }

    const repayments = await this.prisma.repayment.findMany({
      where,
      orderBy: { completedAt: 'asc' },
    });

    const rows = repayments.map((r) => ({
      date: r.completedAt ?? r.createdAt,
      contractId: r.contractId,
      amount: String(r.amount ?? '0'),
      currency: r.currency,
      principal: String(r.allocatedPrincipal ?? '0'),
      interest: String(r.allocatedInterest ?? '0'),
      fees: String(r.allocatedFees ?? '0'),
      penalties: String(r.allocatedPenalties ?? '0'),
      method: r.method,
    }));

    return {
      title: 'Repayment Report',
      subtitle: this.subtitleForRange(input),
      columns: [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'contractId', label: 'Contract ID' },
        { key: 'amount', label: 'Amount', format: 'money' },
        { key: 'currency', label: 'Currency' },
        { key: 'principal', label: 'Principal', format: 'money' },
        { key: 'interest', label: 'Interest', format: 'money' },
        { key: 'fees', label: 'Fees', format: 'money' },
        { key: 'penalties', label: 'Penalties', format: 'money' },
        { key: 'method', label: 'Method' },
      ],
      rows,
    };
  }

  private async portfolioData(tenantId: string, input: ExportInput): Promise<ReportData> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, ...(input.productId ? { id: input.productId } : {}) },
      select: { id: true, name: true },
    });

    const rows: Record<string, unknown>[] = [];
    for (const p of products) {
      const contracts = await this.prisma.contract.findMany({
        where: { tenantId, productId: p.id },
        select: {
          principalAmount: true,
          totalOutstanding: true,
          totalPaid: true,
          daysPastDue: true,
          status: true,
        },
      });
      if (contracts.length === 0) continue;

      const totalDisbursed = contracts.reduce(
        (s, c) => add(s, String(c.principalAmount ?? '0')),
        '0',
      );
      const totalOutstanding = contracts.reduce(
        (s, c) => add(s, String(c.totalOutstanding ?? '0')),
        '0',
      );
      const totalPaid = contracts.reduce(
        (s, c) => add(s, String(c.totalPaid ?? '0')),
        '0',
      );
      const parCount = contracts.filter((c) => c.daysPastDue > 0).length;
      const parRate = contracts.length > 0 ? Math.round((parCount / contracts.length) * 10000) / 100 : 0;
      const activeCount = contracts.filter((c) =>
        ['active', 'performing', 'due', 'overdue', 'delinquent'].includes(c.status),
      ).length;

      rows.push({
        product: p.name,
        activeContracts: activeCount,
        totalContracts: contracts.length,
        totalDisbursed: bankersRound(totalDisbursed, 2),
        totalOutstanding: bankersRound(totalOutstanding, 2),
        totalPaid: bankersRound(totalPaid, 2),
        parRatePct: parRate,
      });
    }

    return {
      title: 'Portfolio Report',
      subtitle: this.subtitleForRange(input),
      columns: [
        { key: 'product', label: 'Product' },
        { key: 'activeContracts', label: 'Active', format: 'int' },
        { key: 'totalContracts', label: 'Total', format: 'int' },
        { key: 'totalDisbursed', label: 'Disbursed', format: 'money' },
        { key: 'totalOutstanding', label: 'Outstanding', format: 'money' },
        { key: 'totalPaid', label: 'Paid', format: 'money' },
        { key: 'parRatePct', label: 'PAR %', format: 'percent' },
      ],
      rows,
    };
  }

  private async collectionsData(tenantId: string, input: ExportInput): Promise<ReportData> {
    const where: Record<string, unknown> = { tenantId, daysPastDue: { gt: 0 } };
    if (input.productId) where.productId = input.productId;

    const contracts = await this.prisma.contract.findMany({
      where,
      include: { customer: { select: { fullName: true } }, product: { select: { name: true } } },
      orderBy: { daysPastDue: 'desc' },
    });

    const rows = contracts.map((c) => ({
      contractNumber: c.contractNumber,
      customer: c.customer?.fullName ?? '—',
      product: c.product?.name ?? '—',
      daysPastDue: c.daysPastDue,
      outstanding: String(c.totalOutstanding ?? '0'),
      currency: c.currency,
      status: c.status,
      classification: c.classification,
    }));

    return {
      title: 'Collections Report',
      subtitle: this.subtitleForRange(input),
      columns: [
        { key: 'contractNumber', label: 'Contract' },
        { key: 'customer', label: 'Customer' },
        { key: 'product', label: 'Product' },
        { key: 'daysPastDue', label: 'DPD', format: 'int' },
        { key: 'outstanding', label: 'Outstanding', format: 'money' },
        { key: 'currency', label: 'Currency' },
        { key: 'status', label: 'Status' },
        { key: 'classification', label: 'Classification' },
      ],
      rows,
    };
  }

  private async settlementData(tenantId: string, input: ExportInput): Promise<ReportData> {
    const where: Record<string, unknown> = { tenantId };
    if (input.status) where.status = input.status;
    if (input.dateFrom || input.dateTo) {
      const range: Record<string, Date> = {};
      if (input.dateFrom) range.gte = input.dateFrom;
      if (input.dateTo) range.lte = input.dateTo;
      where.periodStart = range;
    }

    const runs = await this.prisma.settlementRun.findMany({
      where,
      orderBy: { periodStart: 'desc' },
    });

    const rows = runs.map((r) => ({
      runId: r.id,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      totalRevenue: String(r.totalRevenue ?? '0'),
      createdAt: r.createdAt,
    }));

    return {
      title: 'Settlement Report',
      subtitle: this.subtitleForRange(input),
      columns: [
        { key: 'runId', label: 'Run ID' },
        { key: 'periodStart', label: 'Period Start', format: 'date' },
        { key: 'periodEnd', label: 'Period End', format: 'date' },
        { key: 'status', label: 'Status' },
        { key: 'totalRevenue', label: 'Revenue', format: 'money' },
        { key: 'createdAt', label: 'Created', format: 'datetime' },
      ],
      rows,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────

  private escapeCsv(value: string): string {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private toISODate(value: unknown): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value as string);
    return d.toISOString().split('T')[0];
  }

  private toISO(value: unknown): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value as string);
    return d.toISOString();
  }

  private subtitleForRange(input: ExportInput): string {
    const parts: string[] = [];
    if (input.dateFrom) parts.push(`From ${this.toISODate(input.dateFrom)}`);
    if (input.dateTo) parts.push(`to ${this.toISODate(input.dateTo)}`);
    if (input.productId) parts.push(`Product ${input.productId.slice(0, 8)}…`);
    if (input.status) parts.push(`Status ${input.status}`);
    return parts.join(' · ');
  }
}

// Re-export the divide helper indirectly used by some report columns
// so consumers don't double-import @lons/common just for division.
export { divide };
