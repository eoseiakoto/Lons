import { Module } from '@nestjs/common';

import { EntityServiceModule } from '@lons/entity-service';

import { UsageController } from './usage.controller';

/**
 * Sprint 14 (S14-14b) — REST usage endpoint module.
 *
 * `UsageController` is decorated with `@UseGuards(ApiKeyGuard)`, and
 * NestJS resolves guard dependencies in the DECLARING module's
 * context — not at the app level. Even though `EntityServiceModule`
 * is imported in `app.module.ts`, `ApiKeyService` is not a global
 * provider, so the guard's constructor injection fails here unless
 * this module imports `EntityServiceModule` directly. Same pattern
 * as the BNPL fix — see Docs/DE-NOTE-bnpl-rest-module-fix.md and
 * Docs/DE-NOTE-nestjs-runtime-crashes.md.
 */
@Module({
  imports: [EntityServiceModule],
  controllers: [UsageController],
})
export class UsageRestModule {}
