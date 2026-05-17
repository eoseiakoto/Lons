import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService, BnplCreditLineStatus, ProductType } from '@lons/database';
import { compare } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { BnplCreditLineService } from '@lons/entity-service';

/**
 * S17-FIX-2 — Restore BNPL credit line `availableLimit` when a repayment
 * allocates principal on a BNPL contract.
 *
 * The `payment.service.ts` in `repayment-service` emits `REPAYMENT_RECEIVED`
 * for all loan types. This listener filters to BNPL (revolving) contracts
 * only — micro-loan contracts are NOT revolving and restore only on full
 * settlement (handled elsewhere). When `allocatedPrincipal > 0`, the
 * customer's BNPL credit line is restored atomically using the shared
 * `restoreAvailableLimit` SQL (LEAST cap prevents exceeding approvedLimit).
 *
 * Best-effort: errors are logged but do not roll back the repayment.
 */
@Injectable()
export class BnplRepaymentRestoreListener {
  private readonly logger = new Logger(BnplRepaymentRestoreListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditLineService: BnplCreditLineService,
  ) {}

  @OnEvent(EventType.REPAYMENT_RECEIVED)
  async onRepaymentReceived(event: {
    tenantId?: string;
    data?: {
      contractId?: string;
      allocatedPrincipal?: string;
      repaymentId?: string;
    };
  }): Promise<void> {
    const tenantId = event.tenantId;
    const contractId = event.data?.contractId;
    const allocatedPrincipal = event.data?.allocatedPrincipal;

    if (!tenantId || !contractId) return;

    // Guard: nothing to restore when principal allocation is zero/absent.
    if (!allocatedPrincipal || compare(allocatedPrincipal, '0') <= 0) return;

    try {
      // Look up the contract to determine product type.
      const contract = await this.prisma.contract.findFirst({
        where: { id: contractId, tenantId },
        select: { customerId: true, productId: true, product: { select: { type: true } } },
      });

      if (!contract) return;

      // S17-FIX-2: only restore for BNPL (revolving) products.
      // Micro-loan / overdraft / factoring are NOT revolving.
      if (contract.product?.type !== ProductType.bnpl) return;

      // Find the active credit line for this customer + product.
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          tenantId,
          customerId: contract.customerId,
          productId: contract.productId,
          status: 'active',
        },
        select: { id: true },
      });
      if (!subscription) return;

      const creditLine = await this.prisma.bnplCreditLine.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          status: BnplCreditLineStatus.active,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!creditLine) return;

      await this.creditLineService.restoreAvailableLimit(
        tenantId,
        creditLine.id,
        allocatedPrincipal,
      );

      this.logger.debug(
        `REPAYMENT_RECEIVED: restored ${allocatedPrincipal} to BNPL credit line ${creditLine.id.slice(0, 8)}… (contract=${contractId.slice(0, 8)}…)`,
      );
    } catch (err) {
      // Best-effort — never block the repayment confirmation.
      this.logger.error(
        `BnplRepaymentRestoreListener failed for contract ${contractId}: ${(err as Error).message}`,
      );
    }
  }
}
