import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { BnplCreditLineService } from './bnpl-credit-line.service';
import { BnplCreditLineAdjustmentService } from './bnpl-credit-line-adjustment.service';
import { BnplCreditLineAdjustmentListener } from './bnpl-credit-line-adjustment.listener';

/**
 * Sprint 15 (S15-1 + S15-2) — BNPL credit line module.
 *
 * Exports the CRUD service and the dynamic adjustment service. Consumed
 * by the GraphQL resolver (apps/graphql-server) and the BNPL origination
 * + installment services in process-engine (for limit checks and
 * restoration on repayment).
 *
 * S17-FIX-1: `BnplCreditLineAdjustmentListener` registers for the
 * `PRODUCT_CONFIG_CHANGED` event so product maxAmount reductions
 * automatically cap existing credit lines.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [BnplCreditLineService, BnplCreditLineAdjustmentService, BnplCreditLineAdjustmentListener],
  exports: [BnplCreditLineService, BnplCreditLineAdjustmentService],
})
export class BnplCreditLineModule {}
