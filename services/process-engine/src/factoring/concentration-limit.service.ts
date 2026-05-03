import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  InvoiceStatus,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  add,
  bankersRound,
  compare,
  divide,
  isZero,
  multiply,
} from '@lons/common';
import {
  EventType,
  type ConcentrationLimitType,
} from '@lons/event-contracts';

import type {
  CheckLimitsInput,
  ConcentrationCheckResult,
  ConcentrationSummary,
  ConcentrationViolation,
  DebtorExposureRow,
  IndustryExposureRow,
  LimitUtilizationRow,
  SellerDebtorExposureRow,
} from './concentration-limit.types';

// ─── Defaults ────────────────────────────────────────────────────────────

/**
 * Default concentration caps when `product.factoringConfig.concentrationLimits`
 * is missing fields. Mirrors SPEC-invoice-factoring.md §2.4.
 */
const DEFAULT_LIMITS = {
  maxDebtorExposurePercent: 15,
  maxDebtorExposureAmount: '500000.00',
  maxIndustryExposurePercent: 30,
  maxSellerDebtorPercent: 50,
} as const;

/**
 * "Active" exposure for concentration purposes: the invoice is funded and
 * still owed to us (or just notified / partially-collected). We deliberately
 * exclude `submitted`, `under_review`, `verified`, and `offer_*` because no
 * money has gone out yet, and we exclude `settled` / `defaulted` /
 * `cancelled` / `disputed` / `rejected` because the exposure is closed out.
 */
const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.funded,
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
  InvoiceStatus.reserve_released,
];

/** Threshold above which a passing check still raises a WARNING event. */
const WARNING_UTILIZATION_THRESHOLD = '80';

const TOP_DEBTOR_LIMIT = 10;
const TOP_SELLER_DEBTOR_LIMIT = 10;

// ─── Internal types ──────────────────────────────────────────────────────

/** Effective concentration caps after applying defaults to product config. */
interface ResolvedLimits {
  maxDebtorExposurePercent: string;
  maxDebtorExposureAmount: string;
  maxIndustryExposurePercent: string;
  maxSellerDebtorPercent: string;
}

/**
 * Per-dimension result. Drives both the violation list and the per-check
 * WARNING emission decision. `passed === true` AND `utilizationPercent >= 80`
 * fires a warning; `passed === false` fires a breach.
 */
interface DimensionCheck {
  type: ConcentrationLimitType;
  /** Decimal-string. The projected value (percent or absolute amount). */
  current: string;
  /** Decimal-string. The configured cap. */
  max: string;
  /** Decimal-string percent in [0, 100]. `current / max * 100`. */
  utilizationPercent: string;
  passed: boolean;
  /** Pre-built human-readable message used when this check becomes a violation. */
  message: string;
  /** Identifiers for event payload routing. */
  debtorId?: string;
  industrySector?: string;
  sellerId?: string;
}

/**
 * ConcentrationLimitService — Sprint 12 Phase 3F.
 *
 * Implements SPEC-invoice-factoring.md §2.4: prevents over-exposure to a
 * single debtor, industry sector, or seller-debtor pair. Called by
 * `InvoiceSubmissionService` before persisting a new invoice; also exposes
 * a portfolio summary used by the admin-portal concentration dashboard.
 *
 * Design notes:
 *   - All money/percent math via `@lons/common` Decimal helpers. Prisma
 *     `Decimal` values are normalized to string at the boundary via
 *     `String(...)` before any arithmetic.
 *   - Every query is tenant-scoped. No cross-tenant aggregation.
 *   - Checks are computed independently and reported in aggregate, so a
 *     submission that breaches two limits surfaces both violations in a
 *     single response (rather than dribbling them out one rejection at a
 *     time).
 *   - WARNING emissions fire even on passing checks at >=80% utilization,
 *     so operators can react before the cap is breached.
 */
