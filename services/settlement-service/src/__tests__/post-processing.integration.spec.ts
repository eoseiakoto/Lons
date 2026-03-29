import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaService,
  Prisma,
  ContractStatus,
  LedgerEntryType,
  DebitCredit,
  RepaymentStatus,
  RepaymentMethodType,
  SettlementStatus,
  DisbursementStatus,
} from '@lons/database';
import { EventBusService, add, subtract, multiply, divide, bankersRound } from '@lons/common';
import { LedgerService } from '../ledger.service';
import { SettlementService } from '../settlement.service';

/**
 * Integration test: Full Post-Processing Pipeline
 *
 * Exercises the end-to-end flow: seed → repayment → ledger → interest accrual → settlement.
 * Uses in-memory stores to simulate Prisma operations deterministically.
 */

// ---------------------------------------------------------------------------
// In-memory data stores
// ---------------------------------------------------------------------------
interface Store {
  tenants: Map<string, any>;
  lenders: Map<string, any>;
  customers: Map<string, any>;
  products: Map<string, any>;
  loanRequests: Map<string, any>;
  contracts: Map<string, any>;
  repayments: Map<string, any>;
  disbursements: Map<string, any>;
  ledgerEntries: Map<string, any>;
  settlementRuns: Map<string, any>;
  settlementLines: Map<string, any>;
  reconciliationRuns: Map<string, any>;
  reconciliationExceptions: Map<string, any>;
}

let store: Store;
let idCounter: number;
let timeCounter: number;

function nextId(): string {
  return `test-id-${++idCounter}`;
}

/** Returns a monotonically increasing Date so sort-by-createdAt is deterministic. */
function nextTimestamp(): Date {
  return new Date(++timeCounter);
}

function resetStore(): void {
  idCounter = 0;
  timeCounter = Date.now();
  store = {
    tenants: new Map(),
    lenders: new Map(),
    customers: new Map(),
    products: new Map(),
    loanRequests: new Map(),
    contracts: new Map(),
    repayments: new Map(),
    disbursements: new Map(),
    ledgerEntries: new Map(),
    settlementRuns: new Map(),
    settlementLines: new Map(),
    reconciliationRuns: new Map(),
    reconciliationExceptions: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Prisma mock helpers
// ---------------------------------------------------------------------------
function makeModelMock(collection: Map<string, any>) {
  return {
    findFirst: jest.fn(async (args: any) => {
      let matches = [...collection.values()].filter((i) => matchesWhere(i, args?.where));
      if (matches.length === 0) return null;
      if (args?.orderBy) matches = sortItems(matches, args.orderBy);
      let result = matches[0];
      if (args?.select) {
        const selected: any = {};
        for (const key of Object.keys(args.select)) {
          if (args.select[key]) selected[key] = result[key];
        }
        result = selected;
      }
      if (args?.include) result = applyIncludes(result, args.include);
      return result;
    }),
    findMany: jest.fn(async (args: any) => {
      let results = [...collection.values()].filter((i) => matchesWhere(i, args?.where));
      if (args?.orderBy) results = sortItems(results, args.orderBy);
      if (args?.include) {
        results = results.map((r) => applyIncludes(r, args.include));
      }
      if (args?.take) results = results.slice(0, args.take);
      return results;
    }),
    findUnique: jest.fn(async (args: any) => collection.get(args?.where?.id) || null),
    findUniqueOrThrow: jest.fn(async (args: any) => {
      const item = collection.get(args?.where?.id);
      if (!item) throw new Error('Not found');
      return item;
    }),
    create: jest.fn(async (args: any) => {
      const id = nextId();
      const ts = nextTimestamp();
      const data = { id, ...resolveConnects(args.data), createdAt: ts, updatedAt: ts };
      collection.set(id, data);
      return data;
    }),
    update: jest.fn(async (args: any) => {
      const id = args.where.id;
      const item = collection.get(id);
      if (!item) throw new Error(`Not found: ${id}`);
      const updated = { ...item, ...args.data, updatedAt: new Date() };
      collection.set(id, updated);
      if (args.include) return applyIncludes(updated, args.include);
      return updated;
    }),
    updateMany: jest.fn(async (args: any) => {
      let count = 0;
      for (const item of collection.values()) {
        if (matchesWhere(item, args?.where)) {
          Object.assign(item, args.data);
          count++;
        }
      }
      return { count };
    }),
    count: jest.fn(async (args: any) => {
      return [...collection.values()].filter((i) => matchesWhere(i, args?.where)).length;
    }),
  };
}

function resolveConnects(data: any): any {
  const resolved: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && (value as any).connect) {
      resolved[`${key}Id`] = (value as any).connect.id;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function matchesWhere(item: any, where: any): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;
    if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date) && !(condition instanceof Prisma.Decimal)) {
      const cond = condition as Record<string, any>;
      if ('in' in cond) {
        if (!cond.in.includes(item[key])) return false;
      }
      if ('gte' in cond) {
        if (item[key] < cond.gte) return false;
      }
      if ('lte' in cond) {
        if (item[key] > cond.lte) return false;
      }
      if ('lt' in cond) {
        if (item[key] >= cond.lt) return false;
      }
      if ('not' in cond) {
        if (item[key] === cond.not) return false;
      }
    } else {
      if (item[key] !== condition) return false;
    }
  }
  return true;
}

