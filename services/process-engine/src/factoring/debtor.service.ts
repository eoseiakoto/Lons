import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  Debtor,
  DebtorStatus,
  InvoiceStatus,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  bankersRound,
  divide,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import {
  DEFAULT_FACTOR,
  lookupCountryFactor,
  lookupIndustryFactor,
} from './risk-tables';

// ─── Public types (Phase 3A) ─────────────────────────────────────────────

export interface CreateDebtorInput {
  /** Required — full legal name of the debtor company. */
  companyName: string;
  /** Required — ISO-3 country code. */
  country: string;
  tradingName?: string;
  registrationNumber?: string;
  taxId?: string;
  industrySector?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactName?: string;
  address?: Prisma.InputJsonValue;
  paymentTerms?: string;
  externalCreditRating?: string;
  /** Optional Decimal string. Caller bears formatting; we don't coerce here. */
  exposureLimit?: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Idempotency hint. When supplied AND a debtor with the same
   * `[tenantId, companyName, registrationNumber]` already exists,
   * `create` returns the existing record without emitting `DEBTOR_CREATED`.
   * (Without this key the unique constraint will reject the insert.)
   */
  idempotencyKey?: string;
}

export type UpdateDebtorInput = Partial<
  Omit<CreateDebtorInput, 'companyName' | 'idempotencyKey'>
> & {
  companyName?: string;
};

export interface DebtorFilters {
  status?: DebtorStatus;
  industrySector?: string;
  country?: string;
  /** Free-text search across companyName + registrationNumber. */
  search?: string;
}

export interface DebtorListPagination {
  /** Cursor is a debtor `id`. */
  cursor?: string;
  /** Defaults to 20, capped at 100. */
  limit?: number;
}

export interface DebtorRiskFactors {
  /** Decimal string contribution from on-time payment ratio. */
  paymentHistory: string;
  /** Decimal string contribution from industry sector lookup. */
  industry: string;
  /** Decimal string contribution from country lookup. */
  country: string;
  /** Decimal string contribution from default count. */
  default: string;
}

export interface DebtorRiskResult {
  /** Decimal string in [0, 100] (higher = better). */
  score: string;
  /** Whole-day average days late across paid invoices. Null if no history. */
  averagePaymentDays: number | null;
  /** Decimal string in [0, 100]. % of paid invoices paid on/before due date. */
  reliabilityPercent: string;
  factors: DebtorRiskFactors;
}

// ─── Internals ───────────────────────────────────────────────────────────

/** Statuses we count as "paid" for risk-history aggregation. */
const PAID_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.payment_received,
  InvoiceStatus.reserve_released,
  InvoiceStatus.settled,
];

/** All statuses we pull when computing risk (paid + adverse). */
const RISK_HISTORY_STATUSES: InvoiceStatus[] = [
  ...PAID_INVOICE_STATUSES,
  InvoiceStatus.defaulted,
  InvoiceStatus.disputed,
];

const BASE_SCORE = '50';
const SCORE_MIN = '0';
const SCORE_MAX = '100';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Clamp a Decimal-string to [min, max]. */
function clampString(value: string, minVal: string, maxVal: string): string {
  // Use simple compare via subtract sign — keeps everything Decimal.
  const minDelta = subtract(value, minVal); // value - min
  if (minDelta.startsWith('-')) return minVal;
  const maxDelta = subtract(value, maxVal); // value - max
  if (!maxDelta.startsWith('-') && maxDelta !== '0') return maxVal;
  return value;
}

/**
 * Days between two dates (b - a), positive when b is after a. Both inputs
 * are normalized to UTC midnight so partial days don't skew the result.
 * For the v1 risk model this is "days late" when b = actualPaymentDate
 * and a = dueDate.
 */
