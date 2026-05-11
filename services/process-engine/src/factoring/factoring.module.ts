import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';
import { AuditModule } from '@lons/entity-service';

import { DebtorService } from './debtor.service';
import { InvoiceSubmissionService } from './invoice-submission.service';
import { FactoringOriginationService } from './factoring-origination.service';
import { ReserveService } from './reserve.service';
import { RecourseService } from './recourse.service';
import { ConcentrationLimitService } from './concentration-limit.service';
import { InvoiceAgingService } from './invoice-aging.service';
import { DebtorPaymentMatchingService } from './debtor-payment-matching.service';
import { InvoiceVerificationService } from './invoice-verification.service';

/**
 * Sprint 12 Phase 3 — Invoice Factoring services.
 *
 * All six services share the same dependencies (Prisma + EventBus). They have
 * mutual references that we resolve via Nest DI rather than direct imports:
 *
 *   InvoiceSubmissionService → ConcentrationLimitService (concentration check)
 *   FactoringOriginationService → DebtorService (exposure + risk)
 *   ReserveService → DebtorService (risk reassessment) + FactoringOriginationService
 *     (calls .complete() when reserve fully released)
 *   RecourseService → DebtorService (exposure write-down on non-recourse)
 *   InvoiceAgingService → RecourseService (calls .enforceDefault on default crossing)
 *
 * The two stubbed integrations from the parallel agent batch are wired here:
 *   1. ReserveService.releaseReserve → FactoringOriginationService.complete
 *      (see reserve.service.ts: integration block where reserveReleased >= reserveAmount)
 *   2. InvoiceAgingService.processAging Default-bucket crossing →
 *      RecourseService.enforceDefault (see invoice-aging.service.ts: TODO comment)
 *
 * The actual call-site wiring is implemented inside the consuming services
 * via constructor injection; this module just makes the providers visible
 * to one another.
 */
@Module({
  // S13B-1: AuditModule for webhook-activity audit writes from
  // DebtorPaymentMatchingService.
  imports: [PrismaModule, EventBusModule, AuditModule],
  providers: [
    DebtorService,
    InvoiceSubmissionService,
    FactoringOriginationService,
    ReserveService,
    RecourseService,
    ConcentrationLimitService,
    InvoiceAgingService,
    DebtorPaymentMatchingService,
    // Sprint 14 (S14-IF-1) — verification queue service.
    InvoiceVerificationService,
  ],
  exports: [
    DebtorService,
    InvoiceSubmissionService,
    FactoringOriginationService,
    ReserveService,
    RecourseService,
    ConcentrationLimitService,
    InvoiceAgingService,
    DebtorPaymentMatchingService,
    InvoiceVerificationService,
  ],
})
export class ProcessEngineFactoringModule {}
