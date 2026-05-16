import { Module } from '@nestjs/common';

import { LoanRequestService } from './loan-request.service';
import { MicroLoanModule } from '../micro-loan/micro-loan.module';

@Module({
  // Sprint 16 (S16-2): micro-loan pre-validation hook injected into
  // LoanRequestService. Import is one-way (loan-request → micro-loan);
  // micro-loan never imports loan-request to avoid a cycle.
  imports: [MicroLoanModule],
  providers: [LoanRequestService],
  exports: [LoanRequestService],
})
export class LoanRequestModule {}
