import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { AuditModule } from '../audit/audit.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
// S17-7: TenantOnboardingService now auto-provisions an ApiKey for the
// freshly-created tenant. Pulling ApiKeyModule in here keeps the wiring
// explicit and the API-key creation path under existing quota / audit
// guarantees.
import { ApiKeyModule } from '../api-key/api-key.module';
import { TenantService } from './tenant.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
// Sprint 18 (S18-11) — tenant-initiated plan tier upgrade requests.
import { UpgradeRequestService } from './upgrade-request.service';

@Module({
  imports: [PrismaModule, EventBusModule, AuditModule, PlatformConfigModule, ApiKeyModule],
  providers: [TenantService, TenantOnboardingService, UpgradeRequestService],
  exports: [TenantService, TenantOnboardingService, UpgradeRequestService],
})
export class TenantModule {}
