import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  ContractStatus,
  InvoiceStatus,
  LoanRequestStatus,
  RecourseType,
  RepaymentMethod,
  type Invoice,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  bankersRound,
  compare,
  divide,
  max as maxStr,
  min as minStr,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { DebtorService } from './debtor.service';
import type {
  GenerateOfferInput,
  InvoiceOffer,
} from './factoring-origination.types';

// ─── Defaults (spec §4.2 / §5.3) ────────────────────────────────────────

/**
 * Sensible defaults applied when `product.factoringConfig` omits a key.
 * Decimal fields are strings to match the rest of the money pipeline.
 */
const DEFAULT_ADVANCE_RATE_PERCENT = '85.00';
const DEFAULT_MIN_ADVANCE_RATE = '60.00';
const DEFAULT_MAX_ADVANCE_RATE = '95.00';
const DEFAULT_DISCOUNT_RATE_ANNUAL = '12.00';
const DEFAULT_SERVICE_FEE_FLAT = '500.00';
const DEFAULT_RECOURSE_TYPE: RecourseType = RecourseType.with_recourse;
/** F-IF-1 (pre-S13): default offer validity window in hours. */
const DEFAULT_OFFER_VALIDITY_HOURS = 48;
const MIN_OFFER_VALIDITY_HOURS = 1;
const MAX_OFFER_VALIDITY_HOURS = 720; // 30 days

const DEFAULT_NON_RECOURSE_ELIGIBILITY = {
  minDebtorRiskScore: 70,
  minDebtorPaymentHistory: 6,
  maxInvoiceTenorDays: 90,
  /** Factor multiplier applied to the discount fee on a non-recourse offer. */
  feeMultiplier: '1.5',
};

/**
 * Statuses we consider "active" for the purposes of disputing — anything
 * past funding but before the invoice has reached a terminal state.
 */
const DISPUTABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.funded,
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
];

/**
 * Statuses that indicate the disbursement step has already been performed
 * (or beyond). Used by the `disburseAdvance` idempotency check so that a
 * retried call after partial success doesn't double-fund.
 */
const POST_FUNDING_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.funded,
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
  InvoiceStatus.reserve_released,
  InvoiceStatus.settled,
  InvoiceStatus.disputed,
  InvoiceStatus.defaulted,
];

// ─── Internals ──────────────────────────────────────────────────────────

interface FactoringConfig {
  advanceRatePercent: string;
  minAdvanceRate: string;
  maxAdvanceRate: string;
  discountRateAnnual: string;
  serviceFeeFlat: string;
  defaultRecourseType: RecourseType;
  /** F-IF-1: how long a generated offer remains acceptable, in hours. */
  offerValidityHours: number;
  nonRecourseEligibility: {
    minDebtorRiskScore: number;
    minDebtorPaymentHistory: number;
    maxInvoiceTenorDays: number;
    feeMultiplier: string;
  };
}

/**
 * F-IF-1 helper: coerce arbitrary JSON config value into a valid hours
 * count, clamped to the supported range. Falls back to the default for
 * missing / invalid input.
 */
function clampOfferValidityHours(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_OFFER_VALIDITY_HOURS;
  return Math.min(MAX_OFFER_VALIDITY_HOURS, Math.max(MIN_OFFER_VALIDITY_HOURS, Math.floor(n)));
}

/** UTC midnight for "today" — used for tenor calculations. */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Whole days between two UTC dates (b - a). Both inputs are normalized to
 * UTC midnight so partial days don't skew the result.
 */
