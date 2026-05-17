import { Module } from '@nestjs/common';
import { PlanTierModule } from '@lons/entity-service';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { CoolingOffModule } from '../cooling-off/cooling-off.module';
import { PipelineRetryModule } from '../pipeline/pipeline-retry.module';
import { DisbursementService } from './disbursement.service';
import { MockWalletAdapter } from './adapters/mock-wallet.adapter';
import { WALLET_ADAPTER } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE } from './screening-gate.interface';

@Module({
  // Sprint 14 (S14-14a): PlanTierModule provides QuotaTrackingService for
  // the disbursement-time monthly-cap enforcement. PlanTierModule itself
  // depends on REDIS_CLIENT — apps must register
  // RedisClientModule.forRoot() at composition root.
  //
  // Sprint 18 (S18-12): PipelineRetryModule provides PipelineRetryService
  // for delayed-job retry scheduling. Apps must register
  // `BullModule.forRoot({ connection: { ... } })` at composition root
  // so the BullMQ queue actually delivers jobs.
  imports: [LoanRequestModule, CoolingOffModule, PlanTierModule, PipelineRetryModule],
  providers: [
    DisbursementService,
    // S18-FIX-2: WALLET_ADAPTER default remains MockWalletAdapter for unit
    // tests and local dev. In production (graphql-server composition root),
    // this binding is OVERRIDDEN by a WalletAdapterResolver factory provider:
    //
    //   { provide: WALLET_ADAPTER,
    //     useFactory: (resolver: WalletAdapterResolver) => resolver,
    //     inject: [WalletAdapterResolver] }
    //
    // WalletAdapterResolver.resolve(tenantId) returns the correct adapter
    // (MTN MoMo, M-Pesa, or fallback mock) based on the tenant's
    // WalletProviderConfig row in the database.
    //
    // WIRING REQUIRED in app.module.ts (Phase 2): import WalletAdapterModule
    // (from integration-service) and provide WALLET_ADAPTER via the resolver.
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
  exports: [DisbursementService, WALLET_ADAPTER],
})
export class DisbursementModule {}
