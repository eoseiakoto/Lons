import { Module } from '@nestjs/common';

import { LoanRequestService } from './loan-request.service';

@Module({
  providers: [LoanRequestService],
  exports: [LoanRequestService],
})
export class LoanRequestModule {}
