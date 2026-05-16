import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { MicroLoanSubscriptionService } from './micro-loan-subscription.service';
import { MicroLoanOriginationService } from './micro-loan-origination.service';
import { MicroLoanCreditLimitAuditService } from './micro-loan-credit-limit-audit.service';
import { MicroLoanCreditLimitService } from './micro-loan-credit-limit.service';
import { MicroLoanCreditLimitListener } from './micro-loan-credit-limit.listener';

/**
 * Sprint 16 (Track A) — micro-loan product module.
 *
 * Mirrors the `BnplModule` / `FactoringModule` structure. Bundles every
 * micro-loan-specific service + the credit-limit event listener that
 * reacts to REPAYMENT_RECEIVED / CONTRACT_STATE_CHANGED.
 *
 * Exports the public services (subscription, origination, credit-limit,
 * audit) so the GraphQL resolver and the loan-request service can wire
 * them in.
 */
@Module({
  imports: [PrismaModule, EventBusModule, EventEmitterModule.forRoot()],
  providers: [
    MicroLoanSubscriptionService,
    MicroLoanOriginationService,
    MicroLoanCreditLimitAuditService,
    MicroLoanCreditLimitService,
    MicroLoanCreditLimitListener,
  ],
  exports: [
    MicroLoanSubscriptionService,
    MicroLoanOriginationService,
    MicroLoanCreditLimitAuditService,
    MicroLoanCreditLimitService,
  ],
})
export class MicroLoanModule {}
