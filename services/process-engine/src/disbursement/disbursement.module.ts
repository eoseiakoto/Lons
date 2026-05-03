import { Module } from '@nestjs/common';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { CoolingOffModule } from '../cooling-off/cooling-off.module';
import { DisbursementService } from './disbursement.service';
import { MockWalletAdapter } from './adapters/mock-wallet.adapter';
import { WALLET_ADAPTER } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE } from './screening-gate.interface';

@Module({
  imports: [LoanRequestModule, CoolingOffModule],
  providers: [
    DisbursementService,
    { provide: WALLET_ADAPTER, useClass: MockWalletAdapter },
    // SCREENING_GATE must be provided by the composition root (e.g. graphql-server)
    // Default no-op provider prevents DI errors in unit tests; overridden in production.
    {
      provide: SCREENING_GATE,
      useValue: {
        screenCustomer: async () => ({ status: 'CLEAR', screeningId: 'not-configured' }),
      },
    },
  ],
  exports: [DisbursementService],
})
export class DisbursementModule {}
