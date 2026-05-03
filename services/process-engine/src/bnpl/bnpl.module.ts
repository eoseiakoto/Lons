import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { BnplOriginationService } from './bnpl-origination.service';
import { MerchantSettlementService } from './merchant-settlement.service';
import { BnplEligibilityService } from './bnpl-eligibility.service';
import { BnplInstallmentService } from './bnpl-installment.service';
import { BnplRefundService } from './bnpl-refund.service';
import {
  BNPL_COLLECTION_ADAPTER,
  MockBnplCollectionAdapter,
} from './wallet-collection-adapter';

@Module({
  imports: [PrismaModule, EventBusModule],
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
