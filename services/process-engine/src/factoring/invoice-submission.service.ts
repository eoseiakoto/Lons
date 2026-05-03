import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  CustomerStatus,
  ProductType,
  ProductStatus,
  DebtorStatus,
  InvoiceStatus,
  VerificationStatus,
  RecourseType,
  type Invoice,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  compare,
  isPositive,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { ConcentrationLimitService } from './concentration-limit.service';
import type {
  ConcentrationCheckResult,
  SubmitInvoiceInput,
} from './invoice-submission.types';

// Defaults per SPEC-invoice-factoring.md §3.3 when product config is missing.
const DEFAULT_AUTO_VERIFY_BELOW = '50000.00';
const DEFAULT_MANUAL_VERIFY_ABOVE = '200000.00';

/**
 * Verification-routing decision derived from product config + invoice context.
 * Drives both the persisted Invoice fields and which downstream events fire.
 */
type VerificationRoute =
  | { kind: 'WAIVED' }
  | { kind: 'AUTOMATED' }
  | {
      kind: 'MANUAL';
      reason:
        | 'manual_amount_threshold'
        | 'new_seller'
        | 'new_debtor'
        | 'risk_flag';
    };

/**
 * Sprint 12 Phase 3B — Invoice submission + verification flow.
 *
 * Implements SPEC-invoice-factoring.md §4 Steps 1–2:
 *   1. Idempotency check on (tenantId, idempotencyKey).
 *   2. Validate seller / product / debtor.
 *   3. Validate invoice fields (face value, dates, no duplicate).
 *   4. Concentration limit check (stubbed — Phase 3F replaces).
 *   5. Determine verification level from product.factoringConfig.
 *   6. Persist Invoice with the resulting status / verificationStatus.
 *   7. Emit INVOICE_SUBMITTED + (INVOICE_VERIFIED | INVOICE_UNDER_REVIEW).
 *
 * `resolveVerification` handles the operator-driven manual approval / rejection
 * for invoices that landed in the under_review queue.
 */
