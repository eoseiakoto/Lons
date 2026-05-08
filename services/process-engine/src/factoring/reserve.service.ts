import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  DebitCredit,
  InvoiceStatus,
  LedgerEntryType,
  type Invoice,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  compare,
  isPositive,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { DebtorService } from './debtor.service';
import { FactoringOriginationService } from './factoring-origination.service';
import type {
  RecordDebtorPaymentInput,
  ReleaseReserveInput,
} from './reserve.types';

// Defaults per SPEC-invoice-factoring.md §6.3 when product config is missing.
const DEFAULT_AUTO_RESERVE_RELEASE = true;
const DEFAULT_MANUAL_RELEASE_ABOVE = '200000.00';

/**
 * Sprint 12 Phase 3D — Reserve mechanics + debtor payment recording.
 *
 * Implements SPEC-invoice-factoring.md §6 (Reserve Mechanics) and the
 * inbound-payment flow (DEV-SPRINT-12 §3D, Steps 7–8):
 *
 *   - `recordDebtorPayment`  — accumulate debtor payments against an invoice,
 *     transitioning to `payment_received` on full settlement and emitting
 *     `INVOICE_PAYMENT_RECEIVED` / `INVOICE_PAYMENT_PARTIAL` accordingly.
 *   - `releaseReserve`       — release the held-back reserve to the seller
 *     once the debtor has paid in full (or surplus past advance + fees on a
 *     partial release), respecting auto vs. manual-approval routing.
 *
 * Money math goes exclusively through `@lons/common` Decimal helpers. All
 * queries are tenant-scoped via `findFirst` + `tenantId`.
 *
 * Phase 3C integration note: when an invoice is fully released
 * (`reserveReleased >= reserveAmount`) the lifecycle layer should call
 * `factoringOriginationService.complete(tenantId, invoiceId)`. This service
 * does NOT inject `FactoringOriginationService` to avoid a circular DI graph
 * while Phase 3C is in flight — the integration coordinator wires the call.
 */
