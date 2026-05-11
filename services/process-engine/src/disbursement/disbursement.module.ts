import { Module } from '@nestjs/common';
import { PlanTierModule } from '@lons/entity-service';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { CoolingOffModule } from '../cooling-off/cooling-off.module';
import { DisbursementService } from './disbursement.service';
import { MockWalletAdapter } from './adapters/mock-wallet.adapter';
import { WALLET_ADAPTER } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE } from './screening-gate.interface';

@Module({
  // Sprint 14 (S14-14a): PlanTierModule provides QuotaTrackingService for
  // the disbursement-time monthly-cap enforcement. PlanTierModule itself
  // depends on REDIS_CLIENT — apps must register
  // RedisClientModule.forRoot() at composition root.
  imports: [LoanRequestModule, CoolingOffModule, PlanTierModule],
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
