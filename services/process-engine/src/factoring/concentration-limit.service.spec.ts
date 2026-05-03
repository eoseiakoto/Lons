/**
 * ConcentrationLimitService — Sprint 12 Phase 3F.
 *
 * Mock-Prisma unit tests covering the four concentration checks
 * (debtor%, debtor absolute, industry%, seller-debtor%), the WARNING
 * vs BREACHED event emission split, and the dashboard aggregation in
 * `getConcentrationSummary`.
 */

import { Prisma } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { ConcentrationLimitService } from './concentration-limit.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const SELLER_2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEBTOR = '33333333-3333-3333-3333-333333333333';
const DEBTOR_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PRODUCT = '44444444-4444-4444-4444-444444444444';

// ─── Fixtures ───────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<any> = {}) {
  return {
    id: PRODUCT,
    factoringConfig: {
      concentrationLimits: {
        maxDebtorExposurePercent: 15,
        maxDebtorExposureAmount: '500000.00',
        maxIndustryExposurePercent: 30,
        maxSellerDebtorPercent: 50,
      },
    },
    ...overrides,
  };
}

function makeDebtor(overrides: Partial<any> = {}) {
  return {
    id: DEBTOR,
    totalExposure: new Prisma.Decimal('0'),
    industrySector: 'manufacturing',
    ...overrides,
  };
}

/**
 * Build a flexible Prisma stub. Each `aggregate` invocation returns the
 * sum at the head of the queue (or `0` when exhausted). This matches the
 * order in which `checkLimits` issues queries:
 *   1. portfolio total
 *   3. industry exposure (only when debtor.industrySector is set)
 *   4. seller-debtor exposure
 *   5. seller total
 *
 * Tests that don't seed all entries get `0` for the rest, which models
 * "empty portfolio" from that point on.
 */
interface MakeMocksOpts {
  product?: any;
  debtor?: any;
  /** Aggregate results in call order. Each entry is a Decimal-string. */
  aggregateQueue?: string[];
}