@Injectable()
export class ConcentrationLimitService {
  private readonly logger = new Logger('ConcentrationLimitService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Evaluate the four concentration limits (debtor%, debtor absolute,
   * industry%, seller-debtor%) against the projected exposure that would
   * result from accepting `input`. Emits per-check WARNING / BREACHED
   * events as side effects.
   *
   * The caller is responsible for blocking the submission when
   * `passed === false`.
   */
  async checkLimits(
    tenantId: string,
    input: CheckLimitsInput,
  ): Promise<ConcentrationCheckResult> {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId, deletedAt: null },
      select: { id: true, factoringConfig: true },
    });
    if (!product) throw new NotFoundError('Product', input.productId);

    const debtor = await this.prisma.debtor.findFirst({
      where: { id: input.debtorId, tenantId, deletedAt: null },
      select: { id: true, totalExposure: true, industrySector: true },
    });
    if (!debtor) throw new NotFoundError('Debtor', input.debtorId);

    const limits = resolveLimits(product.factoringConfig);

    const portfolioTotal = await this.sumActiveInvoiceFaceValues(tenantId, {});
    const newPortfolioTotal = add(portfolioTotal, input.faceValue);

    const checks: DimensionCheck[] = [];

    // ── Check 1: Debtor concentration (% of portfolio) ──
    const currentDebtorExposure = String(debtor.totalExposure);
    const projectedDebtorExposure = add(currentDebtorExposure, input.faceValue);
    const debtorPercent = isZero(newPortfolioTotal)
      ? '0'
      : bankersRound(
          multiply(divide(projectedDebtorExposure, newPortfolioTotal), '100'),
          2,
        );
    const debtorPercentMax = String(limits.maxDebtorExposurePercent);
    checks.push({
      type: 'debtor_percent',
      current: debtorPercent,
      max: debtorPercentMax,
      utilizationPercent: utilizationOf(debtorPercent, debtorPercentMax),
      passed: compare(debtorPercent, debtorPercentMax) <= 0,
      message: `Debtor would represent ${debtorPercent}% of portfolio (cap ${debtorPercentMax}%)`,
      debtorId: input.debtorId,
    });

    // ── Check 2: Debtor concentration (absolute amount) ──
    const debtorAbsoluteMax = limits.maxDebtorExposureAmount;
    checks.push({
      type: 'debtor_absolute',
      current: projectedDebtorExposure,
      max: debtorAbsoluteMax,
      utilizationPercent: utilizationOf(projectedDebtorExposure, debtorAbsoluteMax),
      passed: compare(projectedDebtorExposure, debtorAbsoluteMax) <= 0,
      message: `Debtor exposure would reach ${projectedDebtorExposure} (cap ${debtorAbsoluteMax})`,
      debtorId: input.debtorId,
    });

    // ── Check 3: Industry concentration ──
    // Skipped when the debtor has no `industrySector` recorded — there's
    // no meaningful denominator to bucket against.
    const industrySector = debtor.industrySector;
    if (industrySector !== null && industrySector !== undefined) {
      const industryExposure = await this.sumActiveInvoiceFaceValues(tenantId, {
        debtor: { industrySector },
      });
      const industryPercent = isZero(newPortfolioTotal)
        ? '0'
        : bankersRound(
            multiply(
              divide(add(industryExposure, input.faceValue), newPortfolioTotal),
              '100',
            ),
            2,
          );
      const industryMax = String(limits.maxIndustryExposurePercent);
      checks.push({
        type: 'industry_percent',
        current: industryPercent,
        max: industryMax,
        utilizationPercent: utilizationOf(industryPercent, industryMax),
        passed: compare(industryPercent, industryMax) <= 0,
        message: `Industry "${industrySector}" would represent ${industryPercent}% of portfolio (cap ${industryMax}%)`,
        industrySector,
      });
    } else {
      this.logger.debug(
        `Skipping industry concentration check — debtor ${input.debtorId} has no industrySector`,
      );
    }

    // ── Check 4: Seller-debtor concentration ──
    const sellerDebtorExposure = await this.sumActiveInvoiceFaceValues(tenantId, {
      sellerId: input.sellerId,
      debtorId: input.debtorId,
    });
    const sellerTotal = await this.sumActiveInvoiceFaceValues(tenantId, {
      sellerId: input.sellerId,
    });
    const newSellerTotal = add(sellerTotal, input.faceValue);
    const sellerDebtorPercent = isZero(newSellerTotal)
      ? '0'
      : bankersRound(
          multiply(
            divide(add(sellerDebtorExposure, input.faceValue), newSellerTotal),
            '100',
          ),
          2,
        );
    const sellerDebtorMax = String(limits.maxSellerDebtorPercent);
    checks.push({
      type: 'seller_debtor_percent',
      current: sellerDebtorPercent,
      max: sellerDebtorMax,
      utilizationPercent: utilizationOf(sellerDebtorPercent, sellerDebtorMax),
      passed: compare(sellerDebtorPercent, sellerDebtorMax) <= 0,
      message: `Seller-debtor pair would represent ${sellerDebtorPercent}% of seller portfolio (cap ${sellerDebtorMax}%)`,
      sellerId: input.sellerId,
      debtorId: input.debtorId,
    });

    // ── Build result + emit events ──
    const violations: ConcentrationViolation[] = [];
    for (const c of checks) {
      if (!c.passed) {
        violations.push({
          type: c.type,
          current: c.current,
          max: c.max,
          message: c.message,
        });
        this.eventBus.emitAndBuild(
          EventType.CONCENTRATION_LIMIT_BREACHED,
          tenantId,
          {
            limitType: c.type,
            attemptedValue: c.current,
            maxValue: c.max,
            debtorId: c.debtorId,
            industrySector: c.industrySector,
            sellerId: c.sellerId,
          },
        );
      } else if (compare(c.utilizationPercent, WARNING_UTILIZATION_THRESHOLD) >= 0) {
        this.eventBus.emitAndBuild(
          EventType.CONCENTRATION_LIMIT_WARNING,
          tenantId,
          {
            limitType: c.type,
            currentValue: c.current,
            maxValue: c.max,
            utilizationPercent: c.utilizationPercent,
            debtorId: c.debtorId,
            industrySector: c.industrySector,
            sellerId: c.sellerId,
          },
        );
      }
    }

    const result: ConcentrationCheckResult = {
      passed: violations.length === 0,
      violations,
    };

    if (!result.passed) {
      this.logger.warn(
        `Concentration check failed for debtor=${input.debtorId} seller=${input.sellerId}: ${violations
          .map((v) => v.type)
          .join(', ')}`,
      );
    }

    return result;
  }

  /**
   * Build the concentration dashboard payload for the admin portal.
   * Aggregates portfolio-wide exposure across debtors, industries, and
   * seller-debtor pairs, plus current vs configured limit utilization.
   *
   * Limitation: limit utilization is computed against the first active
   * invoice_financing product's `concentrationLimits` (or the defaults if
   * none is configured). Tenants with multiple invoice-financing products
   * with divergent caps will see only the first product's caps reflected
   * here. A future revision can return per-product utilization arrays.
   */
  async getConcentrationSummary(
    tenantId: string,
  ): Promise<ConcentrationSummary> {
    // ── Portfolio total (denominator for percent calculations) ──
    const portfolioTotal = await this.sumActiveInvoiceFaceValues(tenantId, {});

    // ── Top 10 debtors by exposure ──
    const topDebtorsRaw = await this.prisma.debtor.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { totalExposure: 'desc' },
      take: TOP_DEBTOR_LIMIT,
      select: { id: true, companyName: true, totalExposure: true },
    });
    const topDebtors: DebtorExposureRow[] = topDebtorsRaw.map((d) => {
      const exposure = String(d.totalExposure);
      return {
        debtorId: d.id,
        companyName: d.companyName,
        totalExposure: exposure,
        percentOfPortfolio: percentOfPortfolio(exposure, portfolioTotal),
      };
    });

    // ── Industry breakdown ──
    // Pull the active-invoice rows once and bucket in-memory; the dataset
    // is bounded by the funded portfolio size which is small enough to
    // process here without a raw SQL aggregation.
    const activeRows = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ACTIVE_INVOICE_STATUSES } },
      select: {
        debtorId: true,
        faceValue: true,
        debtor: { select: { industrySector: true } },
      },
    });

    const industryBuckets = new Map<
      string,
      { totalExposure: string; debtorIds: Set<string>; sector: string | null }
    >();
    for (const row of activeRows) {
      const sector = row.debtor?.industrySector ?? null;
      const key = sector ?? '__null__';
      const bucket = industryBuckets.get(key) ?? {
        totalExposure: '0',
        debtorIds: new Set<string>(),
        sector,
      };
      bucket.totalExposure = add(bucket.totalExposure, String(row.faceValue));
      bucket.debtorIds.add(row.debtorId);
      industryBuckets.set(key, bucket);
    }
    const industryBreakdown: IndustryExposureRow[] = Array.from(
      industryBuckets.values(),
    )
      .map((b) => ({
        industrySector: b.sector,
        totalExposure: b.totalExposure,
        percentOfPortfolio: percentOfPortfolio(b.totalExposure, portfolioTotal),
        debtorCount: b.debtorIds.size,
      }))
      .sort((a, b) => (compare(b.totalExposure, a.totalExposure)));

    // ── Top seller-debtor pairs ──
    const sellerRows = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ACTIVE_INVOICE_STATUSES } },
      select: { sellerId: true, debtorId: true, faceValue: true },
    });
    const sellerDebtorBuckets = new Map<string, SellerDebtorExposureRow>();
    for (const row of sellerRows) {
      const key = `${row.sellerId}::${row.debtorId}`;
      const bucket = sellerDebtorBuckets.get(key) ?? {
        sellerId: row.sellerId,
        debtorId: row.debtorId,
        totalExposure: '0',
        percentOfPortfolio: '0',
      };
      bucket.totalExposure = add(bucket.totalExposure, String(row.faceValue));
      sellerDebtorBuckets.set(key, bucket);
    }
    const topSellerDebtors: SellerDebtorExposureRow[] = Array.from(
      sellerDebtorBuckets.values(),
    )
      .map((b) => ({
        ...b,
        percentOfPortfolio: percentOfPortfolio(b.totalExposure, portfolioTotal),
      }))
      .sort((a, b) => compare(b.totalExposure, a.totalExposure))
      .slice(0, TOP_SELLER_DEBTOR_LIMIT);

    // ── Limit utilization ──
    // Pick the first active invoice-financing product as the representative
    // config (see method-level limitation note above).
    const representativeProduct = await this.prisma.product.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        type: 'invoice_financing',
        status: 'active',
      },
      select: { factoringConfig: true },
      orderBy: { createdAt: 'asc' },
    });
    const limits = resolveLimits(representativeProduct?.factoringConfig ?? null);

    const peakDebtorPercent = topDebtors[0]?.percentOfPortfolio ?? '0';
    const peakDebtorAbsolute = topDebtors[0]?.totalExposure ?? '0';
    const peakIndustryPercent = industryBreakdown[0]?.percentOfPortfolio ?? '0';
    const peakSellerDebtorPercent = topSellerDebtors[0]?.percentOfPortfolio ?? '0';

    const limitUtilization: LimitUtilizationRow[] = [
      {
        type: 'debtor_percent',
        max: String(limits.maxDebtorExposurePercent),
        current: peakDebtorPercent,
        utilizationPercent: utilizationOf(
          peakDebtorPercent,
          String(limits.maxDebtorExposurePercent),
        ),
      },
      {
        type: 'debtor_absolute',
        max: limits.maxDebtorExposureAmount,
        current: peakDebtorAbsolute,
        utilizationPercent: utilizationOf(
          peakDebtorAbsolute,
          limits.maxDebtorExposureAmount,
        ),
      },
      {
        type: 'industry_percent',
        max: String(limits.maxIndustryExposurePercent),
        current: peakIndustryPercent,
        utilizationPercent: utilizationOf(
          peakIndustryPercent,
          String(limits.maxIndustryExposurePercent),
        ),
      },
      {
        type: 'seller_debtor_percent',
        max: String(limits.maxSellerDebtorPercent),
        current: peakSellerDebtorPercent,
        utilizationPercent: utilizationOf(
          peakSellerDebtorPercent,
          String(limits.maxSellerDebtorPercent),
        ),
      },
    ];

    return {
      topDebtors,
      industryBreakdown,
      topSellerDebtors,
      limitUtilization,
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Sum `faceValue` across active invoices matching the given filter.
   * Returns a Decimal-string ("0" when there are no rows). The filter
   * is `AND`-merged with the active-status + tenant-scope predicate.
   */
  private async sumActiveInvoiceFaceValues(
    tenantId: string,
    extraWhere: Prisma.InvoiceWhereInput,
  ): Promise<string> {
    const result = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        status: { in: ACTIVE_INVOICE_STATUSES },
        ...extraWhere,
      },
      _sum: { faceValue: true },
    });
    return String(result._sum.faceValue ?? '0');
  }
}

