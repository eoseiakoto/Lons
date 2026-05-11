import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { DisbursementFeeService } from './disbursement-fee.service';

/**
 * Sprint 14 (S14-13) — listener that turns `DISBURSEMENT_COMPLETED`
 * events into metered fee records.
 *
 * The disbursement event carries the gross amount and IDs but not the
 * product type / currency we need for the rate lookup, so we hydrate
 * the contract to get them. The listener is fire-and-forget: errors
 * are logged but never thrown, so a billing failure doesn't roll back
 * the disbursement transaction.
 */
@Injectable()
export class DisbursementFeeListener {
  private readonly logger = new Logger(DisbursementFeeListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly disbursementFeeService: DisbursementFeeService,
  ) {}

  @OnEvent(EventType.DISBURSEMENT_COMPLETED)
  async handleDisbursementCompleted(event: {
    tenantId: string;
    data: {
      disbursementId: string;
      contractId: string;
      customerId: string;
      amount: string;
    };
  }): Promise<void> {
    try {
      const contract = await this.prisma.contract.findUnique({
        where: { id: event.data.contractId },
        include: { product: { select: { type: true } } },
      });
      if (!contract) {
        this.logger.warn(
          `Contract ${event.data.contractId} not found — skipping fee for disbursement ${event.data.disbursementId}`,
        );
        return;
      }

      await this.disbursementFeeService.recordFee(event.tenantId, {
        disbursementId: event.data.disbursementId,
        contractId: event.data.contractId,
        amount: event.data.amount,
        currency: contract.currency,
        productType: contract.product.type,
      });
    } catch (err) {
      // Billing must never break the primary disbursement path. Log and
      // continue. A nightly reconciliation job (Sprint 15) will catch
      // any orphan disbursements without fees.
      this.logger.error(
        `Failed to record disbursement fee for ${event.data.disbursementId}: ${(err as Error).message}`,
      );
    }
  }
}
