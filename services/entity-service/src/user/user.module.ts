import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { UserService } from './user.service';

@Module({
  // Sprint 14 (S14-10): plan-tier quota enforcement on user create.
  imports: [PlanTierModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