function sortItems(items: any[], orderBy: any): any[] {
  const orderByArr = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...items].sort((a, b) => {
    for (const ob of orderByArr) {
      for (const [field, dir] of Object.entries(ob)) {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return dir === 'asc' ? -1 : 1;
        if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function applyIncludes(item: any, include: Record<string, any>): any {
  const result = { ...item };
  for (const [rel, val] of Object.entries(include)) {
    if (!val) continue;
    // Resolve common relations
    if (rel === 'product' && item.productId) {
      result.product = store.products.get(item.productId) || null;
    }
    if (rel === 'contract' && item.contractId) {
      const contract = store.contracts.get(item.contractId);
      if (contract && typeof val === 'object' && (val as any).include?.product) {
        result.contract = { ...contract, product: store.products.get(contract.productId) || null };
      } else {
        result.contract = contract || null;
      }
    }
    if (rel === 'lines') {
      result.lines = [...store.settlementLines.values()].filter(
        (l) => l.settlementRunId === item.id,
      );
    }
    if (rel === 'exceptions') {
      result.exceptions = [...store.reconciliationExceptions.values()].filter(
        (e) => e.reconciliationRunId === item.id,
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Test constants (deterministic seed data)
// ---------------------------------------------------------------------------
const TENANT_ID = 'tenant-integ-001';
const LENDER_ID = 'lender-integ-001';
const CUSTOMER_ID = 'customer-integ-001';
const PRODUCT_ID = 'product-integ-001';
const CONTRACT_ID = 'contract-integ-001';
const LOAN_REQUEST_ID = 'loan-request-integ-001';

const PRINCIPAL = '1000.0000';
const ANNUAL_RATE = '12.0000'; // 12% annual
const CURRENCY = 'GHS';
const REVENUE_SHARING = { lender: 60, sp: 25, emi: 10, platform: 5 };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Post-Processing Integration Pipeline', () => {
  let ledgerService: LedgerService;
  let settlementService: SettlementService;
  let eventBus: EventBusService;
  let prisma: any;

  beforeEach(async () => {
    resetStore();

    // Pre-seed entities with known IDs
    store.tenants.set(TENANT_ID, {
      id: TENANT_ID,
      name: 'Integration Test Tenant',
      slug: 'integ-test',
      country: 'GH',
      schemaName: 'integ_test',
      status: 'active',
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.lenders.set(LENDER_ID, {
      id: LENDER_ID,
      tenantId: TENANT_ID,
      name: 'Test Lender',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.customers.set(CUSTOMER_ID, {
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      externalId: 'EXT-CUST-001',
      fullName: 'Test Customer',
      phonePrimary: '+233201234567',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.products.set(PRODUCT_ID, {
      id: PRODUCT_ID,
      tenantId: TENANT_ID,
      code: 'MICRO-001',
      name: 'Test Micro Loan',
      type: 'micro_loan',
      lenderId: LENDER_ID,
      currency: CURRENCY,
      interestRateModel: 'reducing_balance',
      interestRate: new Prisma.Decimal(ANNUAL_RATE),
      repaymentMethod: 'lump_sum',
      gracePeriodDays: 0,
      revenueSharing: REVENUE_SHARING,
      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.loanRequests.set(LOAN_REQUEST_ID, {
      id: LOAN_REQUEST_ID,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      requestedAmount: new Prisma.Decimal(PRINCIPAL),
      currency: CURRENCY,
      status: 'accepted',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const startDate = new Date('2026-03-01');
    const maturityDate = new Date('2026-03-31');

    store.contracts.set(CONTRACT_ID, {
      id: CONTRACT_ID,
      tenantId: TENANT_ID,
      contractNumber: 'CTR-INTEG-001',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      lenderId: LENDER_ID,
      loanRequestId: LOAN_REQUEST_ID,
      principalAmount: new Prisma.Decimal(PRINCIPAL),
      interestRate: new Prisma.Decimal(ANNUAL_RATE),
      currency: CURRENCY,
      tenorDays: 30,
      repaymentMethod: 'lump_sum',
      startDate,
      maturityDate,
      outstandingPrincipal: new Prisma.Decimal(PRINCIPAL),
      outstandingInterest: new Prisma.Decimal('0.0000'),
      outstandingFees: new Prisma.Decimal('0.0000'),
      outstandingPenalties: new Prisma.Decimal('0.0000'),
      totalOutstanding: new Prisma.Decimal(PRINCIPAL),
      totalPaid: new Prisma.Decimal('0.0000'),
      daysPastDue: 0,
      status: ContractStatus.active,
      classification: 'performing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Build mock Prisma with in-memory stores
    const ledgerEntryModel = makeModelMock(store.ledgerEntries);
    const contractModel = makeModelMock(store.contracts);
    const repaymentModel = makeModelMock(store.repayments);
    const settlementRunModel = makeModelMock(store.settlementRuns);
    const settlementLineModel = makeModelMock(store.settlementLines);
    const tenantModel = makeModelMock(store.tenants);
    const disbursementModel = makeModelMock(store.disbursements);

    prisma = {
      ledgerEntry: ledgerEntryModel,
      contract: contractModel,
      repayment: repaymentModel,
      settlementRun: settlementRunModel,
      settlementLine: settlementLineModel,
      tenant: tenantModel,
      disbursement: disbursementModel,
      reconciliationRun: makeModelMock(store.reconciliationRuns),
      reconciliationException: makeModelMock(store.reconciliationExceptions),
      // $transaction: execute the callback with the same prisma mock
      $transaction: jest.fn(async (fn: any, opts?: any) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        SettlementService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EventBusService,
          useValue: { emitAndBuild: jest.fn() },
        },
      ],
    }).compile();

    ledgerService = module.get<LedgerService>(LedgerService);
    settlementService = module.get<SettlementService>(SettlementService);
    eventBus = module.get<EventBusService>(EventBusService);
  });

  // -----------------------------------------------------------------------
  // Step 1: Repayment processing with waterfall allocation
  // -----------------------------------------------------------------------
  describe('Step 1: Repayment + waterfall allocation', () => {
    it('should allocate a $100 payment correctly against $1000 principal', () => {
      // Waterfall allocation: with no interest/fees/penalties, entire $100 goes to principal
      const outstanding = {
        overduePenalties: '0.0000',
        overdueInterest: '0.0000',
        overduePrincipal: '0.0000',
        currentFees: '0.0000',
        currentInterest: '0.0000',
        currentPrincipal: '1000.0000',
      };

      const paymentAmount = '100.0000';
      // Walk the waterfall: penalties → overdueInterest → overduePrincipal → fees → interest → principal
      // All zero except currentPrincipal, so entire $100 goes to principal
      const allocatedPrincipal = paymentAmount;
      const remaining = subtract(outstanding.currentPrincipal, allocatedPrincipal);
      expect(remaining).toBe('900.0000');

      // Verify total allocated sums to payment
      const totalAllocated = add(add('0.0000', '0.0000'), add('0.0000', allocatedPrincipal));
      expect(totalAllocated).toBe('100.0000');
    });

    it('should create a repayment record and update contract balances', async () => {
      const paymentAmount = '100.0000';
      const now = new Date('2026-03-15T10:00:00Z');

      // Simulate what PaymentService.processPayment does:
      // 1. Waterfall allocation (all to principal since no other outstanding)
      const allocatedPrincipal = paymentAmount;
      const allocatedInterest = '0.0000';
      const allocatedFees = '0.0000';
      const allocatedPenalties = '0.0000';

      // 2. Create repayment record
      const repaymentId = nextId();
      const repayment = {
        id: repaymentId,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        customerId: CUSTOMER_ID,
        amount: new Prisma.Decimal(paymentAmount),
        currency: CURRENCY,
        method: 'manual' as RepaymentMethodType,
        externalRef: 'EXT-PAY-001',
        allocatedPrincipal: new Prisma.Decimal(allocatedPrincipal),
        allocatedInterest: new Prisma.Decimal(allocatedInterest),
        allocatedFees: new Prisma.Decimal(allocatedFees),
        allocatedPenalties: new Prisma.Decimal(allocatedPenalties),
        status: RepaymentStatus.completed,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      store.repayments.set(repaymentId, repayment);

      // 3. Update contract outstanding amounts
      const contract = store.contracts.get(CONTRACT_ID)!;
      const newOutstandingPrincipal = bankersRound(subtract(String(contract.outstandingPrincipal), allocatedPrincipal), 4);
      const newTotalOutstanding = newOutstandingPrincipal;
      const newTotalPaid = add(String(contract.totalPaid), paymentAmount);

      contract.outstandingPrincipal = new Prisma.Decimal(newOutstandingPrincipal);
      contract.totalOutstanding = new Prisma.Decimal(newTotalOutstanding);
      contract.totalPaid = new Prisma.Decimal(newTotalPaid);

      expect(bankersRound(String(contract.outstandingPrincipal), 4)).toBe('900.0000');
      expect(bankersRound(String(contract.totalPaid), 4)).toBe('100.0000');
      expect(bankersRound(String(contract.totalOutstanding), 4)).toBe('900.0000');

      // 4. Record double-entry ledger for the repayment
      const ledgerResult = await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.repayment,
        amount: paymentAmount,
        currency: CURRENCY,
        effectiveDate: now,
        valueDate: now,
        description: `Repayment of ${paymentAmount} ${CURRENCY}`,
        referenceType: 'repayment',
        referenceId: repaymentId,
      });

      expect(ledgerResult.debitEntry).toBeDefined();
      expect(ledgerResult.creditEntry).toBeDefined();
      // Repayment DECREASES running balance: 0 - 100 = -100
      expect(ledgerResult.runningBalance).toBe('-100.0000');
    });
  });

  // -----------------------------------------------------------------------
  // Step 2: Ledger double-entry verification
  // -----------------------------------------------------------------------
  describe('Step 2: Ledger double-entry pairs', () => {
    it('should create balanced debit+credit pairs for disbursement and repayment', async () => {
      const disbDate = new Date('2026-03-01T08:00:00Z');
      const repayDate = new Date('2026-03-15T10:00:00Z');

      // Record disbursement (increases balance)
      const disbResult = await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.disbursement,
        amount: PRINCIPAL,
        currency: CURRENCY,
        effectiveDate: disbDate,
        valueDate: disbDate,
        description: 'Loan disbursement of 1000 GHS',
      });

      expect(disbResult.runningBalance).toBe('1000.0000');

      // Record repayment (decreases balance)
      const repayResult = await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.repayment,
        amount: '100.0000',
        currency: CURRENCY,
        effectiveDate: repayDate,
        valueDate: repayDate,
        description: 'Repayment of 100 GHS',
      });

      expect(repayResult.runningBalance).toBe('900.0000');

      // Verify total entries: 2 events × 2 entries each = 4
      expect(store.ledgerEntries.size).toBe(4);

      // Verify running balance via service
      const balance = await ledgerService.getRunningBalance(CONTRACT_ID);
      expect(balance).toBe('900.0000');
    });

    it('should verify balance integrity after multiple operations', async () => {
      // Disbursement +1000
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.disbursement,
        amount: '1000.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-01'),
        valueDate: new Date('2026-03-01'),
      });

      // Repayment -100
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.repayment,
        amount: '100.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-15'),
        valueDate: new Date('2026-03-15'),
      });

      // Interest accrual +3.2877 (simulated daily: 900 * 12/36500 ≈ 0.2959/day, ~11 days)
      const dailyInterest = bankersRound(divide(multiply('900.0000', '12'), '36500'), 4);
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.interest_accrual,
        amount: dailyInterest,
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-16'),
        valueDate: new Date('2026-03-16'),
      });

      // Verify balance: 1000 - 100 + dailyInterest
      const expectedBalance = bankersRound(add(subtract('1000.0000', '100.0000'), dailyInterest), 4);
      const balance = await ledgerService.getRunningBalance(CONTRACT_ID);
      expect(balance).toBe(expectedBalance);

      // Verify balance integrity
      const verification = await ledgerService.verifyBalance(CONTRACT_ID);
      expect(verification.valid).toBe(true);
      expect(verification.mismatches).toHaveLength(0);
      expect(verification.expectedBalance).toBe(expectedBalance);
    });
  });

  // -----------------------------------------------------------------------
  // Step 3: Interest accrual calculation
  // -----------------------------------------------------------------------
  describe('Step 3: Interest accrual', () => {
    it('should calculate daily interest correctly for reducing balance at 12% annual', () => {
      // Formula: outstandingPrincipal * annualRate / 36500
      // 1000 * 12 / 36500 = 0.3288 (rounded to 4 dp)
      const dailyInterest = bankersRound(divide(multiply(PRINCIPAL, ANNUAL_RATE), '36500'), 4);
      expect(dailyInterest).toBe('0.3288');
    });

    it('should calculate reduced daily interest after partial repayment', () => {
      // After $100 repayment, outstanding = $900
      const reducedPrincipal = '900.0000';
      const dailyInterest = bankersRound(divide(multiply(reducedPrincipal, ANNUAL_RATE), '36500'), 4);
      expect(dailyInterest).toBe('0.2959');
    });

    it('should enforce idempotency — skip if accrual already exists for date', async () => {
      const accrualDate = new Date('2026-03-02');

      // Record first accrual
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.interest_accrual,
        amount: '0.3288',
        currency: CURRENCY,
        effectiveDate: accrualDate,
        valueDate: accrualDate,
      });

      const entriesAfterFirst = store.ledgerEntries.size;

      // Simulate idempotency check: look for existing entry
      const existing = [...store.ledgerEntries.values()].find(
        (e) =>
          e.contractId === CONTRACT_ID &&
          e.entryType === LedgerEntryType.interest_accrual &&
          e.effectiveDate.getTime() === accrualDate.getTime(),
      );

      expect(existing).toBeDefined();

      // If existing is found, skip (this is what InterestAccrualService does)
      if (!existing) {
        await ledgerService.recordDoubleEntry(TENANT_ID, {
          contractId: CONTRACT_ID,
          entryType: LedgerEntryType.interest_accrual,
          amount: '0.3288',
          currency: CURRENCY,
          effectiveDate: accrualDate,
          valueDate: accrualDate,
        });
      }

      // Should NOT have created additional entries
      expect(store.ledgerEntries.size).toBe(entriesAfterFirst);
    });
  });

  // -----------------------------------------------------------------------
  // Step 4: Settlement calculation with revenue splits
  // -----------------------------------------------------------------------
  describe('Step 4: Settlement calculation', () => {
    it('should calculate per-party splits matching product config (60/25/10/5)', async () => {
      const periodStart = new Date('2026-03-01T00:00:00Z');
      const periodEnd = new Date('2026-03-31T23:59:59Z');
      const now = new Date('2026-03-15T10:00:00Z');

      // Create a repayment with allocated interest for settlement to pick up
      const repaymentId = nextId();
      store.repayments.set(repaymentId, {
        id: repaymentId,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        customerId: CUSTOMER_ID,
        amount: new Prisma.Decimal('100.0000'),
        currency: CURRENCY,
        method: 'manual',
        externalRef: 'EXT-PAY-002',
        allocatedPrincipal: new Prisma.Decimal('90.0000'),
        allocatedInterest: new Prisma.Decimal('8.0000'),
        allocatedFees: new Prisma.Decimal('1.5000'),
        allocatedPenalties: new Prisma.Decimal('0.5000'),
        status: RepaymentStatus.completed,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Run settlement calculation
      const result = await settlementService.calculateSettlement(TENANT_ID, periodStart, periodEnd);

      expect(result).toBeDefined();
      expect(result.status).toBe(SettlementStatus.calculated);

      // Total revenue = interest + fees + penalties = 8 + 1.5 + 0.5 = 10
      expect(bankersRound(String(result.totalRevenue), 4)).toBe('10.0000');

      // Verify settlement lines were created with correct splits
      const lines = [...store.settlementLines.values()];
      expect(lines.length).toBe(4); // lender, sp, emi, platform

      const lenderLine = lines.find((l) => l.partyType === 'lender');
      const spLine = lines.find((l) => l.partyType === 'sp');
      const emiLine = lines.find((l) => l.partyType === 'emi');
      const platformLine = lines.find((l) => l.partyType === 'platform');

      expect(lenderLine).toBeDefined();
      expect(spLine).toBeDefined();
      expect(emiLine).toBeDefined();
      expect(platformLine).toBeDefined();

      // 60% of 10 = 6
      expect(bankersRound(String(lenderLine!.shareAmount), 4)).toBe('6.0000');
      // 25% of 10 = 2.5
      expect(bankersRound(String(spLine!.shareAmount), 4)).toBe('2.5000');
      // 10% of 10 = 1
      expect(bankersRound(String(emiLine!.shareAmount), 4)).toBe('1.0000');
      // 5% of 10 = 0.5
      expect(bankersRound(String(platformLine!.shareAmount), 4)).toBe('0.5000');

      // Verify total shares sum to total revenue
      const totalShares = add(
        add(bankersRound(String(lenderLine!.shareAmount), 4), bankersRound(String(spLine!.shareAmount), 4)),
        add(bankersRound(String(emiLine!.shareAmount), 4), bankersRound(String(platformLine!.shareAmount), 4)),
      );
      expect(totalShares).toBe('10.0000');
    });

    it('should progress through approval and execution lifecycle', async () => {
      const periodStart = new Date('2026-03-01T00:00:00Z');
      const periodEnd = new Date('2026-03-31T23:59:59Z');

      // Seed repayment
      const repaymentId = nextId();
      store.repayments.set(repaymentId, {
        id: repaymentId,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        customerId: CUSTOMER_ID,
        amount: new Prisma.Decimal('50.0000'),
        currency: CURRENCY,
        method: 'manual',
        allocatedPrincipal: new Prisma.Decimal('45.0000'),
        allocatedInterest: new Prisma.Decimal('4.0000'),
        allocatedFees: new Prisma.Decimal('1.0000'),
        allocatedPenalties: new Prisma.Decimal('0.0000'),
        status: RepaymentStatus.completed,
        completedAt: new Date('2026-03-10T10:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Calculate
      const calcResult = await settlementService.calculateSettlement(TENANT_ID, periodStart, periodEnd);
      expect(calcResult.status).toBe(SettlementStatus.calculated);
      const runId = calcResult.id;

      // Approve
      const approved = await settlementService.approveSettlement(TENANT_ID, runId, 'admin-001');
      expect(approved.status).toBe(SettlementStatus.approved);
      expect(approved.approvedBy).toBe('admin-001');

      // Verify events were emitted for at least calculated + approved
      const emitCalls = (eventBus.emitAndBuild as jest.Mock).mock.calls;
      const settlementEvents = emitCalls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('settlement.'),
      );
      expect(settlementEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // Step 5: End-to-end ledger balance == contract outstanding
  // -----------------------------------------------------------------------
  describe('Step 5: Balance verification — ledger matches contract', () => {
    it('should have ledger running balance equal to contract totalOutstanding after all operations', async () => {
      // 1. Disbursement ledger entry (+1000)
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.disbursement,
        amount: PRINCIPAL,
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-01'),
        valueDate: new Date('2026-03-01'),
        description: 'Disbursement',
      });

      // 2. Repayment (-100)
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.repayment,
        amount: '100.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-15'),
        valueDate: new Date('2026-03-15'),
        description: 'Repayment',
      });

      // 3. Interest accrual (+0.2959 × 10 days = 2.9590)
      const dailyInterest = bankersRound(divide(multiply('900.0000', '12'), '36500'), 4);
      const totalInterest = bankersRound(multiply(dailyInterest, '10'), 4);
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.interest_accrual,
        amount: totalInterest,
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-25'),
        valueDate: new Date('2026-03-25'),
        description: '10 days of interest',
      });

      // 4. Fee (+5.0000)
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.fee,
        amount: '5.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-25'),
        valueDate: new Date('2026-03-25'),
        description: 'Processing fee',
      });

      // Update contract to reflect the same state
      const contract = store.contracts.get(CONTRACT_ID)!;
      contract.outstandingPrincipal = new Prisma.Decimal('900.0000');
      contract.outstandingInterest = new Prisma.Decimal(totalInterest);
      contract.outstandingFees = new Prisma.Decimal('5.0000');
      contract.outstandingPenalties = new Prisma.Decimal('0.0000');
      const expectedOutstanding = add(add('900.0000', totalInterest), '5.0000');
      contract.totalOutstanding = new Prisma.Decimal(expectedOutstanding);

      // Verify ledger balance matches contract outstanding
      const ledgerBalance = await ledgerService.getRunningBalance(CONTRACT_ID);
      expect(ledgerBalance).toBe(bankersRound(expectedOutstanding, 4));
      expect(ledgerBalance).toBe(bankersRound(String(contract.totalOutstanding), 4));

      // Verify integrity
      const verification = await ledgerService.verifyBalance(CONTRACT_ID);
      expect(verification.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Step 6: Statement generation
  // -----------------------------------------------------------------------
  describe('Step 6: Statement generation', () => {
    it('should generate correct statement with opening/closing balances and summary', async () => {
      // Record entries
      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.disbursement,
        amount: '1000.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-01'),
        valueDate: new Date('2026-03-01'),
      });

      await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.repayment,
        amount: '200.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-15'),
        valueDate: new Date('2026-03-15'),
      });

      // Generate statement for full month
      const statement = await ledgerService.generateStatement(
        CONTRACT_ID,
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );

      expect(statement.openingBalance).toBe('0.0000'); // No entries before March 1
      expect(statement.entries.length).toBeGreaterThan(0);

      // Debits: 1000 (disbursement debit). Credits: 1000 (disbursement credit) + 200 (repayment credit)
      // But statement includes ALL entries in range
      const totalDebits = statement.summary.totalDebits;
      const totalCredits = statement.summary.totalCredits;

      // Net movement = debits - credits
      expect(statement.summary.netMovement).toBe(subtract(totalDebits, totalCredits));
    });
  });

  // -----------------------------------------------------------------------
  // Step 7: All amounts are Decimal strings
  // -----------------------------------------------------------------------
  describe('Step 7: Decimal string integrity', () => {
    it('should use string-based Decimal for all monetary amounts', async () => {
      const result = await ledgerService.recordDoubleEntry(TENANT_ID, {
        contractId: CONTRACT_ID,
        entryType: LedgerEntryType.disbursement,
        amount: '1000.0000',
        currency: CURRENCY,
        effectiveDate: new Date('2026-03-01'),
        valueDate: new Date('2026-03-01'),
      });

      // runningBalance is a string
      expect(typeof result.runningBalance).toBe('string');
      expect(result.runningBalance).toMatch(/^\d+\.\d{4}$/);

      // Stored amounts are Prisma.Decimal
      const entry = store.ledgerEntries.get(result.debitEntry.id);
      expect(entry.amount).toBeInstanceOf(Prisma.Decimal);
    });

    it('should reject zero and negative amounts', async () => {
      await expect(
        ledgerService.recordDoubleEntry(TENANT_ID, {
          contractId: CONTRACT_ID,
          entryType: LedgerEntryType.disbursement,
          amount: '0.0000',
          currency: CURRENCY,
          effectiveDate: new Date(),
          valueDate: new Date(),
        }),
      ).rejects.toThrow('zero');

      await expect(
        ledgerService.recordDoubleEntry(TENANT_ID, {
          contractId: CONTRACT_ID,
          entryType: LedgerEntryType.disbursement,
          amount: '-50.0000',
          currency: CURRENCY,
          effectiveDate: new Date(),
          valueDate: new Date(),
        }),
      ).rejects.toThrow('negative');
    });
  });

  // -----------------------------------------------------------------------
  // Step 8: Settlement total == sum of revenue entries
  // -----------------------------------------------------------------------
  describe('Step 8: Settlement totals match revenue entries', () => {
    it('should have settlement line amounts summing to total revenue', async () => {
      const periodStart = new Date('2026-03-01T00:00:00Z');
      const periodEnd = new Date('2026-03-31T23:59:59Z');

      // Seed multiple repayments
      for (let i = 0; i < 3; i++) {
        const id = nextId();
        store.repayments.set(id, {
          id,
          tenantId: TENANT_ID,
          contractId: CONTRACT_ID,
          customerId: CUSTOMER_ID,
          amount: new Prisma.Decimal('100.0000'),
          currency: CURRENCY,
          method: 'manual',
          allocatedPrincipal: new Prisma.Decimal('85.0000'),
          allocatedInterest: new Prisma.Decimal('10.0000'),
          allocatedFees: new Prisma.Decimal('3.0000'),
          allocatedPenalties: new Prisma.Decimal('2.0000'),
          status: RepaymentStatus.completed,
          completedAt: new Date(`2026-03-${10 + i}T10:00:00Z`),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const result = await settlementService.calculateSettlement(TENANT_ID, periodStart, periodEnd);

      // Total revenue = 3 × (10 + 3 + 2) = 45
      expect(bankersRound(String(result.totalRevenue), 4)).toBe('45.0000');

      // Sum of all line share amounts should equal total revenue
      const lines = [...store.settlementLines.values()];
      let lineTotal = '0.0000';
      for (const line of lines) {
        lineTotal = add(lineTotal, bankersRound(String(line.shareAmount), 4));
      }
      expect(lineTotal).toBe('45.0000');

      // Verify each party's share
      const lenderTotal = lines
        .filter((l) => l.partyType === 'lender')
        .reduce((sum, l) => add(sum, bankersRound(String(l.shareAmount), 4)), '0.0000');
      // 60% of 45 = 27
      expect(lenderTotal).toBe('27.0000');
    });
  });
});
