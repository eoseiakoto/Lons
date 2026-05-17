import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EventType } from '@lons/event-contracts';

import { BnplCreditLineAdjustmentService } from './bnpl-credit-line-adjustment.service';

/**
 * S17-FIX-1 — event listener that wires `PRODUCT_CONFIG_CHANGED` into
 * the BNPL credit-limit adjustment pipeline.
 *
 * When an operator reduces a product's `maxAmount` (or `minAmount`),
 * the product service emits `PRODUCT_CONFIG_CHANGED` with the new
 * limits. This listener calls `evaluateProductConfigChange` which
 * finds all ACTIVE credit lines for the product and caps any that
 * exceed the new ceiling.
 *
 * Errors are swallowed per the project-wide "best-effort" convention
 * for event-driven side-effects — a failing credit-line cap should
 * never roll back the product update itself.
 */
@Injectable()
export class BnplCreditLineAdjustmentListener {
  private readonly logger = new Logger(BnplCreditLineAdjustmentListener.name);

  constructor(
    private readonly adjustmentService: BnplCreditLineAdjustmentService,
  ) {}

  @OnEvent(EventType.PRODUCT_CONFIG_CHANGED)
  async onProductConfigChanged(event: {
    tenantId?: string;
    data?: {
      productId?: string;
      newMaxAmount?: string;
      changeDescription?: string;
    };
  }): Promise<void> {
    const tenantId = event.tenantId;
    const productId = event.data?.productId;
    const newMaxAmount = event.data?.newMaxAmount;

    // Guard: only act when maxAmount is part of the change.
    if (!tenantId || !productId || !newMaxAmount) return;

    try {
      const adjustments = await this.adjustmentService.evaluateProductConfigChange(
        tenantId,
        productId,
        {
          newMaxAmount,
          changeDescription: event.data?.changeDescription,
        },
      );
      if (adjustments.length > 0) {
        this.logger.log(
          `PRODUCT_CONFIG_CHANGED: capped ${adjustments.length} credit line(s) for product ${productId.slice(0, 8)}…`,
        );
      }
    } catch (err) {
      this.logger.error(
        `evaluateProductConfigChange failed for product ${productId}: ${(err as Error).message}`,
      );
    }
  }
}
