import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { ApiKeyService } from './api-key.service';
import { ApiKeyRotationService } from './api-key-rotation.service';

@Module({
  // Sprint 14 (S14-10): API-key quota enforcement on creation.
  imports: [PlanTierModule],
  providers: [ApiKeyService, ApiKeyRotationService],
  exports: [ApiKeyService, ApiKeyRotationService],
})
export class ApiKeyModule {}
