import { Module } from '@nestjs/common';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { DisbursementService } from './disbursement.service';
import { MockWalletAdapter } from './adapters/mock-wallet.adapter';
import { WALLET_ADAPTER } from './adapters/wallet-adapter.interface';

@Module({
  imports: [LoanRequestModule],
  providers: [
    DisbursementService,
    { provide: WALLET_ADAPTER, useClass: MockWalletAdapter },
  ],
  exports: [DisbursementService],
})
export class DisbursementModule {}
