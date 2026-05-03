import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  DebitCredit,
  InvoiceStatus,
  LedgerEntryType,
  RecourseType,
  type Invoice,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  compare,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { DebtorService } from './debtor.service';
import type {
  EnforceDefaultInput,
  EnforceDefaultResult,
  EnforceGracePeriodElapsedResult,
} from './recourse.types';

// ─── Constants ───────────────────────────────────────────────────────────

/** Default grace days for with-recourse enforcement when the product config omits it. */
const DEFAULT_RECOURSE_GRACE_DAYS = 7;

/** Statuses that *cannot* be defaulted — terminal or already-handled. */
const TERMINAL_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.settled,
  InvoiceStatus.cancelled,
];

const MS_PER_DAY = 86_400_000;

/**
 * Sprint 12 Phase 3E — Recourse enforcement & non-recourse write-off.
 *
 * Implements SPEC-invoice-factoring.md §5:
 *   - `enforceDefault` is invoked by the InvoiceAgingService (Phase 6A)
 *     when an unpaid invoice crosses the default DPD threshold. It
 *     emits `INVOICE_DEFAULTED` and then branches:
 *       • with_recourse  → SPEC §5.1 — start a configurable grace
 *         period for the seller, mock the seller notification, stash
 *         the grace deadline on the invoice metadata so a future
 *         scheduler scan can pick it up, and emit
 *         `RECOURSE_ENFORCEMENT_INITIATED`.
 *       • without_recourse → SPEC §5.2 — write off the loss
 *         (`advancedAmount − amountReceived`), return any unreleased
 *         reserve to the seller, decrement debtor exposure, and emit
 *         `NON_RECOURSE_WRITE_OFF`.
 *
 *   - `enforceGracePeriodElapsed` is the future scheduler hook
 *     (Phase 6+). v1 mocks the wallet deduction and routes the case
 *     into the existing CollectionsAction workflow.
 *
 * All money is Decimal-as-string and all math goes through @lons/common
 * helpers. Tenant scoping is enforced on every read.
 */
@Injectable()
export class RecourseService {
  private readonly logger = new Logger('RecourseService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly debtorService: DebtorService,
  ) {}

  // ─── enforceDefault ────────────────────────────────────────────────────

