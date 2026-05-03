import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { DebtorService } from './debtor.service';
import { InvoiceSubmissionService } from './invoice-submission.service';

/**
 * Sprint 12 Phase 3 — Invoice Factoring services.
 *
 * Phase 3A wires `DebtorService`. Phase 3B adds `InvoiceSubmissionService`.
 * Phase 3C adds `FactoringOriginationService`, etc. All share the same
 * imports (Prisma + EventBus); add new services additively to the
 * providers/exports arrays.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [DebtorService, InvoiceSubmissionService],
  exports: [DebtorService, InvoiceSubmissionService],
})
export class ProcessEngineFactoringModule {}
