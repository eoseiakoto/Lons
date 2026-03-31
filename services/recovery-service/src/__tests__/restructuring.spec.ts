import { RestructuringService } from '../restructuring.service';

describe('RestructuringService', () => {
  let service: RestructuringService;
  let mockPrisma: any;
  let mockEventBus: any;
  let mockScheduleService: any;

  beforeEach(() => {
    mockPrisma = {
      contract: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    mockEventBus = {
      emitAndBuild: jest.fn(),
    };
    mockScheduleService = {
      createSchedule: jest.fn().mockResolvedValue([
        { installmentNumber: 1, dueDate: new Date(), totalAmount: 1000 },
        { installmentNumber: 2, dueDate: new Date(), totalAmount: 1000 },
      ]),
    };

    service = new RestructuringService(mockPrisma, mockEventBus, mockScheduleService);
  });

  const makeContract = (overrides: Record<string, any> = {}) => ({
    id: 'contract-1',
    tenantId: 'tenant-1',
    tenorDays: 90,
    interestRate: 12,
    totalOutstanding: 5000,
    outstandingPenalties: 200,
    outstandingPrincipal: 4000,
    outstandingInterest: 600,
    outstandingFees: 200,
    principalAmount: 10000,
    startDate: new Date('2026-01-01'),
    maturityDate: new Date('2026-04-01'),
    status: 'active',
    restructured: false,
    restructureCount: 0,
    metadata: null,
    product: { type: 'micro_loan', repaymentMethod: 'equal_installments' },
    ...overrides,
  });

  it('should throw NotFoundError for non-existent contract', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(null);

    await expect(
      service.restructureLoan('tenant-1', 'non-existent', { reason: 'test' }),
    ).rejects.toThrow('Contract');
  });

  it('should throw ValidationError for settled contract', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ status: 'settled' }));

    await expect(
      service.restructureLoan('tenant-1', 'contract-1', { reason: 'test' }),
    ).rejects.toThrow('settled or cancelled');
  });

  it('should throw ValidationError for written-off contract', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ status: 'written_off' }));

    await expect(
      service.restructureLoan('tenant-1', 'contract-1', { reason: 'test' }),
    ).rejects.toThrow('written-off');
  });

  it('should restructure a loan with tenor extension', async () => {
    const contract = makeContract();
    mockPrisma.contract.findFirst.mockResolvedValue(contract);
    mockPrisma.$transaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        contract: { update: jest.fn() },
        repaymentScheduleEntry: { deleteMany: jest.fn() },
      };
      await fn(tx);
      return { restructureCount: 1, newMaturityDate: new Date() };
    });

    const result = await service.restructureLoan('tenant-1', 'contract-1', {
      newTenorDays: 120,
      reason: 'Customer requested extension',
    });

    expect(result.success).toBe(true);
    expect(result.originalTenorDays).toBe(90);
    expect(result.newTenorDays).toBe(120);
    expect(result.restructureCount).toBe(1);
    expect(result.newScheduleEntries).toBe(2);
    expect(mockScheduleService.createSchedule).toHaveBeenCalledWith('tenant-1', 'contract-1');
    expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
      'loan.restructured',
      'tenant-1',
      expect.objectContaining({
        contractId: 'contract-1',
        originalTenorDays: 90,
        newTenorDays: 120,
      }),
    );
  });

  it('should waive penalties and adjust outstanding', async () => {
    const contract = makeContract({ outstandingPenalties: 200, totalOutstanding: 5000 });
    mockPrisma.contract.findFirst.mockResolvedValue(contract);
    mockPrisma.$transaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        contract: { update: jest.fn() },
        repaymentScheduleEntry: { deleteMany: jest.fn() },
      };
      await fn(tx);
      return { restructureCount: 1 };
    });

    const result = await service.restructureLoan('tenant-1', 'contract-1', {
      penaltyWaiver: true,
      reason: 'Penalty waiver',
    });

    expect(result.success).toBe(true);
    // newOutstanding should be totalOutstanding - penalties = 5000 - 200 = 4800
    expect(Number(result.newOutstanding)).toBeCloseTo(4800, 2);
    expect(Number(result.originalOutstanding)).toBeCloseTo(5000, 2);
  });

  it('should add payment holiday days to tenor', async () => {
    const contract = makeContract({ tenorDays: 90 });
    mockPrisma.contract.findFirst.mockResolvedValue(contract);
    mockPrisma.$transaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        contract: { update: jest.fn() },
        repaymentScheduleEntry: { deleteMany: jest.fn() },
      };
      await fn(tx);
      return { restructureCount: 1 };
    });

    const result = await service.restructureLoan('tenant-1', 'contract-1', {
      paymentHolidayDays: 14,
      reason: 'Payment holiday',
    });

    expect(result.success).toBe(true);
    // tenor = 90 + 14 = 104
    expect(result.newTenorDays).toBe(104);
  });

  it('should modify interest rate', async () => {
    const contract = makeContract({ interestRate: 12 });
    mockPrisma.contract.findFirst.mockResolvedValue(contract);
    mockPrisma.$transaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        contract: { update: jest.fn() },
        repaymentScheduleEntry: { deleteMany: jest.fn() },
      };
      await fn(tx);
      return { restructureCount: 1 };
    });

    const result = await service.restructureLoan('tenant-1', 'contract-1', {
      newInterestRate: '8.0000',
      reason: 'Rate reduction',
    });

    expect(result.success).toBe(true);
    expect(result.newInterestRate).toBe('8.0000');
    expect(result.originalInterestRate).toBe('12.0000');
  });

  it('should use Decimal strings for all monetary values', async () => {
    const contract = makeContract();
    mockPrisma.contract.findFirst.mockResolvedValue(contract);
    mockPrisma.$transaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        contract: { update: jest.fn() },
        repaymentScheduleEntry: { deleteMany: jest.fn() },
      };
      await fn(tx);
      return { restructureCount: 1 };
    });

    const result = await service.restructureLoan('tenant-1', 'contract-1', {
      reason: 'test',
    });

    expect(typeof result.originalOutstanding).toBe('string');
    expect(typeof result.newOutstanding).toBe('string');
    expect(typeof result.originalInterestRate).toBe('string');
    expect(typeof result.newInterestRate).toBe('string');
    expect(result.originalOutstanding).toMatch(/^\d+\.\d{4}$/);
    expect(result.newOutstanding).toMatch(/^\d+\.\d{4}$/);
  });

  it('should throw ValidationError for non-positive tenor', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract());

    await expect(
      service.restructureLoan('tenant-1', 'contract-1', {
        newTenorDays: -5,
        reason: 'test',
      }),
    ).rejects.toThrow('New tenor must be positive');
  });
});
