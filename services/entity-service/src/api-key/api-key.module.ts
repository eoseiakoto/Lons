import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { AuditModule } from '../audit/audit.module';
import { ApiKeyService } from './api-key.service';
import { ApiKeyRotationService } from './api-key-rotation.service';

@Module({
  // Sprint 14 (S14-10): API-key quota enforcement on creation.
  // S17-FIX-BA-3: AuditService for rotation/revocation audit trail
  // (FR-SEC-002.3).
  imports: [PlanTierModule, AuditModule],
  providers: [ApiKeyService, ApiKeyRotationService],
  exports: [ApiKeyService, ApiKeyRotationService],
})
export class ApiKeyModule {}
