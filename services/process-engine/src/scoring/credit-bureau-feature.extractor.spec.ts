import {
  CreditBureauFeatureExtractor,
  ICreditBureauGateway,
} from './credit-bureau-feature.extractor';

function makePrisma() {
  return {
    customerFinancialData: {
      create: jest.fn().mockResolvedValue({ id: 'cf-1' }),
    },
  } as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('CreditBureauFeatureExtractor', () => {
  it('returns null when consent is missing (does NOT call bureau)', async () => {
    const bureau: ICreditBureauGateway = { queryReport: jest.fn() };
    const ex = new CreditBureauFeatureExtractor(makePrisma(), bureau);

    const out = await ex.extractFeatures('t', 'c', 'GHA-123', /* consent */ false);
    expect(out).toBeNull();
    expect(bureau.queryReport).not.toHaveBeenCalled();
  });

  it('returns null when nationalId is missing', async () => {
    const bureau: ICreditBureauGateway = { queryReport: jest.fn() };
    const ex = new CreditBureauFeatureExtractor(makePrisma(), bureau);

    const out = await ex.extractFeatures('t', 'c', null, /* consent */ true);
    expect(out).toBeNull();
    expect(bureau.queryReport).not.toHaveBeenCalled();
  });

  it('returns null when bureau gateway is not wired', async () => {
    const ex = new CreditBureauFeatureExtractor(makePrisma());
    const out = await ex.extractFeatures('t', 'c', 'GHA-123', true);
    expect(out).toBeNull();
  });

  it('returns features when bureau returns a report', async () => {
    const bureau: ICreditBureauGateway = {
      queryReport: jest.fn().mockResolvedValue({
        customerId: 'c',
        bureauScore: 720,
        scoreRange: { min: 300, max: 850 },
        activeLoans: 1,
        totalOutstanding: '2500.0000',
        defaultHistory: { count: 0, totalAmount: '0.0000' },
        enquiryCount: 3,
        lastUpdated: new Date(),
        bureauType: 'ghana_xcb',
      }),
    };
    const prisma = makePrisma();
    const ex = new CreditBureauFeatureExtractor(prisma, bureau);

    const out = await ex.extractFeatures('t', 'c', 'GHA-123', true);
    expect(out).toEqual({
      bureauScore: 720,
      bureauScoreRange: { min: 300, max: 850 },
      activeLoans: 1,
      totalOutstanding: '2500.0000',
      defaultCount: 0,
      enquiryCount: 3,
      bureauAvailable: true,
      bureauType: 'ghana_xcb',
    });
    expect(prisma.customerFinancialData.create).toHaveBeenCalledTimes(1);
    const args = prisma.customerFinancialData.create.mock.calls[0][0];
    expect(args.data.source).toBe('credit_bureau');
    expect(args.data.sourceProvider).toBe('ghana_xcb');
  });

  it('returns null and does not throw when bureau errors', async () => {
    const bureau: ICreditBureauGateway = {
      queryReport: jest.fn().mockRejectedValue(new Error('502')),
    };
    const ex = new CreditBureauFeatureExtractor(makePrisma(), bureau);

    const out = await ex.extractFeatures('t', 'c', 'GHA-123', true);
    expect(out).toBeNull();
  });

  it('returns null when bureau times out (>10s)', async () => {
    jest.useFakeTimers();
    const bureau: ICreditBureauGateway = {
      queryReport: jest.fn().mockImplementation(
        () =>
          new Promise(() => {
            // never resolves
          }),
      ),
    };
    const ex = new CreditBureauFeatureExtractor(makePrisma(), bureau);

    const p = ex.extractFeatures('t', 'c', 'GHA-123', true);
    jest.advanceTimersByTime(10_001);
    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });
});