// ─── Module-private helpers ────────────────────────────────────────────────

/**
 * Resolve the four concentration caps from a product's `factoringConfig`
 * JSON. Missing fields fall back to the spec defaults. Numeric percent
 * caps (e.g. `15`) are kept as numbers in the resolved struct because
 * that's how they appear in the JSON; consumers `String()` them at the
 * boundary before passing into the Decimal helpers.
 */
function resolveLimits(factoringConfigJson: Prisma.JsonValue | null): ResolvedLimits {
  const config = (factoringConfigJson as Record<string, unknown> | null) ?? {};
  const limits = (config.concentrationLimits as Record<string, unknown> | undefined) ?? {};

  return {
    maxDebtorExposurePercent:
      (limits.maxDebtorExposurePercent as string | number | undefined) !== undefined
        ? String(limits.maxDebtorExposurePercent)
        : String(DEFAULT_LIMITS.maxDebtorExposurePercent),
    maxDebtorExposureAmount:
      (limits.maxDebtorExposureAmount as string | undefined) ??
      DEFAULT_LIMITS.maxDebtorExposureAmount,
    maxIndustryExposurePercent:
      (limits.maxIndustryExposurePercent as string | number | undefined) !== undefined
        ? String(limits.maxIndustryExposurePercent)
        : String(DEFAULT_LIMITS.maxIndustryExposurePercent),
    maxSellerDebtorPercent:
      (limits.maxSellerDebtorPercent as string | number | undefined) !== undefined
        ? String(limits.maxSellerDebtorPercent)
        : String(DEFAULT_LIMITS.maxSellerDebtorPercent),
  };
}

/**
 * `current / max * 100`, banker's-rounded to 2dp. Returns "0" when `max`
 * is zero (avoids divide-by-zero; an unconfigured cap can't be utilized).
 */
function utilizationOf(current: string, max: string): string {
  if (isZero(max)) return '0';
  return bankersRound(multiply(divide(current, max), '100'), 2);
}

/**
 * `exposure / portfolioTotal * 100`, banker's-rounded to 2dp. Returns "0"
 * when the portfolio is empty (e.g. cold-start dashboard).
 */
function percentOfPortfolio(exposure: string, portfolioTotal: string): string {
  if (isZero(portfolioTotal)) return '0';
  return bankersRound(multiply(divide(exposure, portfolioTotal), '100'), 2);
}

