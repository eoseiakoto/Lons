import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EventType } from '@lons/event-contracts';

import { MicroLoanCreditLimitService } from './micro-loan-credit-limit.service';

/**
 * Sprint 16 (S16-4 + S16-5) — event listener that wires
 * `MicroLoanCreditLimitService` into the global event bus.
 *
 * Two subscriptions:
 *   - `REPAYMENT_RECEIVED` → `reviewOnRepayment(...)`. The service
 *     itself filters out non-micro-loan products + contracts with days
 *     past due, so the listener is a thin pass-through.
 *   - `CONTRACT_STATE_CHANGED` → `reduceOnDefault(...)` when the new
 *     status is `default_status`. Same product-type filter inside the
 *     service.
 *
 * Listener catches its own errors so a failing credit-limit review
 * never blocks the originating payment / contract transition. Errors
 * are logged with a clear breadcrumb for ops investigation.
 */
@Injectable()
export class MicroLoanCreditLimitListener {
  private readonly logger = new Logger(MicroLoanCreditLimitListener.name);

  constructor(
    private readonly creditLimitService: MicroLoanCreditLimitService,
  ) {}

  @OnEvent(EventType.REPAYMENT_RECEIVED)
  async onRepaymentReceived(event: {
    tenantId?: string;
    data?: {
      contractId?: string;
      repaymentId?: string;
      scheduleEntryId?: string;
    };
  }): Promise<void> {
    const tenantId = event.tenantId;
    const contractId = event.data?.contractId;
    const repaymentId = event.data?.repaymentId ?? event.data?.scheduleEntryId ?? '';
    if (!tenantId || !contractId) return;
    try {
      await this.creditLimitService.reviewOnRepayment(
        tenantId,
        contractId,
        repaymentId,
      );
    } catch (err) {
      this.logger.error(
        `reviewOnRepayment failed for contract ${contractId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(EventType.CONTRACT_STATE_CHANGED)
  async onContractStateChanged(event: {
    tenantId?: string;
    data?: { contractId?: string; newStatus?: string };
  }): Promise<void> {
    const tenantId = event.tenantId;
    const contractId = event.data?.contractId;
    const newStatus = event.data?.newStatus;
    if (!tenantId || !contractId || newStatus !== 'default_status') return;
    try {
      await this.creditLimitService.reduceOnDefault(tenantId, contractId);
    } catch (err) {
      this.logger.error(
        `reduceOnDefault failed for contract ${contractId}: ${(err as Error).message}`,
      );
    }
  }
}
