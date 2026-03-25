import { Module } from '@nestjs/common';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { ApprovalService } from './approval.service';

@Module({
  imports: [LoanRequestModule],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
