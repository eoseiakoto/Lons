import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { ApprovalService } from './approval.service';
import { ApprovalLimitService } from './approval-limit.service';

@Module({
  // PrismaModule for the limits CRUD; LoanRequestModule for the
  // existing approval flow. REDIS_CLIENT comes from RedisClientModule
  // registered at the composition root (graphql-server / rest-server).
  imports: [PrismaModule, LoanRequestModule],
  providers: [ApprovalService, ApprovalLimitService],
  exports: [ApprovalService, ApprovalLimitService],
})
export class ApprovalModule {}
