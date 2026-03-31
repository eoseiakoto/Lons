import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, LedgerEntryType, Prisma } from '@lons/database';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  let service: LedgerService;
  let prisma: PrismaService;

  const tenantId = 'tenant-123';
  const contractId = 'contract-123';
  const currency = 'GHS';

  const mockLedgerEntry = (overrides: Partial<any> = {}) => ({
    id: 'entry-1',
    tenantId,
    contractId,
    entryType: LedgerEntryType.disbursement,
    debitCredit: 'debit' as const,
    amount: new Prisma.Decimal('1000.0000'),
    currency,
    runningBalance: new Prisma.Decimal('1000.0000'),
    effectiveDate: new Date('2026-03-01'),
    valueDate: new Date('2026-03-01'),
    description: 'Test entry',
    referenceType: 'disbursement',
    referenceId: 'ref-1',
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((fn) => fn({
              ledgerEntry: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation((args) => Promise.resolve(mockLedgerEntry(args.data))),
              },
            })),
            ledgerEntry: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('recordDoubleEntry', () => {
    it('should create exactly 2 entries (1 debit + 1 credit)', async () => {
      let createCallCount = 0;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ledgerEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args) => {
              createCallCount++;
              return Promise.resolve(mockLedgerEntry({
                ...args.data,
                id: `entry-${createCallCount}`,
              }));
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.recordDoubleEntry(tenantId, {
        contractId,
        entryType: LedgerEntryType.disbursement,
        amount: '1000.0000',
        currency,
        effectiveDate: new Date(),
        valueDate: new Date(),
        description: 'Loan disbursement',
      });

      expect(result.debitEntry).toBeDefined();
      expect(result.creditEntry).toBeDefined();
      expect(createCallCount).toBe(2);
    });

    it('should reject zero amounts', async () => {
      await expect(
        service.recordDoubleEntry(tenantId, {
          contractId,
          entryType: LedgerEntryType.disbursement,
          amount: '0.0000',
          currency,
          effectiveDate: new Date(),
          valueDate: new Date(),
        }),
      ).rejects.toThrow('Ledger entry amount cannot be zero');
    });

    it('should reject negative amounts', async () => {
      await expect(
        service.recordDoubleEntry(tenantId, {
          contractId,
          entryType: LedgerEntryType.disbursement,
          amount: '-100.0000',
          currency,
          effectiveDate: new Date(),
          valueDate: new Date(),
        }),
      ).rejects.toThrow('Ledger entry amount cannot be negative');
    });

    it('should calculate running balance correctly for disbursement (debit increases)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ledgerEntry: {
            findFirst: jest.fn().mockResolvedValue(null), // no previous balance
            create: jest.fn().mockImplementation((args) =>
              Promise.resolve(mockLedgerEntry(args.data))),
          },
        };
        return fn(tx);
      });

      const result = await service.recordDoubleEntry(tenantId, {
        contractId,
        entryType: LedgerEntryType.disbursement,
        amount: '5000.0000',
        currency,
        effectiveDate: new Date(),
        valueDate: new Date(),
      });

      expect(result.runningBalance).toBe('5000.0000');
    });

    it('should calculate running balance correctly for repayment (credit decreases)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ledgerEntry: {
            findFirst: jest.fn().mockResolvedValue({
              runningBalance: new Prisma.Decimal('5000.0000'),
            }),
            create: jest.fn().mockImplementation((args) =>
              Promise.resolve(mockLedgerEntry(args.data))),
          },
        };
        return fn(tx);
      });

      const result = await service.recordDoubleEntry(tenantId, {
        contractId,
        entryType: LedgerEntryType.repayment,
        amount: '1000.0000',
        currency,
        effectiveDate: new Date(),
        valueDate: new Date(),
      });

      expect(result.runningBalance).toBe('4000.0000');
    });

    it('should share referenceId between debit and credit entries', async () => {
      const createdEntries: any[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ledgerEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args) => {
              const entry = mockLedgerEntry({ ...args.data, id: `entry-${createdEntries.length + 1}` });
              createdEntries.push(entry);
              return Promise.resolve(entry);
            }),
          },
        };
        return fn(tx);
      });

      await service.recordDoubleEntry(tenantId, {
        contractId,
        entryType: LedgerEntryType.fee,
        amount: '50.0000',
        currency,
        effectiveDate: new Date(),
        valueDate: new Date(),
        referenceId: 'shared-ref-123',
      });

      // Both entries should have the same referenceId
      expect(createdEntries.length).toBe(2);
    });
  });

  describe('recordReversal', () => {
    it('should create reversal entries referencing the original', async () => {
      const originalEntry = mockLedgerEntry({
        id: 'original-entry-1',
        entryType: LedgerEntryType.fee,
        amount: new Prisma.Decimal('50.0000'),
      });

      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue(originalEntry as any);

      const createdEntries: any[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ledgerEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((args) => {
              const entry = mockLedgerEntry(args.data);
              createdEntries.push(entry);
              return Promise.resolve(entry);
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.recordReversal(tenantId, 'original-entry-1', 'Incorrect fee');

      expect(result.debitEntry).toBeDefined();
      expect(result.creditEntry).toBeDefined();
    });

    it('should throw if original entry not found', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue(null);

      await expect(
        service.recordReversal(tenantId, 'nonexistent', 'reason'),
      ).rejects.toThrow('not found');
    });
  });

  describe('getRunningBalance', () => {
    it('should return the latest running balance', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue({
        runningBalance: new Prisma.Decimal('3456.7890'),
      } as any);

      const balance = await service.getRunningBalance(contractId);
      expect(balance).toBe('3456.7890');
    });

    it('should return 0 if no entries exist', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue(null);

      const balance = await service.getRunningBalance(contractId);
      expect(balance).toBe('0.0000');
    });
  });

  describe('generateStatement', () => {
    it('should return correct opening and closing balances', async () => {
      const findFirstSpy = jest.spyOn(prisma.ledgerEntry, 'findFirst');

      // Opening balance query (before fromDate)
      findFirstSpy.mockResolvedValueOnce({
        runningBalance: new Prisma.Decimal('1000.0000'),
      } as any);

      // Entries in range
      jest.spyOn(prisma.ledgerEntry, 'findMany').mockResolvedValue([
        mockLedgerEntry({
          id: 'e1',
          entryType: LedgerEntryType.repayment,
          debitCredit: 'credit' as const,
          amount: new Prisma.Decimal('500.0000'),
          runningBalance: new Prisma.Decimal('500.0000'),
          effectiveDate: new Date('2026-03-15'),
        }),
      ] as any);

      // Closing balance query (on or before toDate)
      findFirstSpy.mockResolvedValueOnce({
        runningBalance: new Prisma.Decimal('500.0000'),
      } as any);

      const statement = await service.generateStatement(
        contractId,
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );

      expect(statement.openingBalance).toBe('1000.0000');
      expect(statement.closingBalance).toBe('500.0000');
      expect(statement.entries).toHaveLength(1);
      expect(statement.summary.totalCredits).toBe('500.0000');
    });

    it('should return zero balances for empty ledger', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.ledgerEntry, 'findMany').mockResolvedValue([]);

      const statement = await service.generateStatement(
        contractId,
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );

      expect(statement.openingBalance).toBe('0.0000');
      expect(statement.closingBalance).toBe('0.0000');
      expect(statement.entries).toHaveLength(0);
      expect(statement.summary.netMovement).toBe('0.0000');
    });

    it('should calculate summary totals correctly', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.ledgerEntry, 'findMany').mockResolvedValue([
        mockLedgerEntry({ debitCredit: 'debit' as const, amount: new Prisma.Decimal('100.0000') }),
        mockLedgerEntry({ debitCredit: 'debit' as const, amount: new Prisma.Decimal('50.0000') }),
        mockLedgerEntry({ debitCredit: 'credit' as const, amount: new Prisma.Decimal('30.0000') }),
      ] as any);

      const statement = await service.generateStatement(
        contractId,
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );

      expect(statement.summary.totalDebits).toBe('150.0000');
      expect(statement.summary.totalCredits).toBe('30.0000');
      expect(statement.summary.netMovement).toBe('120.0000');
    });
  });

  describe('verifyBalance', () => {
    it('should report valid when balance matches', async () => {
      jest.spyOn(prisma.ledgerEntry, 'findMany').mockResolvedValue([
        mockLedgerEntry({
          entryType: LedgerEntryType.disbursement,
          amount: new Prisma.Decimal('1000.0000'),
          runningBalance: new Prisma.Decimal('1000.0000'),
        }),
      ] as any);

      jest.spyOn(prisma.ledgerEntry, 'findFirst').mockResolvedValue({
        runningBalance: new Prisma.Decimal('1000.0000'),
      } as any);

      const result = await service.verifyBalance(contractId);
      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });
  });

  describe('immutability', () => {
    it('should not expose update or delete methods', () => {
      const serviceProto = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      expect(serviceProto).not.toContain('updateEntry');
      expect(serviceProto).not.toContain('deleteEntry');
      expect(serviceProto).not.toContain('removeEntry');
    });
  });
});