@Injectable()
export class ReserveService {
  private readonly logger = new Logger('ReserveService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly debtorService: DebtorService,
    private readonly originationService: FactoringOriginationService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Step 7: Record a debtor payment against an invoice. Supports partial
   * payments (multiple calls accumulate via `amountReceived`).
   *
   * Idempotency note (v1): we track the most recent payment idempotency key
   * on `invoice.metadata.lastPaymentIdempotencyKey`. Replays with the same
   * key return the invoice unchanged. LIMITATION: only the most recent key
   * is remembered, so two distinct concurrent payments racing on the same
   * key would resolve as the second was-applied wins. A dedicated
   * `idempotency_keys` table would harden this — Phase 5 work.
   */
  async recordDebtorPayment(
    tenantId: string,
    invoiceId: string,
    input: RecordDebtorPaymentInput,
  ): Promise<Invoice> {
    // 1) Field-level validation up front so we don't even hit the DB on
    //    obviously malformed input.
    if (!isPositive(input.amountReceived)) {
      throw new ValidationError(
        `amountReceived must be positive (got ${input.amountReceived})`,
      );
    }
    if (!input.paymentRef?.trim()) {
      throw new ValidationError('paymentRef is required');
    }
    if (!input.idempotencyKey?.trim()) {
      throw new ValidationError('idempotencyKey is required');
    }

    // 2) Tenant-scoped fetch.
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    // 3) Idempotency replay — same key, return the invoice as-is.
    const existingKey = readMetadataKey(
      invoice.metadata,
      'lastPaymentIdempotencyKey',
    );
    if (existingKey && existingKey === input.idempotencyKey) {
      this.logger.log(
        `recordDebtorPayment idempotency hit: invoice ${invoiceId} key ${input.idempotencyKey}`,
      );
      return invoice;
    }

    // 4) Status guard. Partial-paid invoices stay in `debtor_notified` and
    //    accumulate via `amountReceived`; further top-ups arrive while still
    //    in `debtor_notified`. Once status moves to `payment_received` the
    //    debtor side is closed and any further "payment" should be a
    //    manual reversal/adjustment, not a fresh top-up.
    if (
      invoice.status !== InvoiceStatus.debtor_notified &&
      invoice.status !== InvoiceStatus.payment_received
    ) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}; debtor payment can only be recorded while debtor_notified or payment_received`,
      );
    }

    // 5) Compute new running total.
    const previousReceived = invoice.amountReceived
      ? String(invoice.amountReceived)
      : '0';
    const newAmountReceived = add(previousReceived, input.amountReceived);
    const faceValue = String(invoice.faceValue);
    const fullyPaid = compare(newAmountReceived, faceValue) >= 0;

    // S13-2: stamp the actual payment date on the FIRST payment event so
    // debtor.service.assessRisk can compute payment-delay accurately
    // instead of leaning on `updatedAt` (which advances on any mutation).
    // Subsequent partial payments leave debtorPaidAt unchanged — it
    // marks when the debtor first started paying, not the final payment.
    const isFirstPayment = compare(previousReceived, '0') === 0;

    // 6) Append-only ledger entry. The repayment-service convention (see
    //    services/repayment-service/src/payment/payment.service.ts) is
    //    `entryType: repayment, debitCredit: credit` with the running
    //    balance carried in `runningBalance`. We use the new outstanding
    //    on the invoice (faceValue - newAmountReceived, floored at 0) as
    //    the running balance for traceability.
    if (!invoice.contractId) {
      // Defensive: every invoice that's been notified has been funded and
      // therefore has a contract attached. Surface this as a clear error
      // rather than blow up on the FK.
      throw new ValidationError(
        `Invoice ${invoiceId} has no contract; cannot record debtor payment`,
      );
    }
    const outstanding = fullyPaid
      ? '0'
      : subtract(faceValue, newAmountReceived);
    const now = new Date();
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        contractId: invoice.contractId,
        entryType: LedgerEntryType.repayment,
        debitCredit: DebitCredit.credit,
        amount: input.amountReceived,
        currency: invoice.currency,
        runningBalance: outstanding,
        effectiveDate: now,
        valueDate: now,
        description: `Debtor payment ${input.paymentRef} on invoice ${invoice.invoiceNumber}`,
        referenceType: 'invoice_payment',
        referenceId: invoice.id,
      },
    });

    // 7) Persist the new totals + status. Carry the idempotency key on
    //    metadata so a same-key replay short-circuits next time.
    const updatedMetadata = mergeMetadata(invoice.metadata, {
      lastPaymentIdempotencyKey: input.idempotencyKey,
      lastPaymentRef: input.paymentRef,
      lastPaymentOperatorId: input.operatorId,
      lastPaymentRecordedAt: now.toISOString(),
    });
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountReceived: newAmountReceived,
        debtorPaymentRef: input.paymentRef,
        ...(isFirstPayment ? { debtorPaidAt: now } : {}),
        ...(fullyPaid
          ? { status: InvoiceStatus.payment_received }
          : {}),
        metadata: updatedMetadata,
      },
    });

    // 8) Emit lifecycle event.
    if (fullyPaid) {
      this.eventBus.emitAndBuild(
        EventType.INVOICE_PAYMENT_RECEIVED,
        tenantId,
        {
          invoiceId: updated.id,
          amountReceived: input.amountReceived,
          paymentRef: input.paymentRef,
          totalReceivedToDate: newAmountReceived,
          isPartial: false,
        },
      );
      this.logger.log(
        `Invoice ${invoiceId} fully paid (${newAmountReceived} ${invoice.currency}); status → payment_received`,
      );
    } else {
      this.eventBus.emitAndBuild(
        EventType.INVOICE_PAYMENT_PARTIAL,
        tenantId,
        {
          invoiceId: updated.id,
          amountReceived: input.amountReceived,
          paymentRef: input.paymentRef,
          totalReceivedToDate: newAmountReceived,
          remainingFaceValue: subtract(faceValue, newAmountReceived),
          isPartial: true,
        },
      );
      this.logger.log(
        `Invoice ${invoiceId} partial payment (${newAmountReceived}/${faceValue} ${invoice.currency}); status stays debtor_notified`,
      );
    }

    // 9) Trigger debtor risk reassessment. This is best-effort — a failure
    //    here must not roll back the (committed) payment.
    try {
      await this.debtorService.assessRisk(tenantId, invoice.debtorId);
    } catch (err) {
      this.logger.warn(
        `Debtor risk reassessment failed for ${invoice.debtorId} after invoice ${invoiceId} payment: ${
          (err as Error).message
        }`,
      );
    }

    return updated;
  }

  /**
   * Step 8: Release the held-back reserve to the seller. Spec §6.
   *
   * Branches:
   *   - Standard (full debtor payment): release the full unreleased
   *     `reserveAmount` portion.
   *   - Shortfall (debtor underpaid): release only the surplus past
   *     advance + fees. If the debtor's payment didn't even cover
   *     advance + fees, throw — there is no surplus to release.
   *
   * Auto vs manual:
   *   - `autoReserveRelease=true` AND `faceValue < manualReleaseAbove`
   *     → auto-release allowed.
   *   - Otherwise → operator approval required (`input.operatorId` must
   *     be set).
   */
  async releaseReserve(
    tenantId: string,
    invoiceId: string,
    input: ReleaseReserveInput,
  ): Promise<Invoice> {
    if (!input.idempotencyKey?.trim()) {
      throw new ValidationError('idempotencyKey is required');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { product: true },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    // Disputes must clear before any reserve money moves.
    if (invoice.status === InvoiceStatus.disputed) {
      throw new ValidationError(
        `Invoice ${invoiceId} is disputed; clear the dispute before releasing reserve`,
      );
    }

    // Idempotency: if we've already released the full reserve, replay
    // returns the invoice unchanged. Cheap and matches intent.
    const reserveAmount = invoice.reserveAmount
      ? String(invoice.reserveAmount)
      : '0';
    const reserveReleased = invoice.reserveReleased
      ? String(invoice.reserveReleased)
      : '0';
    if (
      invoice.status === InvoiceStatus.reserve_released &&
      compare(reserveReleased, reserveAmount) >= 0
    ) {
      this.logger.log(
        `releaseReserve idempotency hit: invoice ${invoiceId} already fully released (${reserveReleased}/${reserveAmount})`,
      );
      return invoice;
    }

    // Status guard. The release path requires the debtor side to be
    // closed — i.e. status `payment_received`. Any other status (besides
    // the idempotent `reserve_released` we already returned) is a bug.
    if (invoice.status !== InvoiceStatus.payment_received) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}; reserve can only be released from payment_received`,
      );
    }

    // ── Routing decision (auto vs manual approval) ──
    const factoringConfig =
      (invoice.product?.factoringConfig as Record<string, unknown> | null) ??
      {};
    const autoReserveRelease =
      typeof factoringConfig.autoReserveRelease === 'boolean'
        ? (factoringConfig.autoReserveRelease as boolean)
        : DEFAULT_AUTO_RESERVE_RELEASE;
    const manualReleaseAbove =
      (factoringConfig.manualReleaseAbove as string | undefined) ??
      DEFAULT_MANUAL_RELEASE_ABOVE;
    const faceValue = String(invoice.faceValue);

    const autoAllowed =
      autoReserveRelease && compare(faceValue, manualReleaseAbove) < 0;
    if (!autoAllowed && !input.operatorId) {
      throw new ValidationError(
        `Reserve release for invoice ${invoiceId} requires operator approval (faceValue ${faceValue} ${invoice.currency} >= manualReleaseAbove ${manualReleaseAbove})`,
      );
    }

    // ── Compute release amount (spec §6.1, §6.2) ──
    const amountReceived = invoice.amountReceived
      ? String(invoice.amountReceived)
      : '0';
    const advancedAmount = invoice.advancedAmount
      ? String(invoice.advancedAmount)
      : '0';
    const discountFee = invoice.discountFee ? String(invoice.discountFee) : '0';
    const serviceFee = invoice.serviceFee ? String(invoice.serviceFee) : '0';
    const feesTotal = add(discountFee, serviceFee);
    const advanceAndFees = add(advancedAmount, feesTotal);

    let releaseAmount: string;
    if (compare(amountReceived, faceValue) >= 0) {
      // Standard / full payment case — release the unreleased portion of
      // the held reserve. Defensive: if reserveReleased > 0 already, only
      // release the delta.
      releaseAmount = subtract(reserveAmount, reserveReleased);
      if (compare(releaseAmount, '0') <= 0) {
        // Nothing left to release. Treat as idempotent success.
        this.logger.log(
          `releaseReserve: invoice ${invoiceId} has no remaining reserve (${reserveReleased}/${reserveAmount}); no-op`,
        );
        return invoice;
      }
    } else {
      // Shortfall case (defensive — status guard above should keep us out
      // of here, but if we ever land here from a future code path we must
      // still honour the §6.2 math).
      if (compare(amountReceived, advanceAndFees) <= 0) {
        throw new ValidationError(
          `Insufficient debtor payment for reserve release: amountReceived ${amountReceived} <= advancedAmount + fees ${advanceAndFees}`,
        );
      }
      const surplus = subtract(amountReceived, advanceAndFees);
      // Cap to whatever reserve is still held back.
      const remainingReserve = subtract(reserveAmount, reserveReleased);
      releaseAmount =
        compare(surplus, remainingReserve) > 0 ? remainingReserve : surplus;
    }

    // ── Mock seller wallet disbursement (v1) ──
    // Real adapter integration is Phase 5. We log the intent + amount so
    // the audit trail is complete.
    this.logger.log(
      `Mock reserve release: ${releaseAmount} ${invoice.currency} to customer ${invoice.sellerId} (invoice ${invoiceId})`,
    );

    // ── Append-only ledger entries ──
    if (!invoice.contractId) {
      throw new ValidationError(
        `Invoice ${invoiceId} has no contract; cannot release reserve`,
      );
    }
    const now = new Date();
    const newReserveReleased = add(reserveReleased, releaseAmount);
    const remainingHeld = subtract(reserveAmount, newReserveReleased);

    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        contractId: invoice.contractId,
        entryType: LedgerEntryType.adjustment,
        debitCredit: DebitCredit.debit,
        amount: releaseAmount,
        currency: invoice.currency,
        runningBalance: remainingHeld,
        effectiveDate: now,
        valueDate: now,
        description: `Reserve release (debit reserve held) for invoice ${invoice.invoiceNumber}`,
        referenceType: 'reserve_release',
        referenceId: invoice.id,
      },
    });
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        contractId: invoice.contractId,
        entryType: LedgerEntryType.disbursement,
        debitCredit: DebitCredit.credit,
        amount: releaseAmount,
        currency: invoice.currency,
        runningBalance: remainingHeld,
        effectiveDate: now,
        valueDate: now,
        description: `Reserve release (credit seller) for invoice ${invoice.invoiceNumber}`,
        referenceType: 'reserve_release',
        referenceId: invoice.id,
      },
    });

    // ── Persist invoice update ──
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        reserveReleased: newReserveReleased,
        status: InvoiceStatus.reserve_released,
      },
    });

    // ── Emit event ──
    this.eventBus.emitAndBuild(EventType.INVOICE_RESERVE_RELEASED, tenantId, {
      invoiceId: updated.id,
      releasedAmount: releaseAmount,
      totalReleased: newReserveReleased,
      releasedBy: input.operatorId,
    });

    // Phase 3C integration: when fully released (reserveReleased >= reserveAmount),
    // drive the reserve_released → settled transition via the origination service.
    // Called as a side effect so this method's return shape stays stable
    // (`reserve_released`); origination.complete drives the further transition
    // to `settled` and is observable via INVOICE_SETTLED. Failure here does
    // NOT roll back the reserve release (which has been ledger-recorded above
    // and is the source of truth for the seller's payout) — operators can
    // re-drive the settled transition from the admin portal.
    if (compare(newReserveReleased, reserveAmount) >= 0) {
      try {
        await this.originationService.complete(tenantId, invoiceId);
      } catch (err) {
        this.logger.error(
          `Reserve fully released for invoice ${invoiceId} but origination.complete failed: ${(err as Error).message}. Operator must drive the settled transition manually.`,
        );
      }
    }

    return updated;
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────

/** Read a string field from a Prisma JSON column without coercing. */
function readMetadataKey(
  metadata: Prisma.JsonValue | null,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Merge a patch object into the existing JSON metadata column. Preserves
 * unrelated keys; converts null/array shapes to {} so we never widen into
 * an unsafe state.
 */
function mergeMetadata(
  existing: Prisma.JsonValue | null,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    base[k] = v;
  }
  return base as Prisma.InputJsonValue;
}
