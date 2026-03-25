import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { TenantService } from './tenant.service';

@Module({
  imports: [AuditModule],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