  async enforceDefault(
    tenantId: string,
    invoiceId: string,
    input: EnforceDefaultInput = {},
  ): Promise<EnforceDefaultResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    // Hard-stop: terminal statuses cannot transition to defaulted.
    if (TERMINAL_STATUSES.includes(invoice.status)) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status} and cannot be defaulted`,
      );
    }

    // Idempotency: already-defaulted invoices return their previously
    // recorded outcome without re-emitting events or touching the ledger.
    if (invoice.status === InvoiceStatus.defaulted) {
      return this.buildIdempotentResult(invoice);
    }

    const outstanding = computeOutstanding(invoice);
    const dpd = input.dpd ?? this.computeDpd(invoice.dueDate);

    // Persist the status flip and timestamp BEFORE branching so both
    // paths share the same "this was defaulted at <T>" anchor.
    const now = new Date();
    const defaulted = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.defaulted,
        defaultedAt: now,
      },
    });

    // INVOICE_DEFAULTED is emitted on every first-time default,
    // regardless of recourse path.
    this.eventBus.emitAndBuild(EventType.INVOICE_DEFAULTED, tenantId, {
      invoiceId: defaulted.id,
      dpd,
      recourseType:
        defaulted.recourseType === RecourseType.without_recourse
          ? 'without_recourse'
          : 'with_recourse',
      outstandingAmount: outstanding,
    });

    if (defaulted.recourseType === RecourseType.with_recourse) {
      return this.handleWithRecourse(tenantId, defaulted, outstanding, now);
    }
    return this.handleWithoutRecourse(tenantId, defaulted, outstanding);
  }

  // ─── enforceGracePeriodElapsed ─────────────────────────────────────────

  async enforceGracePeriodElapsed(
    tenantId: string,
    invoiceId: string,
  ): Promise<EnforceGracePeriodElapsedResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const metadata = (invoice.metadata as Record<string, unknown> | null) ?? {};
    const graceEndIso = metadata.recourseGraceEndAt as string | undefined;
    const recourseAmount =
      (metadata.recourseAmount as string | undefined) ??
      computeOutstanding(invoice);

    if (!graceEndIso) {
      throw new ValidationError(
        `Invoice ${invoiceId} has no recourseGraceEndAt — was enforceDefault called for a with-recourse invoice?`,
      );
    }

    const graceEndAt = new Date(graceEndIso);
    if (Number.isNaN(graceEndAt.getTime())) {
      throw new ValidationError(
        `Invoice ${invoiceId} has malformed recourseGraceEndAt (${graceEndIso})`,
      );
    }
    if (Date.now() < graceEndAt.getTime()) {
      throw new ValidationError(
        `Invoice ${invoiceId} grace period has not yet elapsed (ends ${graceEndIso})`,
      );
    }

    // TODO(Sprint 12 Phase 6+): attempt walletAdapter.collect(sellerId,
    // recourseAmount). On insufficient balance, sweep the seller's
    // pending reserves on other invoices. Only fall through to
    // collections if both fail. v1 short-circuits straight to the
    // collections workflow.
    this.logger.warn(
      `Mock wallet deduction skipped for invoice ${invoiceId}; routing to collections (amount=${recourseAmount})`,
    );

    if (!invoice.contractId) {
      // The contract is created at funding (status >= funded), so any
      // invoice that reached default with a recourse grace period must
      // have one. Defensive guard so the CollectionsAction insert
      // doesn't blow up with a confusing FK violation.
      throw new ValidationError(
        `Invoice ${invoiceId} has no contractId; cannot route to collections`,
      );
    }

    await this.prisma.collectionsAction.create({
      data: {
        tenantId,
        actionType: 'factoring_recourse',
        notes: `With-recourse default: collect ${recourseAmount} ${invoice.currency} from seller ${invoice.sellerId}`,
        contract: { connect: { id: invoice.contractId } },
        metadata: {
          invoiceId,
          sellerId: invoice.sellerId,
          recourseAmount,
          category: 'factoring_recourse',
        },
      },
    });

    const now = new Date();
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      recourseEnforced: true,
      recourseEnforcedAt: now.toISOString(),
    };
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { metadata: nextMetadata as Prisma.InputJsonValue },
    });

    return { action: 'collections_routed', amount: recourseAmount };
  }

  // ─── Path A: WITH RECOURSE ─────────────────────────────────────────────

  private async handleWithRecourse(
    tenantId: string,
    invoice: Invoice,
    outstanding: string,
    now: Date,
  ): Promise<EnforceDefaultResult> {
    const graceDays = await this.resolveRecourseGraceDays(tenantId, invoice);
    const graceEndAt = new Date(now.getTime() + graceDays * MS_PER_DAY);
    const graceEndIso = graceEndAt.toISOString();

    // Mock seller notification (v1) — Phase 5 will wire the real
    // notification dispatch (email/SMS via NotificationService).
    this.logger.log(
      `Mock recourse notification to seller ${invoice.sellerId}: ` +
        `invoice ${invoice.id} defaulted, you must repay ${outstanding} ${invoice.currency} by ${graceEndIso}`,
    );

    // Stash the grace deadline + recourse amount on the invoice so a
    // future scheduler can pick it up and call
    // `enforceGracePeriodElapsed`. The existing metadata is merged so
    // we don't clobber prior keys (documents, audit hints, etc.).
    const existingMetadata =
      (invoice.metadata as Record<string, unknown> | null) ?? {};
    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      recourseGraceEndAt: graceEndIso,
      recourseAmount: outstanding,
    };
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { metadata: nextMetadata as Prisma.InputJsonValue },
    });

    // TODO(Sprint 12 Phase 6+): schedule BullMQ delayed deduction at
    // ${graceEndIso}. v1 leaves this to the periodic scheduler scan.
    this.logger.log(
      `TODO(Sprint 12 Phase 6+): schedule BullMQ delayed deduction at ${graceEndIso}`,
    );

    this.eventBus.emitAndBuild(
      EventType.RECOURSE_ENFORCEMENT_INITIATED,
      tenantId,
      {
        invoiceId: invoice.id,
        sellerId: invoice.sellerId,
        amountToRecover: outstanding,
        graceEndAt: graceEndIso,
      },
    );

    return {
      recourseType: 'with_recourse',
      action: 'grace_period_started',
      graceEndAt: graceEndIso,
      amountToRecover: outstanding,
    };
  }

  // ─── Path B: WITHOUT RECOURSE ──────────────────────────────────────────

  private async handleWithoutRecourse(
    tenantId: string,
    invoice: Invoice,
    outstanding: string,
  ): Promise<EnforceDefaultResult> {
    // Loss = what we advanced minus what the debtor managed to pay.
    // Floored at 0: if the debtor already paid back >= advance there's
    // nothing to write off (we still emit the event for audit, but
    // skip the ledger entries).
    const advancedAmount = String(invoice.advancedAmount ?? '0');
    const amountReceived = String(invoice.amountReceived ?? '0');
    const rawLoss = subtract(advancedAmount, amountReceived);
    const loss = compare(rawLoss, '0') > 0 ? rawLoss : '0';

    if (compare(loss, '0') <= 0) {
      this.logger.warn(
        `Invoice ${invoice.id} non-recourse default with loss <= 0 ` +
          `(advanced=${advancedAmount}, received=${amountReceived}); ` +
          `proceeding without write-off ledger entries`,
      );
    } else if (!invoice.contractId) {
      // Without a contract there's no ledger to post against. The
      // contract is created at funding, so a defaulted invoice should
      // always have one — guard rail for catastrophically bad input.
      throw new ValidationError(
        `Invoice ${invoice.id} has no contractId; cannot post write-off ledger entries`,
      );
    } else {
      const today = new Date();
      const refMetadata = { invoiceId: invoice.id };

      // Append-only double-entry: debit write-off (loss recognized),
      // credit write-off (receivable removed). Both anchor on the
      // contract so the running balance maths stay coherent with the
      // existing settlement-service ledger conventions.
      await this.prisma.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: invoice.contractId } },
          entryType: LedgerEntryType.write_off,
          debitCredit: DebitCredit.debit,
          amount: new Prisma.Decimal(loss),
          currency: invoice.currency,
          // We don't compute a fresh running balance here (that's the
          // settlement-service's job); store the loss as the snapshot.
          runningBalance: new Prisma.Decimal(loss),
          effectiveDate: today,
          valueDate: today,
          description: 'Bad debt — non-recourse default',
          referenceType: 'invoice',
          referenceId: invoice.id,
          // metadata isn't a column on LedgerEntry — store the invoice
          // ref via referenceId/referenceType only.
        },
      });
      await this.prisma.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: invoice.contractId } },
          entryType: LedgerEntryType.write_off,
          debitCredit: DebitCredit.credit,
          amount: new Prisma.Decimal(loss),
          currency: invoice.currency,
          runningBalance: new Prisma.Decimal(loss),
          effectiveDate: today,
          valueDate: today,
          description: 'Bad debt — non-recourse default',
          referenceType: 'invoice',
          referenceId: invoice.id,
        },
      });
      // Suppress unused-var warning — refMetadata is documentation
      // for future contributors, not a runtime value (no metadata
      // column on LedgerEntry).
      void refMetadata;
    }

    // Reserve release: anything the platform was still holding goes
    // back to the seller (non-recourse means we don't get to keep
    // collateral after eating the loss).
    const reserveAmount = String(invoice.reserveAmount ?? '0');
    const reserveReleased = String(invoice.reserveReleased ?? '0');
    const unreleasedReserve = subtract(reserveAmount, reserveReleased);
    let returnedReserve = '0';
    if (compare(unreleasedReserve, '0') > 0) {
      returnedReserve = unreleasedReserve;
      // TODO(Sprint 12 Phase 6+): wire the wallet adapter. For now
      // we just bump the cumulative `reserveReleased` on the invoice
      // so the books reflect the return.
      this.logger.log(
        `Mock reserve return to seller ${invoice.sellerId}: ${unreleasedReserve} ${invoice.currency}`,
      );
      const newReleased = add(reserveReleased, unreleasedReserve);
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { reserveReleased: new Prisma.Decimal(newReleased) },
      });
    }

    // Removing the receivable removes the debtor exposure: we'll
    // never collect, so `faceValue` should come off the running total.
    await this.debtorService.updateExposure(
      tenantId,
      invoice.debtorId,
      multiply(String(invoice.faceValue), '-1'),
      invoice.id,
    );

    this.eventBus.emitAndBuild(
      EventType.NON_RECOURSE_WRITE_OFF,
      tenantId,
      {
        invoiceId: invoice.id,
        lossAmount: loss,
        reserveReturnedToSeller: returnedReserve,
      },
    );

    // Mark `outstanding` as touched — we read it on entry but for
    // non-recourse the loss math drives the result, not face-minus-paid.
    void outstanding;

    return {
      recourseType: 'without_recourse',
      action: 'written_off',
      lossAmount: loss,
      reserveReturnedToSeller: returnedReserve,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** Idempotent replay of a previously enforced default. */
  private buildIdempotentResult(invoice: Invoice): EnforceDefaultResult {
    const outstanding = computeOutstanding(invoice);
    const metadata = (invoice.metadata as Record<string, unknown> | null) ?? {};

    if (invoice.recourseType === RecourseType.without_recourse) {
      const advancedAmount = String(invoice.advancedAmount ?? '0');
      const amountReceived = String(invoice.amountReceived ?? '0');
      const rawLoss = subtract(advancedAmount, amountReceived);
      const loss = compare(rawLoss, '0') > 0 ? rawLoss : '0';
      const reserveAmount = String(invoice.reserveAmount ?? '0');
      const reserveReleased = String(invoice.reserveReleased ?? '0');
      const unreleased = subtract(reserveAmount, reserveReleased);
      const returnedReserve = compare(unreleased, '0') > 0 ? unreleased : '0';
      return {
        recourseType: 'without_recourse',
        action: 'already_defaulted',
        lossAmount: loss,
        reserveReturnedToSeller: returnedReserve,
      };
    }

    // with_recourse — surface the previously stored grace deadline
    // when present, otherwise echo the current timestamp so callers
    // get a well-formed shape.
    const graceEndAt =
      (metadata.recourseGraceEndAt as string | undefined) ??
      (invoice.defaultedAt
        ? invoice.defaultedAt.toISOString()
        : new Date().toISOString());
    const amountToRecover =
      (metadata.recourseAmount as string | undefined) ?? outstanding;
    return {
      recourseType: 'with_recourse',
      action: 'already_defaulted',
      graceEndAt,
      amountToRecover,
    };
  }

  /**
   * Pull `recourseGracePeriodDays` off the invoice's product config.
   * Falls back to `DEFAULT_RECOURSE_GRACE_DAYS` (7) when the product
   * doesn't exist, has no factoringConfig, or omits the field.
   */
  private async resolveRecourseGraceDays(
    tenantId: string,
    invoice: Invoice,
  ): Promise<number> {
    const product = await this.prisma.product.findFirst({
      where: { id: invoice.productId, tenantId },
      select: { factoringConfig: true },
    });
    const config = (product?.factoringConfig as Record<string, unknown> | null) ?? null;
    if (config && typeof config === 'object') {
      const raw = config.recourseGracePeriodDays;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return Math.floor(raw);
      }
    }
    return DEFAULT_RECOURSE_GRACE_DAYS;
  }

  /** UTC-midnight days between today and the invoice due date. */
  private computeDpd(dueDate: Date): number {
    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const dueUtc = Date.UTC(
      dueDate.getUTCFullYear(),
      dueDate.getUTCMonth(),
      dueDate.getUTCDate(),
    );
    const diff = Math.round((todayUtc - dueUtc) / MS_PER_DAY);
    return diff > 0 ? diff : 0;
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────

/**
 * Outstanding face-value = `faceValue − amountReceived`, floored at 0.
 * Decimal-string math throughout.
 */
function computeOutstanding(invoice: Invoice): string {
  const face = String(invoice.faceValue);
  const received = String(invoice.amountReceived ?? '0');
  const raw = subtract(face, received);
  return compare(raw, '0') > 0 ? raw : '0';
}