function daysBetweenUtc(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/**
 * Normalize the product's factoringConfig JSON into a typed shape with
 * defaults filled in. Keeps the rest of the service free of `??` chains.
 */
function readFactoringConfig(
  raw: Prisma.JsonValue | null | undefined,
): FactoringConfig {
  const cfg = (raw as Record<string, unknown> | null | undefined) ?? {};
  const elig =
    (cfg.nonRecourseEligibility as Record<string, unknown> | undefined) ?? {};

  return {
    advanceRatePercent:
      (cfg.advanceRatePercent as string | undefined) ??
      DEFAULT_ADVANCE_RATE_PERCENT,
    minAdvanceRate:
      (cfg.minAdvanceRate as string | undefined) ?? DEFAULT_MIN_ADVANCE_RATE,
    maxAdvanceRate:
      (cfg.maxAdvanceRate as string | undefined) ?? DEFAULT_MAX_ADVANCE_RATE,
    discountRateAnnual:
      (cfg.discountRateAnnual as string | undefined) ??
      DEFAULT_DISCOUNT_RATE_ANNUAL,
    serviceFeeFlat:
      (cfg.serviceFeeFlat as string | undefined) ?? DEFAULT_SERVICE_FEE_FLAT,
    defaultRecourseType:
      ((cfg.defaultRecourseType as RecourseType | undefined) ??
        DEFAULT_RECOURSE_TYPE) as RecourseType,
    offerValidityHours: clampOfferValidityHours(cfg.offerValidityHours),
    nonRecourseEligibility: {
      minDebtorRiskScore:
        (elig.minDebtorRiskScore as number | undefined) ??
        DEFAULT_NON_RECOURSE_ELIGIBILITY.minDebtorRiskScore,
      minDebtorPaymentHistory:
        (elig.minDebtorPaymentHistory as number | undefined) ??
        DEFAULT_NON_RECOURSE_ELIGIBILITY.minDebtorPaymentHistory,
      maxInvoiceTenorDays:
        (elig.maxInvoiceTenorDays as number | undefined) ??
        DEFAULT_NON_RECOURSE_ELIGIBILITY.maxInvoiceTenorDays,
      feeMultiplier:
        (elig.feeMultiplier !== undefined
          ? String(elig.feeMultiplier)
          : DEFAULT_NON_RECOURSE_ELIGIBILITY.feeMultiplier),
    },
  };
}

/**
 * Spec §4.2 — debtor risk-score adjustment to the base advance rate.
 * Score is in [0, 100]; higher = better (lower risk).
 */
function debtorRiskAdjustment(internalRiskScore: string | null): string {
  if (!internalRiskScore) return '0';
  const score = String(internalRiskScore);
  if (compare(score, '80') >= 0) return '5';
  if (compare(score, '70') >= 0) return '2';
  if (compare(score, '50') >= 0) return '0';
  if (compare(score, '30') >= 0) return '-5';
  return '-10';
}

/** Spec §4.2 — longer tenors reduce the advance rate. */
function tenorAdjustment(tenorDays: number): string {
  if (tenorDays > 90) return '-2';
  if (tenorDays > 60) return '-1';
  return '0';
}

/** Spec §4.2 — repeat sellers earn higher advance rates. */
function sellerAdjustment(priorSettledCount: number): string {
  if (priorSettledCount >= 10) return '3';
  if (priorSettledCount >= 5) return '2';
  if (priorSettledCount >= 1) return '1';
  return '0';
}

/**
 * Sprint 12 Phase 3C — Invoice Factoring origination state machine.
 *
 * Implements SPEC-invoice-factoring.md §4 Steps 3–9:
 *
 *   verified
 *     → generateOffer        → offer_generated
 *     → acceptOffer          → offer_accepted
 *     → declineOffer         → cancelled
 *     → disburseAdvance      → funded             (creates Contract + ledger)
 *     → notifyDebtor         → debtor_notified
 *   (… debtor pays, reserve released by ReserveService Phase 3D …)
 *     → complete             → settled            (called from ReserveService)
 *     → dispute              → disputed           (from any active state)
 *
 * Method-by-method idempotency: every state transition is keyed on the
 * source status so a replay returns the existing invoice without
 * re-emitting events. The `idempotencyKey` parameter is logged but the
 * status check is the primary gate — the same caller retrying with the
 * same key sees the same row and skips work.
 *
 * Multi-tenancy: every read is scoped via `findFirst` + `tenantId`. No
 * cross-tenant access.
 *
 * Money: all financial math goes through `@lons/common` Decimal helpers.
 * Never `Number()` / `parseFloat()`.
 */
@Injectable()
export class FactoringOriginationService {
  private readonly logger = new Logger('FactoringOriginationService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly debtorService: DebtorService,
  ) {}

  // ─── Step 3: Offer generation ────────────────────────────────────────

  async generateOffer(
    tenantId: string,
    invoiceId: string,
    input: GenerateOfferInput = {},
  ): Promise<InvoiceOffer> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (invoice.status !== InvoiceStatus.verified) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not verified — cannot generate an offer`,
      );
    }

    // Product config drives the rate envelope and fee structure.
    const product = await this.prisma.product.findFirst({
      where: { id: invoice.productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product', invoice.productId);

    // Debtor for the risk-score adjustment + non-recourse eligibility.
    const debtor = await this.debtorService.findById(tenantId, invoice.debtorId);

    const config = readFactoringConfig(product.factoringConfig);

    const faceValue = String(invoice.faceValue);
    const today = startOfTodayUtc();
    const tenorDays = Math.max(0, daysBetweenUtc(today, invoice.dueDate));

    // ── Adjustments per spec §4.2 ──
    const debtorAdj = debtorRiskAdjustment(
      debtor.internalRiskScore !== null && debtor.internalRiskScore !== undefined
        ? String(debtor.internalRiskScore)
        : null,
    );
    const tenorAdj = tenorAdjustment(tenorDays);

    const sellerSettledCount = await this.prisma.invoice.count({
      where: {
        tenantId,
        sellerId: invoice.sellerId,
        status: InvoiceStatus.settled,
      },
    });
    const sellerAdj = sellerAdjustment(sellerSettledCount);

    // baseRate + adjustments, clamped to [min, max].
    let effectiveRate = add(config.advanceRatePercent, debtorAdj);
    effectiveRate = add(effectiveRate, tenorAdj);
    effectiveRate = add(effectiveRate, sellerAdj);
    effectiveRate = maxStr(effectiveRate, config.minAdvanceRate);
    effectiveRate = minStr(effectiveRate, config.maxAdvanceRate);
    // Persisted column is Decimal(5, 2); normalize.
    const advanceRatePercent = bankersRound(effectiveRate, 2);

    // ── Financial terms (all 4 dp Decimal-strings) ──
    const advancedAmount = bankersRound(
      multiply(faceValue, divide(advanceRatePercent, '100')),
      4,
    );
    const reserveAmount = bankersRound(subtract(faceValue, advancedAmount), 4);

    // Discount fee = advancedAmount × annualRate × tenor/365 (pro-rata).
    let discountFee = bankersRound(
      multiply(
        advancedAmount,
        multiply(
          divide(config.discountRateAnnual, '100'),
          divide(String(tenorDays), '365'),
        ),
      ),
      4,
    );
    let serviceFee = bankersRound(config.serviceFeeFlat, 4);

    // ── Non-recourse eligibility (spec §5.3) ──
    let recourseType: RecourseType = config.defaultRecourseType;
    if (input.requestedRecourseType === RecourseType.without_recourse) {
      const debtorScore = debtor.internalRiskScore
        ? String(debtor.internalRiskScore)
        : '0';
      const paidCount = await this.prisma.invoice.count({
        where: {
          tenantId,
          debtorId: invoice.debtorId,
          status: {
            in: [
              InvoiceStatus.payment_received,
              InvoiceStatus.reserve_released,
              InvoiceStatus.settled,
            ],
          },
        },
      });

      const elig = config.nonRecourseEligibility;
      const scoreOk =
        compare(debtorScore, String(elig.minDebtorRiskScore)) >= 0;
      const historyOk = paidCount >= elig.minDebtorPaymentHistory;
      const tenorOk = tenorDays <= elig.maxInvoiceTenorDays;

      if (scoreOk && historyOk && tenorOk) {
        recourseType = RecourseType.without_recourse;
        // Higher fees compensate for absorbed default risk.
        discountFee = bankersRound(
          multiply(discountFee, elig.feeMultiplier),
          4,
        );
      } else {
        this.logger.log(
          `Non-recourse fallback for invoice ${invoiceId}: score=${debtorScore}/${elig.minDebtorRiskScore} ok=${scoreOk}, history=${paidCount}/${elig.minDebtorPaymentHistory} ok=${historyOk}, tenor=${tenorDays}/${elig.maxInvoiceTenorDays} ok=${tenorOk} — issuing with_recourse offer`,
        );
      }
    }

    const netDisbursement = bankersRound(
      subtract(subtract(advancedAmount, discountFee), serviceFee),
      4,
    );

    // F-IF-1: compute offer expiry from product config and persist it on
    // the invoice so acceptOffer can validate, the seller-facing UI/API
    // can display the deadline, and the InvoiceOfferExpiryJob can sweep
    // stale offers.
    const offerValidityMs = config.offerValidityHours * 60 * 60 * 1000;
    const offerExpiresAt = new Date(Date.now() + offerValidityMs);

    // ── Persist the offer terms back onto the Invoice ──
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        advanceRatePercent,
        advancedAmount,
        reserveAmount,
        discountFee,
        serviceFee,
        netDisbursement,
        recourseType,
        offerExpiresAt,
        status: InvoiceStatus.offer_generated,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_OFFER_GENERATED, tenantId, {
      invoiceId,
      advanceRatePercent,
      advancedAmount,
      reserveAmount,
      discountFee,
      serviceFee,
      netDisbursement,
      recourseType,
    });

    this.logger.log(
      `Offer generated for invoice ${invoiceId}: rate=${advanceRatePercent}% advanced=${advancedAmount} net=${netDisbursement} ${invoice.currency} (${recourseType}) expires=${offerExpiresAt.toISOString()}`,
    );

    return {
      invoiceId,
      faceValue,
      advanceRatePercent,
      advancedAmount,
      reserveAmount,
      discountFee,
      serviceFee,
      netDisbursement,
      recourseType,
      dueDate: updated.dueDate.toISOString().slice(0, 10),
      currency: invoice.currency,
      expiresAt: updated.offerExpiresAt!.toISOString(),
    };
  }

  // ─── Step 4: Seller accepts ──────────────────────────────────────────

  async acceptOffer(
    tenantId: string,
    invoiceId: string,
    idempotencyKey: string,
  ): Promise<Invoice> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);

    // Idempotent replay: caller already accepted — return the row, don't
    // re-emit. The status itself is the primary gate.
    if (invoice.status === InvoiceStatus.offer_accepted) {
      this.logger.debug(
        `acceptOffer replay: invoice ${invoiceId} already offer_accepted (key=${idempotencyKey})`,
      );
      return invoice;
    }

    if (invoice.status !== InvoiceStatus.offer_generated) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not offer_generated — cannot accept offer`,
      );
    }

    // F-IF-1: refuse acceptance of stale offers. We auto-cancel here so
    // the invoice transitions out of `offer_generated` and into a
    // terminal state, mirroring what InvoiceOfferExpiryJob would do —
    // the seller must request a fresh offer if they still want financing.
    if (invoice.offerExpiresAt && invoice.offerExpiresAt < new Date()) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.cancelled },
      });
      this.eventBus.emitAndBuild(EventType.INVOICE_CANCELLED, tenantId, {
        invoiceId,
        reason: 'offer_expired',
      });
      this.logger.warn(
        `acceptOffer: invoice ${invoiceId} offer expired at ${invoice.offerExpiresAt.toISOString()} — auto-cancelled`,
      );
      throw new ValidationError(
        `Offer for invoice ${invoiceId} expired at ${invoice.offerExpiresAt.toISOString()} — invoice has been cancelled`,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.offer_accepted },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_OFFER_ACCEPTED, tenantId, {
      invoiceId,
      acceptedBy: invoice.sellerId,
    });
    this.logger.log(
      `Offer accepted for invoice ${invoiceId} (key=${idempotencyKey})`,
    );

    return updated;
  }

  // ─── Step 4 (alt): Seller declines ───────────────────────────────────

  async declineOffer(
    tenantId: string,
    invoiceId: string,
    reason?: string,
  ): Promise<Invoice> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (invoice.status !== InvoiceStatus.offer_generated) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not offer_generated — cannot decline offer`,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.cancelled,
        disputeReason: reason ?? undefined,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_OFFER_DECLINED, tenantId, {
      invoiceId,
      declinedBy: invoice.sellerId,
    });
    this.logger.log(
      `Offer declined for invoice ${invoiceId}${reason ? ` (${reason})` : ''}`,
    );

    return updated;
  }

  // ─── Step 5: Disburse advance ────────────────────────────────────────

  async disburseAdvance(
    tenantId: string,
    invoiceId: string,
    idempotencyKey: string,
  ): Promise<Invoice> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);

    // Idempotent replay: anything in or past `funded` returns the row
    // untouched. The Contract + ledger entries are append-only side
    // effects we cannot re-run safely.
    if (POST_FUNDING_STATUSES.includes(invoice.status)) {
      this.logger.debug(
        `disburseAdvance replay: invoice ${invoiceId} status=${invoice.status} (key=${idempotencyKey})`,
      );
      return invoice;
    }

    if (invoice.status !== InvoiceStatus.offer_accepted) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not offer_accepted — cannot disburse advance`,
      );
    }

    // Validate the offer terms are present (generateOffer should have set
    // them). Defensive — these are required to size the contract.
    const advancedAmount = invoice.advancedAmount
      ? String(invoice.advancedAmount)
      : null;
    const reserveAmount = invoice.reserveAmount
      ? String(invoice.reserveAmount)
      : null;
    const discountFee = invoice.discountFee ? String(invoice.discountFee) : null;
    const serviceFee = invoice.serviceFee ? String(invoice.serviceFee) : null;
    const netDisbursement = invoice.netDisbursement
      ? String(invoice.netDisbursement)
      : null;
    if (
      !advancedAmount ||
      !reserveAmount ||
      !discountFee ||
      !serviceFee ||
      !netDisbursement
    ) {
      throw new ValidationError(
        `Invoice ${invoiceId} is missing offer terms — generateOffer must run before disburseAdvance`,
      );
    }

    const product = await this.prisma.product.findFirst({
      where: { id: invoice.productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product', invoice.productId);
    if (!product.lenderId) {
      throw new ValidationError(
        `Product ${product.id} has no funding lender — cannot disburse advance`,
      );
    }

    const config = readFactoringConfig(product.factoringConfig);
    const faceValue = String(invoice.faceValue);
    const startDate = startOfTodayUtc();
    const tenorDays = Math.max(0, daysBetweenUtc(startDate, invoice.dueDate));
    const totalFees = add(discountFee, serviceFee);

    // ── Create LoanRequest stub + Contract atomically ──
    // Contract.loanRequestId is non-null in the schema; for invoice
    // factoring there's no application flow, so we synthesize a minimal
    // LoanRequest record that ties back to the invoice via metadata.
    // Spec §11 explicitly anticipates this linkage.
    const contractNumber = `IF-${invoiceId.slice(0, 8).toUpperCase()}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const stubLoanRequest = await tx.loanRequest.create({
        data: {
          tenantId,
          customerId: invoice.sellerId,
          productId: invoice.productId,
          requestedAmount: advancedAmount,
          requestedTenor: tenorDays,
          currency: invoice.currency,
          channel: 'invoice_factoring',
          status: LoanRequestStatus.contract_created,
          metadata: {
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            source: 'factoring_origination',
          } as Prisma.InputJsonValue,
        },
      });

      const contract = await tx.contract.create({
        data: {
          tenantId,
          contractNumber,
          principalAmount: advancedAmount,
          interestRate: config.discountRateAnnual,
          interestAmount: discountFee,
          totalFees: serviceFee,
          totalCostCredit: add(advancedAmount, totalFees),
          currency: invoice.currency,
          tenorDays,
          repaymentMethod: RepaymentMethod.lump_sum,
          startDate,
          maturityDate: invoice.dueDate,
          firstPaymentDate: invoice.dueDate,
          outstandingPrincipal: advancedAmount,
          outstandingInterest: discountFee,
          outstandingFees: serviceFee,
          outstandingPenalties: '0',
          totalOutstanding: add(advancedAmount, totalFees),
          totalPaid: '0',
          daysPastDue: 0,
          status: ContractStatus.active,
          classification: 'performing',
          restructured: false,
          restructureCount: 0,
          customer: { connect: { id: invoice.sellerId } },
          product: { connect: { id: invoice.productId } },
          lender: { connect: { id: product.lenderId! } },
          loanRequestId: stubLoanRequest.id,
          metadata: {
            invoiceId,
            recourseType: invoice.recourseType,
          } as Prisma.InputJsonValue,
        },
      });

      // ── Ledger entries (append-only) ──
      // 1) Debit: invoice receivable booked at face value (the amount the
      //    debtor owes us once the invoice matures).
      // 2) Credit: cash paid out to the seller (net of fees).
      // 3) Credit: fee income (discount + service).
      // 4) Adjustment: reserve held back, released on debtor payment.
      // Running balance tracks the contract's total outstanding for
      // downstream aging / reporting.
      const today = startOfTodayUtc();
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: contract.id } },
          entryType: 'disbursement',
          debitCredit: 'debit',
          amount: faceValue,
          currency: invoice.currency,
          runningBalance: faceValue,
          effectiveDate: today,
          valueDate: today,
          description: `Invoice receivable booked: face value ${faceValue} ${invoice.currency}`,
          referenceType: 'invoice',
          referenceId: invoiceId,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: contract.id } },
          entryType: 'disbursement',
          debitCredit: 'credit',
          amount: netDisbursement,
          currency: invoice.currency,
          runningBalance: subtract(faceValue, netDisbursement),
          effectiveDate: today,
          valueDate: today,
          description: `Net advance disbursed to seller: ${netDisbursement} ${invoice.currency}`,
          referenceType: 'invoice',
          referenceId: invoiceId,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: contract.id } },
          entryType: 'fee',
          debitCredit: 'credit',
          amount: totalFees,
          currency: invoice.currency,
          runningBalance: subtract(
            subtract(faceValue, netDisbursement),
            totalFees,
          ),
          effectiveDate: today,
          valueDate: today,
          description: `Fee income (discount ${discountFee} + service ${serviceFee})`,
          referenceType: 'invoice',
          referenceId: invoiceId,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          contract: { connect: { id: contract.id } },
          // Reserve isn't a fee/repayment/etc; we use `adjustment` per the
          // existing LedgerEntryType enum and a clear description so ops
          // can identify it. Released by ReserveService (Phase 3D).
          entryType: 'adjustment',
          debitCredit: 'credit',
          amount: reserveAmount,
          currency: invoice.currency,
          runningBalance: subtract(
            subtract(subtract(faceValue, netDisbursement), totalFees),
            reserveAmount,
          ),
          effectiveDate: today,
          valueDate: today,
          description: `Reserve held: ${reserveAmount} ${invoice.currency} (released on debtor payment)`,
          referenceType: 'invoice',
          referenceId: invoiceId,
        },
      });

      return contract;
    });

    // ── Mock disbursement (real wallet adapter lands in Phase 5) ──
    // TODO(Sprint 12 Phase 5): swap for IntegrationService.transferToWallet
    // with retry/idempotency. For now we just log the intent so the flow is
    // observable end-to-end in dev/CI.
    this.logger.log(
      `Mock disbursement: ${netDisbursement} ${invoice.currency} to customer ${invoice.sellerId}`,
    );

    // ── Update debtor exposure ──
    await this.debtorService.updateExposure(
      tenantId,
      invoice.debtorId,
      faceValue,
      invoiceId,
    );

    // ── Update invoice + emit ──
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        contractId: created.id,
        fundedAt: new Date(),
        status: InvoiceStatus.funded,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_FUNDED, tenantId, {
      invoiceId,
      contractId: created.id,
      advancedAmount,
      reserveAmount,
      netDisbursement,
      currency: invoice.currency,
    });

    this.logger.log(
      `Invoice ${invoiceId} funded — contract ${created.id} (${contractNumber}) opened, ${netDisbursement} ${invoice.currency} disbursed`,
    );

    return updated;
  }

  // ─── Step 6: Notify debtor ───────────────────────────────────────────

  async notifyDebtor(tenantId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (invoice.status !== InvoiceStatus.funded) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not funded — cannot notify debtor`,
      );
    }

    // Throws NotFoundError if the debtor disappeared (shouldn't happen
    // post-funding) — surfaces a recoverable error to ops.
    const debtor = await this.debtorService.findById(tenantId, invoice.debtorId);

    // TODO(Sprint 12 Phase 5+): swap for NotificationService dispatch with
    // template rendering and channel selection per debtor / product. For now
    // we just record the intent so the lifecycle event still fires.
    this.logger.log(
      `Mock debtor notification: invoice ${invoiceId} to debtor ${debtor.contactEmail ?? debtor.id}`,
    );

    const notifiedAt = new Date();
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        debtorNotifiedAt: notifiedAt,
        status: InvoiceStatus.debtor_notified,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_DEBTOR_NOTIFIED, tenantId, {
      invoiceId,
      debtorId: invoice.debtorId,
      notifiedAt: notifiedAt.toISOString(),
      channel: 'email',
    });

    return updated;
  }

  // ─── Step 9: Settlement complete (called by ReserveService) ─────────

  async complete(tenantId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (invoice.status !== InvoiceStatus.reserve_released) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not reserve_released — cannot complete`,
      );
    }

    // Close the contract (if one was opened — defensive: factoring always
    // creates one in `disburseAdvance` but guard for legacy / data-fix paths).
    if (invoice.contractId) {
      await this.prisma.contract.update({
        where: { id: invoice.contractId },
        data: {
          status: ContractStatus.settled,
          settledAt: new Date(),
        },
      });
    }

    // Release the debtor exposure — equal-and-opposite of the funding delta.
    await this.debtorService.updateExposure(
      tenantId,
      invoice.debtorId,
      multiply(String(invoice.faceValue), '-1'),
      invoiceId,
    );

    const settledAt = new Date();
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        settledAt,
        status: InvoiceStatus.settled,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_SETTLED, tenantId, {
      invoiceId,
      contractId: invoice.contractId ?? '',
      settledAt: settledAt.toISOString(),
    });

    this.logger.log(
      `Invoice ${invoiceId} settled (contract ${invoice.contractId ?? 'n/a'})`,
    );

    return updated;
  }

  // ─── Dispute (out-of-band) ───────────────────────────────────────────

  async dispute(
    tenantId: string,
    invoiceId: string,
    reason: string,
    raisedBy: string,
  ): Promise<Invoice> {
    if (!reason?.trim()) {
      throw new ValidationError('reason is required to dispute an invoice');
    }
    const invoice = await this.requireInvoice(tenantId, invoiceId);
    if (!DISPUTABLE_STATUSES.includes(invoice.status)) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status} — only funded / debtor_notified / payment_received invoices can be disputed`,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.disputed,
        disputeReason: reason,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_DISPUTED, tenantId, {
      invoiceId,
      reason,
      raisedBy,
    });

    this.logger.log(
      `Invoice ${invoiceId} disputed by ${raisedBy}: ${reason}`,
    );

    return updated;
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private async requireInvoice(
    tenantId: string,
    invoiceId: string,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    return invoice;
  }
}
