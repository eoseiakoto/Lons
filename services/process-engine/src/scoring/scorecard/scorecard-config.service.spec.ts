import { ScorecardConfigService } from './scorecard-config.service';
import { DEFAULT_SCORECARD } from './default-scorecard';
import { ScorecardConfig } from './scorecard-engine';

function makePrismaMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const baseFindFirst = jest.fn().mockResolvedValue(null);
  return {
    scorecardConfig: {
      findFirst: overrides.findFirst ?? baseFindFirst,
      findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: overrides.findUniqueOrThrow ?? jest.fn(),
      create: overrides.create ?? jest.fn(),
      update: overrides.update ?? jest.fn().mockResolvedValue({}),
      updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // For most tests we pass the same scorecardConfig namespace as the tx client.
      return fn({
        scorecardConfig: {
          findFirst: overrides.findFirst ?? baseFindFirst,
          findUniqueOrThrow: overrides.findUniqueOrThrow ?? jest.fn(),
          create: overrides.create ?? jest.fn(),
          update: overrides.update ?? jest.fn().mockResolvedValue({}),
          updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({}),
        },
      });
    }),
  } as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const SAMPLE_SCORECARD: ScorecardConfig = {
  version: '2.0-test',
  scoreRange: { min: 0, max: 1000 },
  factors: [
    {
      name: 'payment_history_pct',
      weight: 100,
      bands: [
        { min: 90, max: null, points: 100 },
        { min: 0, max: 89, points: 0 },
      ],
    },
  ],
  riskTiers: [
    { tier: 'low', minScore: 750 },
    { tier: 'critical', minScore: 0 },
  ],
  limitBands: [{ minScore: 0, maxScore: 1000, limitMultiplier: '1.0' }],
};

describe('ScorecardConfigService', () => {
  describe('getActiveScorecard (fallback chain)', () => {
    it('uses the product-specific scorecard when present', async () => {
      const findFirst = jest.fn().mockImplementation(({ where }) => {
        if (where?.productId === 'p-1') {
          return Promise.resolve({ id: 's-prod', config: SAMPLE_SCORECARD });
        }
        return Promise.resolve(null);
      });
      const prisma = makePrismaMock({ findFirst });
      const svc = new ScorecardConfigService(prisma);

      const out = await svc.getActiveScorecard('t-1', 'p-1');
      expect(out.version).toBe('2.0-test');
      expect(findFirst).toHaveBeenCalled();
    });

    it('falls back to tenant default (productId=null) when no product scorecard', async () => {
      const tenantDefault: ScorecardConfig = { ...SAMPLE_SCORECARD, version: '2.0-tenant' };
      const findFirst = jest.fn().mockImplementation(({ where }) => {
        if (where?.productId === 'p-1') return Promise.resolve(null);
        if (where?.productId === null) {
          return Promise.resolve({ id: 's-default', config: tenantDefault });
        }
        return Promise.resolve(null);
      });
      const prisma = makePrismaMock({ findFirst });
      const svc = new ScorecardConfigService(prisma);

      const out = await svc.getActiveScorecard('t-1', 'p-1');
      expect(out.version).toBe('2.0-tenant');
    });

    it('falls back to hardcoded DEFAULT_SCORECARD when no DB rows exist', async () => {
      const prisma = makePrismaMock({ findFirst: jest.fn().mockResolvedValue(null) });
      const svc = new ScorecardConfigService(prisma);

      const out = await svc.getActiveScorecard('t-1', 'p-1');
      expect(out).toBe(DEFAULT_SCORECARD);
    });

    it('falls back to DEFAULT_SCORECARD when a persisted config is malformed', async () => {
      const findFirst = jest.fn().mockResolvedValueOnce({
        id: 's-bad',
        // Intentionally invalid: no factors.
        config: { version: '0.1', scoreRange: { min: 0, max: 100 }, factors: [], riskTiers: [], limitBands: [] },
      });
      const prisma = makePrismaMock({ findFirst });
      const svc = new ScorecardConfigService(prisma);

      const out = await svc.getActiveScorecard('t-1', 'p-1');
      expect(out).toBe(DEFAULT_SCORECARD);
    });
  });

  describe('create', () => {
    it('rejects invalid scorecards', async () => {
      const prisma = makePrismaMock();
      const svc = new ScorecardConfigService(prisma);
      await expect(
        svc.create('t-1', {
          name: 'bad',
          version: '0.1',
          config: { ...SAMPLE_SCORECARD, scoreRange: { min: 100, max: 100 } },
        }),
      ).rejects.toThrow(/scoreRange/);
    });
  });
});
