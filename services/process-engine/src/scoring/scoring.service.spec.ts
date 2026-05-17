import { ScoringService } from './scoring.service';
import { ScorecardConfigService } from './scorecard/scorecard-config.service';
import { CreditBureauFeatureExtractor } from './credit-bureau-feature.extractor';
import { DEFAULT_SCORECARD } from './scorecard/default-scorecard';

function basePrisma() {
  return {
    customer: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'c-1',
        createdAt: new Date('2024-01-01'),
        kycLevel: 'tier_2',
        nationalId: 'GHA-123',
      }),
    },
    contract: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    repaymentScheduleEntry: { count: jest.fn().mockResolvedValue(0) },
    customerFinancialData: { findFirst: jest.fn().mockResolvedValue(null) },
    customerConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    scoringResult: {
      create: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
        id: 's-1',
        ...(data as Record<string, unknown>),
      })),
    },
  } as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('ScoringService (S17 wiring)', () => {
  it('falls back to neutral defaults and "minimal" confidence when no EMI/bureau data', async () => {
    const prisma = basePrisma();
    const svc = new ScoringService(prisma);
    await svc.scoreCustomer('t', 'c-1', 'p-1', 'application', '1000.0000');

    const createCall = prisma.scoringResult.create.mock.calls[0][0];
    const features = createCall.data.inputFeatures as Record<string, unknown>;
    expect(features.transaction_frequency).toBe(15);
    expect(features.income_consistency).toBe(60);
    const meta = features._metadata as Record<string, unknown>;
    expect(meta.dataCompleteness).toBe('minimal');
    expect(meta.bureauAvailable).toBe(false);
    expect(meta.emiDataAge).toBeNull();
  });

  it('uses EMI snapshot values and reports "partial_no_bureau"', async () => {
    const prisma = basePrisma();
    const fetchedAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    prisma.customerFinancialData.findFirst = jest.fn().mockImplementation(({ where }: { where: { source: string } }) => {
      if (where.source === 'emi') {
        return Promise.resolve({
          tenantId: 't', customerId: 'c-1', source: 'emi',
          transactionCount30d: 42,
          incomeConsistency: 85,
          averageBalance30d: { toString: () => '550.0000' } as unknown as number,
          fetchedAt,
          rawData: {},
        });
      }
      return Promise.resolve(null);
    });
    const svc = new ScoringService(prisma);
    await svc.scoreCustomer('t', 'c-1', 'p-1', 'application', '1000.0000');

    const features = prisma.scoringResult.create.mock.calls[0][0].data.inputFeatures;
    expect(features.transaction_frequency).toBe(42);
    expect(features.income_consistency).toBe(85);
    expect(features.average_balance).toBeGreaterThan(0);
    expect(features._metadata.dataCompleteness).toBe('partial_no_bureau');
    expect(features._metadata.emiDataAge).toBeGreaterThanOrEqual(0.9);
    expect(features._metadata.emiDataAge).toBeLessThan(1.5);
  });

  it('resolves the scorecard from ScorecardConfigService when provided', async () => {
    const prisma = basePrisma();
    const scorecardSvc = {
      getActiveScorecard: jest.fn().mockResolvedValue({
        ...DEFAULT_SCORECARD,
        version: '99.0-custom',
      }),
    } as unknown as ScorecardConfigService;

    const svc = new ScoringService(prisma, scorecardSvc);
    await svc.scoreCustomer('t', 'c-1', 'p-1', 'application', '1000.0000');

    expect(scorecardSvc.getActiveScorecard).toHaveBeenCalledWith('t', 'p-1');
    const createCall = prisma.scoringResult.create.mock.calls[0][0];
    expect(createCall.data.modelVersion).toBe('99.0-custom');
  });

  it('reports "full" confidence and pulls bureau features when consent is granted', async () => {
    const prisma = basePrisma();
    prisma.customerFinancialData.findFirst = jest.fn().mockImplementation(({ where }: { where: { source: string } }) => {
      if (where.source === 'emi') {
        return Promise.resolve({
          tenantId: 't', customerId: 'c-1', source: 'emi',
          transactionCount30d: 30, incomeConsistency: 70,
          averageBalance30d: { toString: () => '300.0000' } as unknown as number,
          fetchedAt: new Date(),
          rawData: {},
        });
      }
      return Promise.resolve(null);
    });
    prisma.customerConsent.findFirst = jest.fn().mockResolvedValue({ id: 'cc-1' });

    const bureauExtractor = {
      extractFeatures: jest.fn().mockResolvedValue({
        bureauScore: 720,
        bureauScoreRange: { min: 300, max: 850 },
        activeLoans: 1,
        totalOutstanding: '2500.0000',
        defaultCount: 0,
        enquiryCount: 3,
        bureauAvailable: true,
        bureauType: 'ghana_xcb',
      }),
    } as unknown as CreditBureauFeatureExtractor;

    const svc = new ScoringService(prisma, undefined, bureauExtractor);
    await svc.scoreCustomer('t', 'c-1', 'p-1', 'application', '1000.0000');

    const features = prisma.scoringResult.create.mock.calls[0][0].data.inputFeatures;
    expect(features.credit_bureau_score).toBeGreaterThan(0);
    expect(features._metadata.bureauAvailable).toBe(true);
    expect(features._metadata.dataCompleteness).toBe('full');
  });

  it('skips bureau extractor when consent is not granted', async () => {
    const prisma = basePrisma();
    prisma.customerConsent.findFirst = jest.fn().mockResolvedValue(null);
    const bureauExtractor = { extractFeatures: jest.fn() } as unknown as CreditBureauFeatureExtractor;

    const svc = new ScoringService(prisma, undefined, bureauExtractor);
    await svc.scoreCustomer('t', 'c-1', 'p-1', 'application', '1000.0000');

    expect(bureauExtractor.extractFeatures).toHaveBeenCalledWith(
      't', 'c-1', 'GHA-123', /* consent */ false,
    );
  });
});
