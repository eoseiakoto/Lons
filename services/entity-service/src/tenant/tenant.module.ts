import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { TenantService } from './tenant.service';
import { TenantOnboardingService } from './tenant-onboarding.service';

@Module({
  imports: [AuditModule, PlatformConfigModule],
  providers: [TenantService, TenantOnboardingService],
  exports: [TenantService, TenantOnboardingService],
})
export class TenantModule {}
