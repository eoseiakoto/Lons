import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { ReportExportService } from './report-export.service';

/**
 * Sprint 18 (S18-3) — CSV + PDF export for the existing report
 * resolver. Registered in `AnalyticsServiceModule` so the resolver
 * can inject `ReportExportService` via the `@lons/analytics-service`
 * package barrel.
 */
@Module({
  imports: [PrismaModule],
  providers: [ReportExportService],
  exports: [ReportExportService],
})
export class ReportExportModule {}
