import { Resolver, Mutation, Args } from '@nestjs/graphql';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { ReportExportService } from '@lons/analytics-service';
import { CurrentTenant, Roles } from '@lons/entity-service';

import {
  ExportFormatEnum,
  ExportReportInput,
  ExportResultType,
  ReportTypeEnum,
} from '../inputs/report-export.input';

/**
 * Sprint 18 (S18-3) — CSV / PDF export of analytics reports.
 *
 * The mutation returns the file body base64-encoded so the admin
 * portal can construct a data: URL and trigger a download without a
 * separate REST endpoint. CSVs are always small (a few hundred
 * rows × ~100 bytes); PDFs are page-bounded by PDFKit's default
 * line-break behaviour. For exports >5MB consider swapping the
 * return shape for a signed URL.
 */
@Resolver()
export class ReportExportResolver {
  constructor(private readonly exportService: ReportExportService) {}

  @Mutation(() => ExportResultType)
  @AuditAction(AuditActionType.EXPORT, AuditResourceType.REPORT)
  @Roles('analytics:read')
  async exportReport(
    @CurrentTenant() tenantId: string,
    @Args('input', { type: () => ExportReportInput }) input: ExportReportInput,
  ): Promise<ExportResultType> {
    const result = await this.exportService.export(tenantId, {
      reportType: input.reportType as unknown as 'disbursement',
      format: input.format as unknown as 'csv',
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      productId: input.productId,
      status: input.status,
    });

    return {
      filename: result.filename,
      contentType: result.contentType,
      content: result.buffer.toString('base64'),
      rowCount: result.rowCount,
      generatedAt: new Date(),
    };
  }
}

// Re-export the enums so generated client code in the admin portal
// keeps a single import surface. (Used by Apollo codegen.)
export { ExportFormatEnum, ReportTypeEnum };
