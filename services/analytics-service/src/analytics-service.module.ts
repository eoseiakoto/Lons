import { Module } from '@nestjs/common';

import { PortfolioMetricsModule } from './portfolio-metrics/portfolio-metrics.module';
import { ReportExportModule } from './reports/report-export.module';

/**
 * Top-level module for the analytics service.
 *
 * Composes the S18-10 portfolio-metrics module and the S18-3 report
 * export module (CSV/PDF export of all existing analytics reports).
 * Future analytics surfaces should be added as sibling modules so
 * consumers can import the single top-level module rather than
 * re-wiring each surface.
 */
@Module({
  imports: [PortfolioMetricsModule, ReportExportModule],
  exports: [PortfolioMetricsModule, ReportExportModule],
})
export class AnalyticsServiceModule {}
