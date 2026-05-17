import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, WalletAdaptersModule } from '@lons/common';

import { BnplOriginationService } from './bnpl-origination.service';
import { MerchantSettlementService } from './merchant-settlement.service';
import { BnplEligibilityService } from './bnpl-eligibility.service';
import { BnplInstallmentService } from './bnpl-installment.service';
import { BnplRefundService } from './bnpl-refund.service';
import {
  BNPL_COLLECTION_ADAPTER,
  MockBnplCollectionAdapter,
} from './wallet-collection-adapter';
import { BnplRepaymentRestoreListener } from './bnpl-repayment-restore.listener';
import { BnplCreditLineModule } from '@lons/entity-service';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    // S17-FIX-3: shared wallet adapters from @lons/common. Registers
    // SharedMockWalletDisbursementAdapter and SharedMockWalletCollectionAdapter
    // under WALLET_DISBURSEMENT_ADAPTER / WALLET_COLLECTION_ADAPTER tokens.
    // Phase 5 will call WalletAdaptersModule.register({ liveAdapters: [...] }).
    WalletAdaptersModule.register(),
    // S17-FIX-2: BnplCreditLineModule provides BnplCreditLineService which
    // the repayment restore listener needs to call restoreAvailableLimit.
    BnplCreditLineModule,
  ],
  providers: [
    BnplOriginationService,
    MerchantSettlementService,
    BnplEligibilityService,
    BnplInstallmentService,
    BnplRefundService,
    // Sprint 12 G2 — auto-collection adapter. Defaults to the
    // deterministic mock; Phase 5 swaps it for the integration-service
    // adapter via the same DI token.
    MockBnplCollectionAdapter,
    { provide: BNPL_COLLECTION_ADAPTER, useExisting: MockBnplCollectionAdapter },
    // S17-FIX-2: subscribes to REPAYMENT_RECEIVED and restores BNPL
    // credit line availableLimit when allocatedPrincipal > 0.
    BnplRepaymentRestoreListener,
  ],
  exports: [
    BnplOriginationService,
    MerchantSettlementService,
    BnplEligibilityService,
    BnplInstallmentService,
    BnplRefundService,
    BNPL_COLLECTION_ADAPTER,
  ],
})
export class BnplModule {}
