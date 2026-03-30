import { PredictiveRiskService } from '../predictive-risk.service';

describe('PredictiveRiskService', () => {
  let service: PredictiveRiskService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      contract: {
        findFirst: jest.fn(),
      },
    };
    service = new PredictiveRiskService(mockPrisma);
  });

  const makeContract = (overrides: Record<string, any> = {}) => ({
    id: 'contract-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    daysPastDue: 0,
    totalOutstanding: 5000,
    principalAmount: 10000,
    interestRate: 12,
    tenorDays: 90,
    status: 'active',
    customer: { id: 'customer-1', phone: '+233245678901' },
    product: { type: 'micro_loan', repaymentMethod: 'equal_installments' },
    repayments: [],
    repaymentSchedule: [],
    ...overrides,
  });

  it('should throw NotFoundError for non-existent contract', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(null);
    await expect(
      service.predictDefaultRisk('tenant-1', 'non-existent'),
    ).rejects.toThrow('Contract');
  });

  it('should return low risk for a performing contract with no DPD', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        daysPastDue: 0,
        repayments: [
          { amount: 1000, createdAt: new Date() },
          { amount: 1000, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ],
        repaymentSchedule: [
          { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), status: 'paid' },
          { dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), status: 'pending' },
        ],
      }),
    );

    const result = await service.predictDefaultRisk('tenant-1', 'contract-1');

    expect(result.contractId).toBe('contract-1');
    expect(Number(result.probabilityOfDefault)).toBeLessThan(50);
    expect(result.predictedDaysToDefault).toBeGreaterThan(0);
    expect(result.confidence).toBeDefined();
    expect(Number(result.confidence)).toBeGreaterThan(0);
    expect(Number(result.confidence)).toBeLessThanOrEqual(1);
    expect(result.assessedAt).toBeInstanceOf(Date);
  });

  it('should return high risk for a severely delinquent contract (90+ DPD)', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        daysPastDue: 120,
        totalOutstanding: 15000,
        repayments: [],
        repaymentSchedule: [
          { dueDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), status: 'overdue' },
          { dueDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), status: 'overdue' },
          { dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), status: 'overdue' },
        ],
      }),
    );

    const result = await service.predictDefaultRisk('tenant-1', 'contract-1');

    expect(Number(result.probabilityOfDefault)).toBeGreaterThan(60);
    expect(result.topRiskFactors.length).toBeGreaterThan(0);
    expect(result.topRiskFactors.some((f) => f.impact === 'high')).toBe(true);
  });

  it('should return moderate risk for 30-60 DPD with some payments', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        daysPastDue: 45,
        repayments: [
          { amount: 500, createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
          { amount: 300, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ],
        repaymentSchedule: [
          { dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), status: 'paid' },
          { dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), status: 'overdue' },
          { dueDate: new Date(Date.now()), status: 'overdue' },
        ],
      }),
    );

    const result = await service.predictDefaultRisk('tenant-1', 'contract-1');

    expect(Number(result.probabilityOfDefault)).toBeGreaterThan(30);
    expect(Number(result.probabilityOfDefault)).toBeLessThan(90);
  });

  it('should have probability clamped between 0 and 100', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({ daysPastDue: 0 }),
    );

    const result = await service.predictDefaultRisk('tenant-1', 'contract-1');

    expect(Number(result.probabilityOfDefault)).toBeGreaterThanOrEqual(0);
    expect(Number(result.probabilityOfDefault)).toBeLessThanOrEqual(100);
  });

  it('should return lower confidence with fewer data points', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({ repayments: [], repaymentSchedule: [] }),
    );

    const resultNoData = await service.predictDefaultRisk('tenant-1', 'contract-1');

    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        repayments: Array.from({ length: 10 }, (_, i) => ({
          amount: 1000,
          createdAt: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000),
        })),
        repaymentSchedule: Array.from({ length: 5 }, (_, i) => ({
          dueDate: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000),
          status: 'paid',
        })),
      }),
    );

    const resultWithData = await service.predictDefaultRisk('tenant-1', 'contract-1');

    expect(Number(resultNoData.confidence)).toBeLessThan(Number(resultWithData.confidence));
  });

  it('should include risk factors when balance exceeds principal', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        daysPastDue: 60,
        totalOutstanding: 15000,
        principalAmount: 10000,
        repayments: [],
        repaymentSchedule: [
          { dueDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), status: 'overdue' },
        ],
      }),
    );

    const result = await service.predictDefaultRisk('tenant-1', 'contract-1');

    const balanceFactor = result.topRiskFactors.find(
      (f) => f.factor === 'balance_exceeds_principal',
    );
    expect(balanceFactor).toBeDefined();
    expect(balanceFactor?.impact).toBe('high');
  });
});
