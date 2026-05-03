import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  BnplTransactionStatus,
  InstallmentStatus,
} from '@lons/database';
import {
  EventBusService,
  add,
  bankersRound,
  compare,
  divide,
  isPositive,
  isZero,
  multiply,
  subtract,
  toDecimal,
  ValidationError,
  NotFoundError,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

export type RefundType = 'full' | 'partial';

export interface InitiateRefundInput {
  transactionId: string;
  /** Decimal string. For `full` the value is informational. */
  amount: string;
  type: RefundType;
  reason: string;
  operatorId: string;
  /** Optional idempotency key — currently logged for traceability (FIX 12). */
  idempotencyKey?: string;
}

export interface RefundResult {
  refundedToCustomer: string;
  clawedBackFromMerchant: string;
  cancelledInstallments: number;
  reducedInstallments: number;
}

/**
 * BNPL refund engine (Sprint 11 Track B / B8).
 *
 * Two flows:
 *
 *   - **Full refund**: every unpaid installment is `waived`, every paid
 *     installment is reimbursed to the customer in full. The
 *     transaction goes to `refunded` status. Merchant settlement is
 *     clawed back for the full purchase amount.
 *
 *   - **Partial refund**: each unpaid installment is reduced
 *     proportionally to `(amount / totalRepayable)`. If the requested
 *     refund exceeds the remaining unpaid total, the difference is
 *     reimbursed from the customer's already-paid amounts. The
 *     transaction stays `active` (or `approved`) — only `full` flips
 *     it to `refunded`.
 *
 * Customer reimbursement is recorded as an event payload — the actual
 * wallet credit is handled by the integration service via subscription
 * to `bnpl.refund.completed`. Merchant clawback likewise: the
 * settlement-clawback adjustment is event-driven so the settlement
 * service can reconcile against the next batch.
 */
@Injectable()
export class BnplRefundService {
  private readonly logger = new Logger('BnplRefundService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async initiate(
    tenantId: string,
    input: InitiateRefundInput,
  ): Promise<RefundResult> {
    // FIX 12: log the idempotency key for traceability. Full
    // deduplication (idempotency table) lands alongside ledger entries.
    if (input.idempotencyKey) {
      this.logger.debug(`Refund idempotencyKey: ${input.idempotencyKey}`);
    }
    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: input.transactionId, tenantId, deletedAt: null },
      include: { installments: { orderBy: { installmentNumber: 'asc' } }, merchant: true },
    });
    if (!tx) throw new NotFoundError('BnplTransaction', input.transactionId);

    if (
      tx.status === BnplTransactionStatus.cancelled ||
      tx.status === BnplTransactionStatus.refunded
    ) {
      throw new ValidationError(
        `Cannot refund a ${tx.status} transaction (${input.transactionId})`,
      );
    }
    if (input.type === 'partial' && !isPositive(input.amount)) {
      throw new ValidationError(`Partial refund amount must be positive (got ${input.amount})`);
    }

    this.eventBus.emitAndBuild(EventType.BNPL_REFUND_INITIATED, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      merchantId: tx.merchantId,
      refundAmount: input.type === 'full' ? String(tx.purchaseAmount) : input.amount,
      refundType: input.type,
      reason: input.reason,
    });

    const result =
      input.type === 'full'
        ? await this.applyFullRefund(tenantId, tx)
        : await this.applyPartialRefund(tenantId, tx, input.amount);

    this.eventBus.emitAndBuild(EventType.BNPL_REFUND_COMPLETED, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      merchantId: tx.merchantId,
      refundedToCustomer: result.refundedToCustomer,
      clawedBackFromMerchant: result.clawedBackFromMerchant,
      completedAt: new Date().toISOString(),
    });

    this.logger.log(
      `Refund ${input.type} on ${tx.id.slice(0, 8)}… — refunded ${result.refundedToCustomer} to customer, clawed back ${result.clawedBackFromMerchant} from merchant`,
    );

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  private async applyFullRefund(
    tenantId: string,
    tx: BnplTxWithInstallments,
  ): Promise<RefundResult> {
    let refundedToCustomer = '0';
    let cancelledInstallments = 0;

    for (const inst of tx.installments) {
      if (
        inst.status === InstallmentStatus.paid ||
        inst.status === InstallmentStatus.overdue ||
        inst.status === InstallmentStatus.due ||
        inst.status === InstallmentStatus.pending
      ) {
        // Sum paid amounts for customer reimbursement, then waive.
        if (isPositive(String(inst.paidAmount))) {
          refundedToCustomer = add(refundedToCustomer, String(inst.paidAmount));
        }
        if (inst.status !== InstallmentStatus.paid) {
          cancelledInstallments += 1;
        }
        await this.prisma.installmentSchedule.update({
          where: { id: inst.id },
          data: { status: InstallmentStatus.waived },
        });
      }
    }

    await this.prisma.bnplTransaction.update({
      where: { id: tx.id },
      data: {
        status: BnplTransactionStatus.refunded,
        cancelledAt: new Date(),
      },
    });

    // FIX 1 (P0): Merchant clawback = the NET amount they actually
    // received, NOT the gross purchase amount. The merchant only ever
    // saw `purchaseAmount × (1 − discountRate)` in their settlement;
    // clawing back gross would over-collect by the discount fee.
    // The settlement service consumes the event and reverses against
    // the next batch settlement.
    const discountRate = String(tx.merchant?.discountRate ?? '0');
    const discountFee = bankersRound(multiply(String(tx.purchaseAmount), discountRate), 4);
    const netClawback = subtract(String(tx.purchaseAmount), discountFee);

    return {
      refundedToCustomer: bankersRound(refundedToCustomer, 4),
      clawedBackFromMerchant: bankersRound(netClawback, 4),
      cancelledInstallments,
      reducedInstallments: 0,
    };
  }

  private async applyPartialRefund(
    tenantId: string,
    tx: BnplTxWithInstallments,
    amount: string,
  ): Promise<RefundResult> {
    if (compare(amount, String(tx.purchaseAmount)) >= 0) {
      throw new ValidationError(
        `Partial refund ${amount} >= purchaseAmount ${tx.purchaseAmount}; use type="full" instead`,
      );
    }

    // Sum the remaining unpaid balance across unpaid installments.
    const unpaid = tx.installments.filter(
      (i) =>
        i.status === InstallmentStatus.pending ||
        i.status === InstallmentStatus.due ||
        i.status === InstallmentStatus.overdue,
    );
    let totalUnpaid = '0';
    for (const inst of unpaid) {
      totalUnpaid = add(totalUnpaid, subtract(String(inst.amount), String(inst.paidAmount)));
    }

    let absorbedByReduction = '0';
    let refundedToCustomer = '0';
    let reducedInstallments = 0;

    if (compare(amount, totalUnpaid) <= 0) {
      // Refund fits within the remaining unpaid balance — proportionally
      // reduce each unpaid installment.
      const ratio = isZero(totalUnpaid) ? '0' : divide(amount, totalUnpaid);
      let runningCovered = '0';
      for (let i = 0; i < unpaid.length; i++) {
        const inst = unpaid[i];
        const remaining = subtract(String(inst.amount), String(inst.paidAmount));
        const isLast = i === unpaid.length - 1;
        const reduction = isLast
          ? subtract(amount, runningCovered)
          : bankersRound(multiply(remaining, ratio), 4);
        if (!isLast) runningCovered = add(runningCovered, reduction);

        const newAmount = subtract(String(inst.amount), reduction);
        await this.prisma.installmentSchedule.update({
          where: { id: inst.id },
          data: { amount: newAmount },
        });
        reducedInstallments += 1;
      }
      absorbedByReduction = amount;
    } else {
      // Refund exceeds remaining unpaid — zero-out unpaid + reimburse
      // the difference from customer's already-paid amounts.
      for (const inst of unpaid) {
        await this.prisma.installmentSchedule.update({
          where: { id: inst.id },
          data: { status: InstallmentStatus.waived },
        });
      }
      absorbedByReduction = totalUnpaid;
      refundedToCustomer = subtract(amount, totalUnpaid);
    }

    void absorbedByReduction; // tracked above for completeness

    // Net clawback — merchant only received (1 − discountRate) of the amount,
    // so claw back the same net portion (mirrors the full-refund path above).
    const partialDiscountRate = String(tx.merchant?.discountRate ?? '0');
    const partialDiscountFee = bankersRound(multiply(amount, partialDiscountRate), 4);
    const partialNetClawback = subtract(amount, partialDiscountFee);

    return {
      refundedToCustomer: bankersRound(refundedToCustomer, 4),
      clawedBackFromMerchant: bankersRound(partialNetClawback, 4),
      cancelledInstallments: 0,
      reducedInstallments,
    };
  }
}

// Local aliases — Prisma generates these but importing them here would
// pull the runtime types into a service that only needs structural shape.
interface InstallmentRow {
  id: string;
  installmentNumber: number;
  amount: { toString(): string };
  paidAmount: { toString(): string };
  status: InstallmentStatus;
}

interface BnplTxWithInstallments {
  id: string;
  tenantId: string;
  customerId: string;
  merchantId: string;
  purchaseAmount: { toString(): string };
  status: BnplTransactionStatus;
  installments: InstallmentRow[];
  /**
   * Merchant relation needed for net-clawback math on full refunds (FIX 1).
   * The Prisma include (`include: { merchant: true }`) populates this.
   */
  merchant?: { discountRate: { toString(): string } } | null;
}

void toDecimal; // reserved for forthcoming fee-aware refund proration
