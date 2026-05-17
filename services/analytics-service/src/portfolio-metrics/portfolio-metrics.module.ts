import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { PortfolioMetricsService } from './portfolio-metrics.service';

/**
 * S18-10 — Portfolio metrics module.
 *
 * Provides the filterable {@link PortfolioMetricsService}. Track A's
 * GraphQL resolver should import this module (transitively via
 * AnalyticsServiceModule) and replace the existing
 * `@lons/process-engine`.AnalyticsService dependency.
 */
@Module({
  imports: [PrismaModule],
  providers: [PortfolioMetricsService],
  exports: [PortfolioMetricsService],
})
export class PortfolioMetricsModule {}
