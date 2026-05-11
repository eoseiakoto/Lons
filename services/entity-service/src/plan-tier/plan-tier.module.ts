import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { PlanTierConfigService } from './plan-tier-config.service';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { QuotaTrackingService } from './quota-tracking.service';
import { UsageMetricsService } from './usage-metrics.service';

/**
 * Sprint 14 (S14-9 + S14-10 + S14-14a/b) — plan tier infrastructure.
 *
 * Exports four services:
 *   - `PlanTierConfigService` — DB-driven tier matrix accessor (cached).
 *   - `QuotaEnforcementService` — pre-create entity limit checks.
 *   - `QuotaTrackingService` — Redis-backed disbursement / API counters.
 *   - `UsageMetricsService` — read-only API surface for the admin portal.
 *
 * Consumers (entity services, process-engine disbursement) import this
 * module to gate writes against the tenant's plan. The `REDIS_CLIENT`
 * token used by the cache and counters is provided by
 * `RedisClientModule.forRoot()` at the app composition root.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    PlanTierConfigService,
    QuotaEnforcementService,
    QuotaTrackingService,
    UsageMetricsService,
  ],
  exports: [
    PlanTierConfigService,
    QuotaEnforcementService,
    QuotaTrackingService,
    UsageMetricsService,
  ],
})
export class PlanTierModule {}
