import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
// S17-7: TenantOnboardingService now auto-provisions an ApiKey for the
// freshly-created tenant. Pulling ApiKeyModule in here keeps the wiring
// explicit and the API-key creation path under existing quota / audit
// guarantees.
import { ApiKeyModule } from '../api-key/api-key.module';
import { TenantService } from './tenant.service';
import { TenantOnboardingService } from './tenant-onboarding.service';

@Module({
  imports: [AuditModule, PlatformConfigModule, ApiKeyModule],
  providers: [TenantService, TenantOnboardingService],
  exports: [TenantService, TenantOnboardingService],
})
export class TenantModule {}
