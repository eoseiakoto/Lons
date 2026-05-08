import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@lons/database';
import { ProcessEngineFactoringModule } from '@lons/process-engine';

import { DebtorPaymentWebhookController } from './debtor-payment-webhook.controller';

/**
 * Sprint 13 S13-1 — Inbound debtor-payment webhook module.
 *
 * Imports:
 *   - PrismaModule                   — needed by the controller for tenant
 *                                       context entry around the async
 *                                       matchingService.matchAndApply call.
 *   - ProcessEngineFactoringModule   — exposes DebtorPaymentMatchingService.
 *   - ConfigModule                   — for env-var lookups
 *                                       (WEBHOOK_SECRET_*, WEBHOOK_TENANT_*).
 */
@Module({
  imports: [PrismaModule, ProcessEngineFactoringModule, ConfigModule],
  controllers: [DebtorPaymentWebhookController],
})
export class DebtorPaymentWebhookModule {}
