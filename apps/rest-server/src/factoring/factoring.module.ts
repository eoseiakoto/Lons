import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { ProcessEngineFactoringModule } from '@lons/process-engine';
import { EntityServiceModule } from '@lons/entity-service';

import { FactoringController } from './factoring.controller';

/**
 * Sprint 12 Phase 4B — Seller-facing Invoice Factoring REST module.
 *
 * Imports:
 *   - PrismaModule                 — direct read-only access for invoice lookups.
 *   - ProcessEngineFactoringModule — exposes DebtorService, InvoiceSubmissionService,
 *                                     FactoringOriginationService.
 *   - EntityServiceModule          — provides ApiKeyService for the ApiKeyGuard.
 */
@Module({
  imports: [PrismaModule, ProcessEngineFactoringModule, EntityServiceModule],
  controllers: [FactoringController],
})
export class FactoringRestModule {}
