import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { ContractWriteOperationsService } from './contract-write-operations.service';

/**
 * Sprint 18 (S18-2) — operator write operations on active contracts.
 *
 * `PaymentService` from `@lons/repayment-service` is `@Optional()`
 * inside `ContractWriteOperationsService`. The composition root
 * (graphql-server / rest-server) wires `RepaymentServiceModule` so the
 * payment dependency resolves at runtime; unit tests construct the
 * service with a stub `PaymentService` directly.
 *
 * Lives in its own module to avoid pulling `@lons/repayment-service`
 * into process-engine's package.json — the cross-package dependency
 * stays at the composition root.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [ContractWriteOperationsService],
  exports: [ContractWriteOperationsService],
})
export class ContractWriteOperationsModule {}