@Injectable()
export class InvoiceSubmissionService {
  private readonly logger = new Logger('InvoiceSubmissionService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly concentrationService: ConcentrationLimitService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────

  async submit(tenantId: string, input: SubmitInvoiceInput): Promise<Invoice> {
    // 1) Idempotency — repeated submissions with the same key return the
    // already-persisted invoice without re-executing any side effects.
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      this.logger.log(
        `Idempotency hit: returning existing invoice ${existing.id} for key ${input.idempotencyKey}`,
      );
      return existing;
    }

    // 2) Field-level validation — fail fast before touching DB joins.
    if (!isPositive(input.faceValue)) {
      throw new ValidationError(
        `faceValue must be positive (got ${input.faceValue})`,
      );
    }
    const issueDate = parseCalendarDate(input.issueDate, 'issueDate');
    const dueDate = parseCalendarDate(input.dueDate, 'dueDate');
    const today = startOfTodayUtc();
    if (issueDate.getTime() > today.getTime()) {
      throw new ValidationError(
        `issueDate (${input.issueDate}) cannot be in the future`,
      );
    }
    if (dueDate.getTime() <= today.getTime()) {
      throw new ValidationError(
        `dueDate (${input.dueDate}) must be strictly after today`,
      );
    }

    // 3) Seller — must be an active (non-blacklisted, non-deleted) customer.
    const seller = await this.prisma.customer.findFirst({
      where: {
        id: input.sellerId,
        tenantId,
        deletedAt: null,
      },
    });
    if (!seller) throw new NotFoundError('Customer', input.sellerId);
    if (seller.status === CustomerStatus.blacklisted) {
      throw new ValidationError(
        `Seller ${input.sellerId} is blacklisted and cannot factor invoices`,
      );
    }

    // 4) Product — must be an active invoice_financing product.
    const product = await this.prisma.product.findFirst({
      where: {
        id: input.productId,
        tenantId,
        deletedAt: null,
        type: ProductType.invoice_financing,
        status: ProductStatus.active,
      },
    });
    if (!product) {
      throw new ValidationError(
        `Product ${input.productId} is not an active invoice_financing product`,
      );
    }

    // 5) Debtor — must exist and not be suspended/blacklisted.
    // NB: Phase 3A's DebtorService is intentionally NOT imported here
    // (cross-agent file conflict). We hit prisma.debtor directly.
    const debtor = await this.prisma.debtor.findFirst({
      where: {
        id: input.debtorId,
        tenantId,
        deletedAt: null,
      },
    });
    if (!debtor) throw new NotFoundError('Debtor', input.debtorId);
    if (
      debtor.status === DebtorStatus.suspended ||
      debtor.status === DebtorStatus.blacklisted
    ) {
      throw new ValidationError(
        `Debtor ${input.debtorId} is ${debtor.status} and cannot back new invoices`,
      );
    }

    // 6) Product min/max face-value bounds.
    if (product.minAmount && compare(input.faceValue, String(product.minAmount)) < 0) {
      throw new ValidationError(
        `faceValue ${input.faceValue} is below product minimum ${product.minAmount}`,
      );
    }
    if (product.maxAmount && compare(input.faceValue, String(product.maxAmount)) > 0) {
      throw new ValidationError(
        `faceValue ${input.faceValue} exceeds product maximum ${product.maxAmount}`,
      );
    }

    // 7) Pre-check the (tenantId, sellerId, invoiceNumber) uniqueness so we
    // can return a friendlier error than the raw DB constraint violation.
    const dup = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        sellerId: input.sellerId,
        invoiceNumber: input.invoiceNumber,
      },
      select: { id: true },
    });
    if (dup) {
      throw new ValidationError(
        `Invoice ${input.invoiceNumber} has already been submitted by seller ${input.sellerId}`,
      );
    }

    // 8) Concentration limits — Phase 3F. Delegates to ConcentrationLimitService
    // which evaluates debtor / industry / seller-debtor caps and emits
    // CONCENTRATION_LIMIT_WARNING / CONCENTRATION_LIMIT_BREACHED events.
    const concentration = await this.checkConcentration(
      tenantId,
      input.debtorId,
      input.sellerId,
      input.faceValue,
      input.productId,
    );
    if (!concentration.passed) {
      throw new ValidationError(
        `Concentration limit breached: ${concentration.violations
          .map((v) => v.message)
          .join('; ')}`,
      );
    }

    // 9) Determine verification routing from product config + history.
    const route = await this.determineVerificationRoute(
      tenantId,
      product.factoringConfig,
      input,
    );

    const { invoiceStatus, verificationStatus, verifiedAt } = applyRoute(route);

    // 10) Persist. advanceRatePercent is a placeholder (0) — Phase 3C's
    // origination engine fills it in when the offer is generated.
    const created = await this.prisma.invoice.create({
      data: {
        tenantId,
        sellerId: input.sellerId,
        debtorId: input.debtorId,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
        invoiceNumber: input.invoiceNumber,
        issueDate,
        dueDate,
        faceValue: input.faceValue,
        currency: input.currency,
        advanceRatePercent: '0',
        status: invoiceStatus,
        verificationStatus,
        verifiedAt,
        recourseType: input.recourseType ?? RecourseType.with_recourse,
        documents: input.documents,
        metadata: input.metadata,
      },
    });

    // 11) Emit events — INVOICE_SUBMITTED always, plus either VERIFIED or
    // UNDER_REVIEW depending on the route.
    this.eventBus.emitAndBuild(EventType.INVOICE_SUBMITTED, tenantId, {
      invoiceId: created.id,
      sellerId: created.sellerId,
      debtorId: created.debtorId,
      productId: created.productId,
      invoiceNumber: created.invoiceNumber,
      faceValue: String(created.faceValue),
      currency: created.currency,
      issueDate: created.issueDate.toISOString(),
      dueDate: created.dueDate.toISOString(),
    });

    if (route.kind === 'MANUAL') {
      this.eventBus.emitAndBuild(EventType.INVOICE_UNDER_REVIEW, tenantId, {
        invoiceId: created.id,
        sellerId: created.sellerId,
        debtorId: created.debtorId,
        reason: route.reason,
      });
      this.logger.log(
        `Invoice ${created.id} routed to manual review (${route.reason})`,
      );
    } else {
      this.eventBus.emitAndBuild(EventType.INVOICE_VERIFIED, tenantId, {
        invoiceId: created.id,
        verificationStatus:
          route.kind === 'WAIVED' ? 'waived' : 'verified',
      });
      this.logger.log(
        `Invoice ${created.id} auto-verified via ${route.kind.toLowerCase()} route`,
      );
    }

    return created;
  }

  /**
   * Operator-driven resolution of an invoice in `under_review`. Approving
   * moves it to verified/verified; rejecting moves it to rejected/failed.
   * Either path emits the corresponding lifecycle event.
   */
  async resolveVerification(
    tenantId: string,
    invoiceId: string,
    input: { approved: boolean; verifierId: string; notes?: string },
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    if (invoice.status !== InvoiceStatus.under_review) {
      throw new ValidationError(
        `Invoice ${invoiceId} is ${invoice.status}, not under_review — cannot resolve verification`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: input.approved
        ? {
            status: InvoiceStatus.verified,
            verificationStatus: VerificationStatus.verified,
            verifiedBy: input.verifierId,
            verifiedAt: now,
            verificationNotes: input.notes,
          }
        : {
            status: InvoiceStatus.rejected,
            verificationStatus: VerificationStatus.failed,
            verifiedBy: input.verifierId,
            verifiedAt: now,
            verificationNotes: input.notes,
          },
    });

    if (input.approved) {
      this.eventBus.emitAndBuild(EventType.INVOICE_VERIFIED, tenantId, {
        invoiceId: updated.id,
        verificationStatus: 'verified',
        verifiedBy: input.verifierId,
      });
      this.logger.log(
        `Invoice ${updated.id} manually verified by ${input.verifierId}`,
      );
    } else {
      this.eventBus.emitAndBuild(EventType.INVOICE_REJECTED, tenantId, {
        invoiceId: updated.id,
        reason: input.notes ?? 'manual_rejection',
        rejectedBy: input.verifierId,
      });
      this.logger.log(
        `Invoice ${updated.id} manually rejected by ${input.verifierId}`,
      );
    }

    return updated;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Concentration-limit check — delegates to `ConcentrationLimitService`
   * (Sprint 12 Phase 3F). The dedicated service evaluates debtor-exposure
   * (% + absolute), industry-concentration, and seller-debtor concentration
   * per SPEC §2.4 and emits CONCENTRATION_LIMIT_WARNING / BREACHED events.
   */
  private async checkConcentration(
    tenantId: string,
    debtorId: string,
    sellerId: string,
    faceValue: string,
    productId: string,
  ): Promise<ConcentrationCheckResult> {
    return this.concentrationService.checkLimits(tenantId, {
      debtorId,
      sellerId,
      faceValue,
      productId,
    });
  }

  /**
   * Decision tree for verification routing per SPEC §3.3. Reads
   * `product.factoringConfig.verificationRules` and falls back to defaults
   * when fields are missing.
   *
   * Order matters — the higher-confidence "manual" triggers take precedence
   * over the auto-verify shortcut.
   */
  private async determineVerificationRoute(
    tenantId: string,
    factoringConfigJson: Prisma.JsonValue | null,
    input: SubmitInvoiceInput,
  ): Promise<VerificationRoute> {
    const config = (factoringConfigJson as Record<string, unknown> | null) ?? {};
    const verificationRules =
      (config.verificationRules as Record<string, unknown> | undefined) ?? {};

    const autoVerifyBelow =
      (verificationRules.autoVerifyBelow as string | undefined) ??
      DEFAULT_AUTO_VERIFY_BELOW;
    const manualVerifyAbove =
      (verificationRules.manualVerifyAbove as string | undefined) ??
      DEFAULT_MANUAL_VERIFY_ABOVE;
    const manualVerifyNewSeller =
      (verificationRules.manualVerifyNewSeller as boolean | undefined) ?? true;
    const manualVerifyNewDebtor =
      (verificationRules.manualVerifyNewDebtor as boolean | undefined) ?? true;

    // 1. High-value invoices always go manual.
    if (compare(input.faceValue, manualVerifyAbove) >= 0) {
      return { kind: 'MANUAL', reason: 'manual_amount_threshold' };
    }

    // 2. First-ever invoice for this seller — operator should eyeball it.
    if (manualVerifyNewSeller) {
      const sellerInvoiceCount = await this.prisma.invoice.count({
        where: { tenantId, sellerId: input.sellerId },
      });
      if (sellerInvoiceCount === 0) {
        return { kind: 'MANUAL', reason: 'new_seller' };
      }
    }

    // 3. First-ever invoice naming this debtor — same reasoning.
    if (manualVerifyNewDebtor) {
      const debtorInvoiceCount = await this.prisma.invoice.count({
        where: { tenantId, debtorId: input.debtorId },
      });
      if (debtorInvoiceCount === 0) {
        return { kind: 'MANUAL', reason: 'new_debtor' };
      }
    }

    // 4. Low-value invoices skip verification entirely.
    if (compare(input.faceValue, autoVerifyBelow) < 0) {
      return { kind: 'WAIVED' };
    }

    // 5. Mid-range invoices pass automated format checks (already done above:
    // debtor exists, no duplicate, dates valid) and become auto-verified.
    return { kind: 'AUTOMATED' };
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────

/**
 * Translate a routing decision into the persisted (status, verificationStatus,
 * verifiedAt) tuple per SPEC §3.2 / §3.3.
 */
function applyRoute(route: VerificationRoute): {
  invoiceStatus: InvoiceStatus;
  verificationStatus: VerificationStatus;
  verifiedAt: Date | null;
} {
  switch (route.kind) {
    case 'WAIVED':
      return {
        invoiceStatus: InvoiceStatus.verified,
        verificationStatus: VerificationStatus.waived,
        verifiedAt: new Date(),
      };
    case 'AUTOMATED':
      return {
        invoiceStatus: InvoiceStatus.verified,
        verificationStatus: VerificationStatus.verified,
        verifiedAt: new Date(),
      };
    case 'MANUAL':
      return {
        invoiceStatus: InvoiceStatus.under_review,
        verificationStatus: VerificationStatus.pending,
        verifiedAt: null,
      };
  }
}

/**
 * Parse an ISO 8601 calendar date (`YYYY-MM-DD`) into a UTC midnight Date.
 * Throws ValidationError on bad input. The DB column is `@db.Date`, so we
 * normalize to UTC midnight to keep the round-trip stable across timezones.
 */
function parseCalendarDate(value: string, fieldName: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new ValidationError(
      `${fieldName} must be an ISO 8601 date (YYYY-MM-DD), got ${value}`,
    );
  }
  const datePart = value.slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} (${value}) is not a valid date`);
  }
  return parsed;
}

/** UTC midnight for "today" — used for issueDate / dueDate comparisons. */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
