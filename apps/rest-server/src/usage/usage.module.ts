import { Module } from '@nestjs/common';

import { UsageController } from './usage.controller';

/**
 * Sprint 14 (S14-14b) — REST usage endpoint module.
 *
 * `UsageMetricsService` is exported by `EntityServiceModule` (via
 * `PlanTierModule`), which `apps/rest-server/src/app.module.ts`
 * already imports — no extra plumbing here.
 */
@Module({
  controllers: [UsageController],
})
export class UsageRestModule {}