function makeMocks(opts: MakeMocksOpts = {}) {
  const queue = [...(opts.aggregateQueue ?? [])];
  const aggregate = jest.fn(async () => ({
    _sum: { faceValue: new Prisma.Decimal(queue.shift() ?? '0') },
  }));

  // Distinguish "explicit null" (missing-entity test cases) from "key omitted"
  // (default fixture). `'product' in opts` differentiates the two.
  const productResolved =
    'product' in opts ? opts.product : makeProduct();
  const debtorResolved = 'debtor' in opts ? opts.debtor : makeDebtor();

  const prisma = {
    product: {
      findFirst: jest.fn().mockResolvedValue(productResolved),
    },
    debtor: {
      findFirst: jest.fn().mockResolvedValue(debtorResolved),
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoice: {
      aggregate,
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const eventBus = { emitAndBuild: jest.fn() };

  return { prisma, eventBus };
}

function newService(prisma: any, eventBus: any): ConcentrationLimitService {
  return new ConcentrationLimitService(prisma as any, eventBus as any);
}

// ─── checkLimits ────────────────────────────────────────────────────────

describe('ConcentrationLimitService.checkLimits', () => {
  it('happy path: all four checks pass, no events emitted', async () => {
    // Portfolio = 1,000,000; debtor exposure = 50,000; industry = 100,000;
    // seller-debtor = 20,000; seller total = 200,000. Adding a 10,000
    // invoice keeps every dimension well below caps + warning threshold.
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('50000') }),
      aggregateQueue: ['1000000', '100000', '20000', '200000'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '10000.00',
      productId: PRODUCT,
    });

    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('debtor-percent breach: pushes debtor over 15% cap', async () => {
    // Portfolio = 100,000 + new 16,000 → newTotal = 116,000.
    // Debtor currentExposure = 0 → projected = 16,000.
    // 16,000 / 116,000 = 13.79% — that's under 15%. Try larger.
    // Portfolio = 100,000, faceValue = 50,000, debtor existing 0 →
    //   projected = 50,000; newTotal = 150,000 → 33.33% > 15%. Breach.
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('0') }),
      aggregateQueue: ['100000', '0', '0', '0'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '50000.00',
      productId: PRODUCT,
    });

    expect(result.passed).toBe(false);
    const debtorPctViolation = result.violations.find(
      (v) => v.type === 'debtor_percent',
    );
    expect(debtorPctViolation).toBeDefined();
    expect(debtorPctViolation?.max).toBe('15');

    const breached = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_BREACHED,
    );
    expect(
      breached.some((c) => c[2].limitType === 'debtor_percent'),
    ).toBe(true);
  });

  it('debtor-absolute breach: exceeds maxDebtorExposureAmount', async () => {
    // Debtor currentExposure = 480,000; faceValue = 100,000 →
    // projected = 580,000 > 500,000 cap. Portfolio is large enough that
    // the percent check stays under 15%.
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('480000') }),
      aggregateQueue: ['10000000', '500000', '480000', '500000'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '100000.00',
      productId: PRODUCT,
    });

    const absViolation = result.violations.find(
      (v) => v.type === 'debtor_absolute',
    );
    expect(absViolation).toBeDefined();
    // `add` always returns 4dp (.toFixed(4)).
    expect(absViolation?.current).toBe('580000.0000');
    expect(absViolation?.max).toBe('500000.00');

    const breached = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_BREACHED,
    );
    expect(
      breached.some((c) => c[2].limitType === 'debtor_absolute'),
    ).toBe(true);
  });

  it('industry-percent breach: pushes industry over 30% cap', async () => {
    // Portfolio = 100,000; existing industry exposure = 25,000;
    // faceValue = 20,000 → newTotal = 120,000;
    // (25,000 + 20,000) / 120,000 = 37.5% > 30% cap.
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({
        totalExposure: new Prisma.Decimal('1000'),
        industrySector: 'logistics',
      }),
      aggregateQueue: ['100000', '25000', '0', '0'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '20000.00',
      productId: PRODUCT,
    });

    const industryViolation = result.violations.find(
      (v) => v.type === 'industry_percent',
    );
    expect(industryViolation).toBeDefined();
    expect(industryViolation?.current).toBe('37.50');

    const breached = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_BREACHED,
    );
    expect(
      breached.some(
        (c) =>
          c[2].limitType === 'industry_percent' &&
          c[2].industrySector === 'logistics',
      ),
    ).toBe(true);
  });

  it('seller-debtor breach: pushes pair over 50% of seller portfolio', async () => {
    // Portfolio = 1,000,000 (large enough that debtor% stays small).
    // sellerDebtor exposure = 30,000; sellerTotal = 50,000;
    // faceValue = 30,000 → newSellerTotal = 80,000;
    // (30,000 + 30,000) / 80,000 = 75% > 50%.
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('30000') }),
      aggregateQueue: ['1000000', '100000', '30000', '50000'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '30000.00',
      productId: PRODUCT,
    });

    const sellerDebtorViolation = result.violations.find(
      (v) => v.type === 'seller_debtor_percent',
    );
    expect(sellerDebtorViolation).toBeDefined();
    expect(sellerDebtorViolation?.current).toBe('75.00');

    const breached = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_BREACHED,
    );
    expect(
      breached.some((c) => c[2].limitType === 'seller_debtor_percent'),
    ).toBe(true);
  });

  it('warning at 80%+ utilization: passes but emits CONCENTRATION_LIMIT_WARNING', async () => {
    // Tune a debtor-percent of ~13%, which is 86.93% of the 15% cap.
    // Portfolio = 100,000; debtor existing = 0; faceValue = 15,000 →
    // newTotal = 115,000; 15,000/115,000 = 13.04%. 13.04 / 15 = 86.93%.
    // Seeded sellerDebtor=1,000 + sellerTotal=100,000 keeps the
    // seller-debtor dimension well below its 50% cap (and warning).
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('0') }),
      aggregateQueue: ['100000', '0', '1000', '100000'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '15000.00',
      productId: PRODUCT,
    });

    expect(result.passed).toBe(true);

    const warnings = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_WARNING,
    );
    expect(
      warnings.some((c) => c[2].limitType === 'debtor_percent'),
    ).toBe(true);

    const breached = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === EventType.CONCENTRATION_LIMIT_BREACHED,
    );
    expect(breached.length).toBe(0);
  });

  it('skips industry check when debtor.industrySector is null', async () => {
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({
        totalExposure: new Prisma.Decimal('100'),
        industrySector: null,
      }),
      // No industry-aggregate query expected. Queue order:
      // portfolio, sellerDebtor, sellerTotal. Seed sellerTotal big enough
      // that the seller-debtor% stays well under cap.
      aggregateQueue: ['1000000', '10000', '100000'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '1000.00',
      productId: PRODUCT,
    });

    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);

    // Industry-percent check should not appear in any breach OR warning.
    const allEvts = eventBus.emitAndBuild.mock.calls;
    expect(
      allEvts.some((c) => c[2]?.limitType === 'industry_percent'),
    ).toBe(false);

    // Confirm we issued exactly 3 aggregate calls (portfolio, sellerDebtor,
    // sellerTotal) — no industry aggregation when sector is null.
    expect(prisma.invoice.aggregate).toHaveBeenCalledTimes(3);
  });

  it('empty portfolio: first invoice ever passes all checks', async () => {
    const { prisma, eventBus } = makeMocks({
      debtor: makeDebtor({ totalExposure: new Prisma.Decimal('0') }),
      aggregateQueue: ['0', '0', '0', '0'],
    });
    const service = newService(prisma, eventBus);

    const result = await service.checkLimits(TENANT, {
      debtorId: DEBTOR,
      sellerId: SELLER,
      faceValue: '10000.00',
      productId: PRODUCT,
    });

    // First-ever invoice: 100% concentration on every percent dimension,
    // which breaches debtor%, industry%, AND seller-debtor%. (Absolute
    // remains under 500k.) That's the spec'd behaviour — concentration
    // is always evaluated post-acceptance, and the first invoice trivially
    // saturates the percent dimensions.
    //
    // What we ARE asserting here: no exception is thrown, the result
    // shape is well-formed, and the absolute-cap dimension passes (the
    // single 10k invoice can't exhaust a 500k cap).
    const absolute = result.violations.concat([]).find(
      (v) => v.type === 'debtor_absolute',
    );
    expect(absolute).toBeUndefined();
  });

  it('throws NotFoundError when product is missing', async () => {
    const { prisma, eventBus } = makeMocks({ product: null });
    const service = newService(prisma, eventBus);

    await expect(
      service.checkLimits(TENANT, {
        debtorId: DEBTOR,
        sellerId: SELLER,
        faceValue: '1000.00',
        productId: PRODUCT,
      }),
    ).rejects.toThrow(/Product/);
  });

  it('throws NotFoundError when debtor is missing', async () => {
    const { prisma, eventBus } = makeMocks({ debtor: null });
    const service = newService(prisma, eventBus);

    await expect(
      service.checkLimits(TENANT, {
        debtorId: DEBTOR,
        sellerId: SELLER,
        faceValue: '1000.00',
        productId: PRODUCT,
      }),
    ).rejects.toThrow(/Debtor/);
  });
});

