import { Module } from '@nestjs/common';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { ContractService } from './contract.service';
import { ContractNumberGenerator } from './contract-number.generator';

@Module({
  imports: [LoanRequestModule],
  providers: [ContractService, ContractNumberGenerator],
  exports: [ContractService],
})
export class ContractModule {}