function daysBetweenUtc(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/**
 * Debtor (Buyer) CRUD + risk assessment + exposure tracking.
 *
 * Scope: Sprint 12 Phase 3A — Invoice Factoring.
 *
 * Design notes:
 *   - All queries are tenant-scoped (`findFirst` + `tenantId`); no cross-tenant
 *     access. Soft-deleted rows (`deletedAt != null`) are excluded from every
 *     read path.
 *   - Money/score values are Decimal-strings; math goes through `@lons/common`
 *     helpers. Prisma returns `Decimal` objects; we normalize to string at
 *     the boundary via `String(...)`.
 *   - Risk assessment is rule-based (spec §2.3). Phase 5 swaps this for the
 *     ML scoring service while keeping the same `DebtorRiskResult` contract.
 *   - `actualPaymentDate` for paid invoices uses `updatedAt` as a v1 proxy
 *     (when `amountReceived` first reached `faceValue`). When the
 *     repayment-service starts emitting payment timestamps on the Invoice,
 *     swap this proxy out.
 */
@Injectable()
export class DebtorService {
  private readonly logger = new Logger('DebtorService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────

  async create(tenantId: string, input: CreateDebtorInput): Promise<Debtor> {
    if (!input.companyName?.trim()) {
      throw new ValidationError('companyName is required');
    }
    if (!input.country?.trim()) {
      throw new ValidationError('country is required');
    }

    // Idempotency: caller can opt in by supplying `idempotencyKey`. We
    // dedupe on the natural key (companyName + registrationNumber) per
    // tenant, which matches the unique constraint in Prisma.
    if (input.idempotencyKey) {
      const existing = await this.prisma.debtor.findFirst({
        where: {
          tenantId,
          companyName: input.companyName,
          registrationNumber: input.registrationNumber ?? null,
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.debug(
          `create: idempotency hit for "${input.companyName}" (key=${input.idempotencyKey})`,
        );
        return existing;
      }
    }

    const debtor = await this.prisma.debtor.create({
      data: {
        tenantId,
        companyName: input.companyName,
        tradingName: input.tradingName,
        registrationNumber: input.registrationNumber,
        taxId: input.taxId,
        country: input.country,
        industrySector: input.industrySector,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        contactName: input.contactName,
        address: input.address ?? undefined,
        paymentTerms: input.paymentTerms,
        externalCreditRating: input.externalCreditRating,
        exposureLimit: input.exposureLimit ?? undefined,
        metadata: input.metadata ?? undefined,
        status: DebtorStatus.active,
      },
    });

    this.eventBus.emitAndBuild(EventType.DEBTOR_CREATED, tenantId, {
      debtorId: debtor.id,
      companyName: debtor.companyName,
      country: debtor.country,
      industrySector: debtor.industrySector ?? undefined,
    });

    return debtor;
  }

  async findById(tenantId: string, debtorId: string): Promise<Debtor> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId, deletedAt: null },
    });
    if (!debtor) throw new NotFoundError('Debtor', debtorId);
    return debtor;
  }

  async findMany(
    tenantId: string,
    filters: DebtorFilters,
    pagination: DebtorListPagination,
  ): Promise<{ items: Debtor[]; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(1, pagination.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const where: Prisma.DebtorWhereInput = { tenantId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.industrySector) where.industrySector = filters.industrySector;
    if (filters.country) where.country = filters.country;
    if (filters.search) {
      where.OR = [
        { companyName: { contains: filters.search, mode: 'insensitive' } },
        { registrationNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Fetch one extra row to detect more pages.
    const rows = await this.prisma.debtor.findMany({
      where,
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  async update(
    tenantId: string,
    debtorId: string,
    input: UpdateDebtorInput,
  ): Promise<Debtor> {
    const existing = await this.findById(tenantId, debtorId);

    // Immutable-once-verified guard. Once a debtor has been verified
    // (verifiedAt is set), the natural-identity fields can't be moved
    // out from under prior invoices that referenced them.
    if (existing.verifiedAt) {
      if (
        input.registrationNumber !== undefined &&
        input.registrationNumber !== existing.registrationNumber
      ) {
        throw new ValidationError(
          'registrationNumber cannot be changed on a verified debtor',
        );
      }
      if (input.country !== undefined && input.country !== existing.country) {
        throw new ValidationError(
          'country cannot be changed on a verified debtor',
        );
      }
    }

    const data: Prisma.DebtorUpdateInput = {};
    if (input.companyName !== undefined) data.companyName = input.companyName;
    if (input.tradingName !== undefined) data.tradingName = input.tradingName;
    if (input.registrationNumber !== undefined)
      data.registrationNumber = input.registrationNumber;
    if (input.taxId !== undefined) data.taxId = input.taxId;
    if (input.country !== undefined) data.country = input.country;
    if (input.industrySector !== undefined)
      data.industrySector = input.industrySector;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
    if (input.contactName !== undefined) data.contactName = input.contactName;
    if (input.address !== undefined) data.address = input.address;
    if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
    if (input.externalCreditRating !== undefined)
      data.externalCreditRating = input.externalCreditRating;
    if (input.exposureLimit !== undefined)
      data.exposureLimit = input.exposureLimit ?? null;
    if (input.metadata !== undefined)
      data.metadata = input.metadata as Prisma.InputJsonValue;

    return this.prisma.debtor.update({
      where: { id: debtorId },
      data,
    });
  }

  async softDelete(tenantId: string, debtorId: string): Promise<void> {
    // Ensure exists + tenant-scoped; throws NotFoundError if not.
    await this.findById(tenantId, debtorId);
    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Status management ──────────────────────────────────────────────

  async suspend(
    tenantId: string,
    debtorId: string,
    reason: string,
    suspendedBy: string,
  ): Promise<Debtor> {
    if (!reason?.trim()) {
      throw new ValidationError('reason is required to suspend a debtor');
    }
    const existing = await this.findById(tenantId, debtorId);
    if (existing.status === DebtorStatus.suspended) return existing;
    if (existing.status === DebtorStatus.blacklisted) {
      throw new ValidationError(
        `Debtor ${debtorId} is blacklisted; cannot be suspended`,
      );
    }

    const updated = await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { status: DebtorStatus.suspended },
    });

    this.eventBus.emitAndBuild(EventType.DEBTOR_SUSPENDED, tenantId, {
      debtorId,
      reason,
      suspendedBy,
    });

    return updated;
  }

  async blacklist(
    tenantId: string,
    debtorId: string,
    reason: string,
    blacklistedBy: string,
  ): Promise<Debtor> {
    if (!reason?.trim()) {
      throw new ValidationError('reason is required to blacklist a debtor');
    }
    const existing = await this.findById(tenantId, debtorId);
    if (existing.status === DebtorStatus.blacklisted) return existing;

    const updated = await this.prisma.debtor.update({
      where: { id: debtorId },
      data: { status: DebtorStatus.blacklisted },
    });

    this.eventBus.emitAndBuild(EventType.DEBTOR_BLACKLISTED, tenantId, {
      debtorId,
      reason,
      blacklistedBy,
    });

    return updated;
  }

  async reactivate(tenantId: string, debtorId: string): Promise<Debtor> {
    const existing = await this.findById(tenantId, debtorId);
    if (existing.status === DebtorStatus.active) return existing;
    if (existing.status === DebtorStatus.blacklisted) {
      throw new ValidationError(
        `Debtor ${debtorId} is blacklisted; reactivation requires explicit unblacklist`,
      );
    }
    if (existing.status !== DebtorStatus.suspended) {
      throw new ValidationError(
        `Debtor ${debtorId} cannot be reactivated from status ${existing.status}`,
      );
    }

    return this.prisma.debtor.update({
      where: { id: debtorId },
      data: { status: DebtorStatus.active },
    });
  }

  // ─── Risk assessment (spec §2.3) ────────────────────────────────────

  /**
   * Compute the v1 rule-based internal risk score for a debtor and
   * persist it.
   *
   * Inputs:
   *   - All invoices for the debtor in `payment_received` /
   *     `reserve_released` / `settled` / `defaulted` / `disputed`.
   *
   * Score model (all math in Decimal-string via @lons/common):
   *   reliabilityScore   = onTimeCount / paidCount * 100
   *   paymentHistoryFactor = clamp((reliabilityScore - 50) * 1.0, -50, 50)
   *   industryFactor     = INDUSTRY_RISK_FACTORS[debtor.industrySector] ?? 0
   *   countryFactor      = COUNTRY_RISK_FACTORS[debtor.country] ?? 0
   *   defaultFactor      = -10 * defaultCount
   *   internalRiskScore  = clamp(50 + paymentHistory + industry + country + default, 0, 100)
   *
   * Side effects:
   *   - Updates `debtor.internalRiskScore` (Decimal, 2dp) and
   *     `debtor.averagePaymentDays` (Int).
   *   - Emits `DEBTOR_RISK_ASSESSED`.
   */
  async assessRisk(tenantId: string, debtorId: string): Promise<DebtorRiskResult> {
    const debtor = await this.findById(tenantId, debtorId);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        debtorId,
        status: { in: RISK_HISTORY_STATUSES },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        debtorPaidAt: true,
        updatedAt: true,
      },
    });

    const paid = invoices.filter((inv) =>
      PAID_INVOICE_STATUSES.includes(inv.status),
    );
    const defaultCount = invoices.filter(
      (inv) => inv.status === InvoiceStatus.defaulted,
    ).length;

    // ── Reliability + average-late-days ──
    let onTimeCount = 0;
    let totalDaysLate = 0;
    for (const inv of paid) {
      // S13-2: prefer `debtorPaidAt` (set on the first payment event in
      // ReserveService.recordDebtorPayment) over `updatedAt` so spurious
      // mutations (e.g., metadata edits, reserve releases) don't skew
      // the payment-delay calculation. Invoices paid before this field
      // existed fall back to `updatedAt`.
      const actualPaymentDate = inv.debtorPaidAt ?? inv.updatedAt;
      const daysLate = daysBetweenUtc(inv.dueDate, actualPaymentDate);
      totalDaysLate += daysLate;
      if (daysLate <= 0) onTimeCount += 1;
    }

    const paidCount = paid.length;
    let reliabilityPercent: string;
    if (paidCount === 0) {
      // No history yet — treat as neutral so the score stays at base.
      reliabilityPercent = '50.00';
    } else {
      reliabilityPercent = bankersRound(
        multiply(divide(String(onTimeCount), String(paidCount)), '100'),
        2,
      );
    }

    const averagePaymentDays = paidCount === 0
      ? null
      : Math.round(totalDaysLate / paidCount);

    // ── Factor breakdown ──
    // Each factor is normalized to 2dp Decimal-string so the event payload
    // and the persisted score share a stable shape across call sites.
    const paymentHistoryFactor = bankersRound(
      clampString(
        // (reliability - 50) * 1.0
        multiply(subtract(reliabilityPercent, '50'), '1'),
        '-50',
        '50',
      ),
      2,
    );
    const industryFactor = bankersRound(
      lookupIndustryFactor(debtor.industrySector),
      2,
    );
    const countryFactor = bankersRound(lookupCountryFactor(debtor.country), 2);
    const defaultFactor = bankersRound(multiply('-10', String(defaultCount)), 2);

    // baseScore + factors, clamped to [0, 100]
    let raw = BASE_SCORE;
    raw = add(raw, paymentHistoryFactor);
    raw = add(raw, industryFactor);
    raw = add(raw, countryFactor);
    raw = add(raw, defaultFactor);
    const score = bankersRound(clampString(raw, SCORE_MIN, SCORE_MAX), 2);

    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        internalRiskScore: score,
        averagePaymentDays: averagePaymentDays ?? undefined,
      },
    });

    this.eventBus.emitAndBuild(EventType.DEBTOR_RISK_ASSESSED, tenantId, {
      debtorId,
      internalRiskScore: score,
      averagePaymentDays: averagePaymentDays ?? undefined,
      factors: {
        paymentHistory: paymentHistoryFactor,
        industryRisk: industryFactor,
        countryRisk: countryFactor,
        // Spec event uses `concentrationRisk` for the fourth slot; v1
        // re-purposes it for default-count contribution since
        // concentration is computed elsewhere (ConcentrationLimitService).
        concentrationRisk: defaultFactor,
      },
    });

    return {
      score,
      averagePaymentDays,
      reliabilityPercent,
      factors: {
        paymentHistory: paymentHistoryFactor,
        industry: industryFactor,
        country: countryFactor,
        default: defaultFactor,
      },
    };
  }

  // ─── Exposure tracking ──────────────────────────────────────────────

  /**
   * Atomically apply a signed delta to `debtor.totalExposure` and emit
   * `DEBTOR_EXPOSURE_CHANGED`. Positive delta = new exposure (e.g.,
   * invoice funded); negative delta = exposure released (e.g., debtor
   * payment received, invoice defaulted with write-off).
   *
   * Concurrency: uses Prisma's atomic `increment` operator so concurrent
   * calls don't lose updates. The `previousExposure` reported in the
   * event is the read-before value — fine for audit/breadcrumb purposes,
   * not for synchronous "what is current?" decisions (read-back if
   * needed).
   */
  async updateExposure(
    tenantId: string,
    debtorId: string,
    delta: string,
    invoiceId?: string,
  ): Promise<void> {
    if (!delta || delta === '0' || delta === '0.0' || delta === '0.00') {
      this.logger.debug(
        `updateExposure: zero delta for debtor ${debtorId} — no-op`,
      );
      return;
    }

    const existing = await this.findById(tenantId, debtorId);
    const previousExposure = String(existing.totalExposure);

    // Atomic update via Prisma's increment (handles signed values).
    const updated = await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        totalExposure: { increment: new Prisma.Decimal(delta) },
      },
    });

    const newExposure = String(updated.totalExposure);

    this.eventBus.emitAndBuild(EventType.DEBTOR_EXPOSURE_CHANGED, tenantId, {
      debtorId,
      previousExposure,
      newExposure,
      delta,
      invoiceId,
    });
  }
}

// Keep these symbols reachable so consumers re-import them through this module.
void DEFAULT_FACTOR;