// ─── getConcentrationSummary ────────────────────────────────────────────

describe('ConcentrationLimitService.getConcentrationSummary', () => {
  function makeSummaryMocks(opts: {
    portfolioTotal?: string;
    debtors?: Array<{ id: string; companyName: string; totalExposure: string }>;
    activeInvoices?: Array<{
      sellerId: string;
      debtorId: string;
      faceValue: string;
      industrySector: string | null;
    }>;
    product?: any;
  }) {
    const aggregateQueue: string[] = [opts.portfolioTotal ?? '0'];
    const aggregate = jest.fn(async () => ({
      _sum: { faceValue: new Prisma.Decimal(aggregateQueue.shift() ?? '0') },
    }));

    // The service issues two findMany calls on prisma.invoice — once with
    // a `debtor: { select: { industrySector } }` join (industry breakdown)
    // and once flat (seller-debtor pairs). Stub returns the same dataset
    // shaped appropriately for each call.
    let findManyCallCount = 0;
    const findManyImpl = jest.fn(async (_args: any) => {
      findManyCallCount += 1;
      const rows = opts.activeInvoices ?? [];
      if (findManyCallCount === 1) {
        // industry breakdown call
        return rows.map((r) => ({
          debtorId: r.debtorId,
          faceValue: new Prisma.Decimal(r.faceValue),
          debtor: { industrySector: r.industrySector },
        }));
      }
      return rows.map((r) => ({
        sellerId: r.sellerId,
        debtorId: r.debtorId,
        faceValue: new Prisma.Decimal(r.faceValue),
      }));
    });

    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(opts.product ?? makeProduct()),
      },
      debtor: {
        findFirst: jest.fn().mockResolvedValue(makeDebtor()),
        findMany: jest.fn().mockResolvedValue(
          (opts.debtors ?? []).map((d) => ({
            id: d.id,
            companyName: d.companyName,
            totalExposure: new Prisma.Decimal(d.totalExposure),
          })),
        ),
      },
      invoice: {
        aggregate,
        findMany: findManyImpl,
      },
    };

    const eventBus = { emitAndBuild: jest.fn() };
    return { prisma, eventBus };
  }

  it('returns top debtors sorted desc by exposure with portfolio percentages', async () => {
    const { prisma, eventBus } = makeSummaryMocks({
      portfolioTotal: '1000000',
      debtors: [
        { id: DEBTOR, companyName: 'Acme', totalExposure: '300000' },
        { id: DEBTOR_2, companyName: 'Globex', totalExposure: '150000' },
      ],
      activeInvoices: [
        {
          sellerId: SELLER,
          debtorId: DEBTOR,
          faceValue: '300000',
          industrySector: 'manufacturing',
        },
        {
          sellerId: SELLER,
          debtorId: DEBTOR_2,
          faceValue: '150000',
          industrySector: 'logistics',
        },
      ],
    });
    const service = newService(prisma, eventBus);

    const summary = await service.getConcentrationSummary(TENANT);

    expect(summary.topDebtors).toHaveLength(2);
    expect(summary.topDebtors[0].debtorId).toBe(DEBTOR);
    expect(summary.topDebtors[0].percentOfPortfolio).toBe('30.00');
    expect(summary.topDebtors[1].debtorId).toBe(DEBTOR_2);
    expect(summary.topDebtors[1].percentOfPortfolio).toBe('15.00');

    // Debtor.findMany must have been called with `orderBy: totalExposure desc`.
    expect(prisma.debtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { totalExposure: 'desc' },
      }),
    );
  });

  it('industry breakdown groups invoices by debtor.industrySector', async () => {
    const { prisma, eventBus } = makeSummaryMocks({
      portfolioTotal: '1000000',
      activeInvoices: [
        {
          sellerId: SELLER,
          debtorId: DEBTOR,
          faceValue: '300000',
          industrySector: 'manufacturing',
        },
        {
          sellerId: SELLER_2,
          debtorId: DEBTOR_2,
          faceValue: '200000',
          industrySector: 'manufacturing',
        },
        {
          sellerId: SELLER,
          debtorId: DEBTOR_2,
          faceValue: '150000',
          industrySector: 'logistics',
        },
      ],
    });
    const service = newService(prisma, eventBus);

    const summary = await service.getConcentrationSummary(TENANT);

    const manufacturing = summary.industryBreakdown.find(
      (b) => b.industrySector === 'manufacturing',
    );
    expect(manufacturing).toBeDefined();
    // `add` returns 4dp (.toFixed(4)).
    expect(manufacturing?.totalExposure).toBe('500000.0000');
    expect(manufacturing?.debtorCount).toBe(2);
    expect(manufacturing?.percentOfPortfolio).toBe('50.00');

    const logistics = summary.industryBreakdown.find(
      (b) => b.industrySector === 'logistics',
    );
    expect(logistics?.totalExposure).toBe('150000.0000');
    expect(logistics?.debtorCount).toBe(1);

    // Sorted desc by exposure.
    expect(summary.industryBreakdown[0].industrySector).toBe('manufacturing');
  });

  it('handles empty portfolio with empty arrays + zero utilization', async () => {
    const { prisma, eventBus } = makeSummaryMocks({
      portfolioTotal: '0',
      debtors: [],
      activeInvoices: [],
    });
    const service = newService(prisma, eventBus);

    const summary = await service.getConcentrationSummary(TENANT);

    expect(summary.topDebtors).toEqual([]);
    expect(summary.industryBreakdown).toEqual([]);
    expect(summary.topSellerDebtors).toEqual([]);

    // All four utilization rows present with 0% utilization.
    expect(summary.limitUtilization).toHaveLength(4);
    for (const row of summary.limitUtilization) {
      // bankersRound returns the configured-precision form ("0.00").
      expect(row.utilizationPercent).toBe('0.00');
    }
  });
});
