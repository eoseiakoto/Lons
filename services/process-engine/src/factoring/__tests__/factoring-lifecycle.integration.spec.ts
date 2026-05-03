/**
 * Sprint 12 Phase 6B — Invoice Factoring lifecycle integration tests.
 *
 * Mock-Prisma walkthroughs of the four critical end-to-end Invoice Factoring
 * scenarios. Each test wires the real `ProcessEngineFactoringModule` (so the
 * cross-service Nest DI graph is exercised: Reserve → Origination, Aging →
 * Recourse, Submission → Concentration, etc.) against a single shared
 * in-memory Prisma stub. We assert state transitions across service
 * boundaries — not just unit-level behaviour.
 *
 * Reference: Docs/DEV-SPRINT-12-2026-05-03.md §6B.
 */

import { Test, type TestingModule } from '@nestjs/testing';

import {
  CustomerStatus,
  DebtorStatus,
  InvoiceStatus,
  Prisma,
  PrismaService,
  ProductStatus,
  ProductType,
  RecourseType,
  VerificationStatus,
} from '@lons/database';
import {
  EventBusService,
  add,
  bankersRound,
  divide,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { ProcessEngineFactoringModule } from '../factoring.module';
import { ConcentrationLimitService } from '../concentration-limit.service';
import { DebtorService } from '../debtor.service';
import { InvoiceSubmissionService } from '../invoice-submission.service';
import { FactoringOriginationService } from '../factoring-origination.service';
import { ReserveService } from '../reserve.service';
import { RecourseService } from '../recourse.service';
import { InvoiceAgingService } from '../invoice-aging.service';
import type { SubmitInvoiceInput } from '../invoice-submission.types';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const DEBTOR = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';
const LENDER = '55555555-5555-5555-5555-555555555555';

// ─── Date helpers (UTC midnight, like the production services) ─────────────

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function utcDateOffsetDays(days: number): Date {
  const today = startOfTodayUtc();
  return new Date(today.getTime() + days * 86_400_000);
}

function isoCalendar(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── In-memory world ───────────────────────────────────────────────────────

/**
 * Construct the in-memory Prisma stub + a mock EventBus + the seed
 * customer/debtor/product rows. All read paths go through Map<id, record>
 * lookups so we can mutate state in place across the lifecycle.
 *
 * The world also exposes a small `events` array + `expectEventEmitted` helper
 * so tests can assert ordered emissions without fishing through jest.fn calls.
 */
interface WorldOpts {
  /** Seed extra invoices into the world before the test runs (e.g. concentration). */
  seedInvoices?: Array<Partial<InvoiceRow> & { id: string; faceValue: string }>;
  /** Seed extra debtor exposure (sums in concentration aggregates). */
  seedDebtorExposure?: string;
  /** Override product factoringConfig before the module boots. */
  productConfigOverride?: Record<string, unknown>;
}

interface InvoiceRow {
  id: string;
  tenantId: string;
  sellerId: string;
  debtorId: string;
  productId: string;
  contractId: string | null;
  idempotencyKey: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  faceValue: string;
  currency: string;
  advanceRatePercent: string;
  advancedAmount: string | null;
  reserveAmount: string | null;
  discountFee: string | null;
  serviceFee: string | null;
  netDisbursement: string | null;
  status: InvoiceStatus;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  verificationNotes: string | null;
  recourseType: RecourseType;
  debtorNotifiedAt: Date | null;
  debtorPaymentRef: string | null;
  amountReceived: string;
  reserveReleased: string;
  disputeReason: string | null;
  documents: unknown;
  metadata: Record<string, unknown> | null;
  fundedAt: Date | null;
  settledAt: Date | null;
  defaultedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DebtorRow {
  id: string;
  tenantId: string;
  companyName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  country: string;
  industrySector: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactName: string | null;
  address: unknown;
  paymentTerms: string | null;
  averagePaymentDays: number | null;
  externalCreditRating: string | null;
  internalRiskScore: string | null;
  totalExposure: string;
  exposureLimit: string | null;
  status: DebtorStatus;
  verifiedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface ContractRow {
  id: string;
  tenantId: string;
  contractNumber: string;
  status: string;
  settledAt: Date | null;
  customerId: string;
  productId: string;
  lenderId: string | null;
  loanRequestId: string;
  metadata: Record<string, unknown> | null;
}

interface CapturedEvent {
  type: string;
  tenantId: string;
  payload: Record<string, unknown> | undefined;
}

async function buildWorld(opts: WorldOpts = {}) {
  // ── In-memory tables ──
  const invoices = new Map<string, InvoiceRow>();
  const debtors = new Map<string, DebtorRow>();
  const contracts = new Map<string, ContractRow>();
  const products = new Map<string, any>();
  const customers = new Map<string, any>();
  const loanRequests = new Map<string, any>();
  const ledgerEntries: any[] = [];
  const collectionsActions: any[] = [];

  // ── Seed customer (seller) ──
  customers.set(SELLER, {
    id: SELLER,
    tenantId: TENANT,
    status: CustomerStatus.active,
    kycLevel: 'tier_2',
    deletedAt: null,
  });

  // ── Seed debtor ──
  const baseDebtor: DebtorRow = {
    id: DEBTOR,
    tenantId: TENANT,
    companyName: 'Acme Buyers Ltd',
    tradingName: 'Acme',
    registrationNumber: 'REG-ACME-001',
    taxId: null,
    country: 'GHA',
    industrySector: 'manufacturing',
    contactEmail: 'ap@acme.example',
    contactPhone: null,
    contactName: 'AP Team',
    address: null,
    paymentTerms: 'NET30',
    averagePaymentDays: null,
    externalCreditRating: null,
    // Mid-tier risk score that contributes 0 to the advance-rate adjustment
    // (per spec §4.2 / debtorRiskAdjustment: scores in [50, 70) → 0).
    internalRiskScore: '60',
    totalExposure: opts.seedDebtorExposure ?? '0',
    exposureLimit: null,
    status: DebtorStatus.active,
    verifiedAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
  debtors.set(DEBTOR, baseDebtor);

  // ── Seed product (invoice_financing) with a full default factoringConfig ──
  const factoringConfig: Record<string, unknown> = {
    advanceRatePercent: '85.00',
    minAdvanceRate: '60.00',
    maxAdvanceRate: '95.00',
    discountRateAnnual: '12.00',
    serviceFeeFlat: '100.00',
    defaultRecourseType: 'with_recourse',
    nonRecourseEligibility: {
      minDebtorRiskScore: 70,
      minDebtorPaymentHistory: 6,
      maxInvoiceTenorDays: 90,
      feeMultiplier: 1.5,
    },
    verificationRules: {
      autoVerifyBelow: '50000.00',
      manualVerifyAbove: '200000.00',
      // Disable both new-seller / new-debtor manual gates so the lifecycle
      // can drive a low-value invoice straight through to verified.
      manualVerifyNewSeller: false,
      manualVerifyNewDebtor: false,
    },
    concentrationLimits: {
      // Permissive percent caps so the happy-path / partial-payment / default
      // tests (where the test invoice IS the entire portfolio) don't trip
      // the percent dimensions. The breach test overrides the absolute cap
      // explicitly via seedDebtorExposure so it can still fail correctly.
      maxDebtorExposurePercent: 100,
      maxDebtorExposureAmount: '500000.00',
      maxIndustryExposurePercent: 100,
      maxSellerDebtorPercent: 100,
    },
    // 60-day default cut-over keeps the aging math simple.
    agingThresholds: {
      graceEndDpd: 7,
      overdueEndDpd: 30,
      seriouslyOverdueEndDpd: 60,
      defaultDpd: 60,
    },
    autoReserveRelease: true,
    manualReleaseAbove: '200000.00',
    recourseGracePeriodDays: 7,
    ...(opts.productConfigOverride ?? {}),
  };
  products.set(PRODUCT, {
    id: PRODUCT,
    tenantId: TENANT,
    type: ProductType.invoice_financing,
    status: ProductStatus.active,
    lenderId: LENDER,
    currency: 'GHS',
    minAmount: new Prisma.Decimal('1000.00'),
    maxAmount: new Prisma.Decimal('500000.00'),
    factoringConfig,
    deletedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  });

  // ── Optional pre-seeded invoices (for the concentration test) ──
  for (const seed of opts.seedInvoices ?? []) {
    const row: InvoiceRow = {
      id: seed.id,
      tenantId: seed.tenantId ?? TENANT,
      sellerId: seed.sellerId ?? SELLER,
      debtorId: seed.debtorId ?? DEBTOR,
      productId: seed.productId ?? PRODUCT,
      contractId: seed.contractId ?? null,
      idempotencyKey: seed.idempotencyKey ?? `seed-${seed.id}`,
      invoiceNumber: seed.invoiceNumber ?? `INV-SEED-${seed.id.slice(0, 4)}`,
      issueDate: seed.issueDate ?? utcDateOffsetDays(-30),
      dueDate: seed.dueDate ?? utcDateOffsetDays(30),
      faceValue: seed.faceValue,
      currency: seed.currency ?? 'GHS',
      advanceRatePercent: seed.advanceRatePercent ?? '85.00',
      advancedAmount: seed.advancedAmount ?? null,
      reserveAmount: seed.reserveAmount ?? null,
      discountFee: seed.discountFee ?? null,
      serviceFee: seed.serviceFee ?? null,
      netDisbursement: seed.netDisbursement ?? null,
      status: seed.status ?? InvoiceStatus.funded,
      verificationStatus:
        seed.verificationStatus ?? VerificationStatus.verified,
      verifiedBy: seed.verifiedBy ?? null,
      verifiedAt: seed.verifiedAt ?? new Date(),
      verificationNotes: seed.verificationNotes ?? null,
      recourseType: seed.recourseType ?? RecourseType.with_recourse,
      debtorNotifiedAt: seed.debtorNotifiedAt ?? null,
      debtorPaymentRef: seed.debtorPaymentRef ?? null,
      amountReceived: seed.amountReceived ?? '0',
      reserveReleased: seed.reserveReleased ?? '0',
      disputeReason: seed.disputeReason ?? null,
      documents: seed.documents ?? null,
      metadata: seed.metadata ?? null,
      fundedAt: seed.fundedAt ?? null,
      settledAt: seed.settledAt ?? null,
      defaultedAt: seed.defaultedAt ?? null,
      createdAt: seed.createdAt ?? new Date(),
      updatedAt: seed.updatedAt ?? new Date(),
    };
    invoices.set(row.id, row);
  }

  // ── Helpers used across mock impls ──
  const matchesWhere = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
      if (k === 'tenantId' && row.tenantId !== v) return false;
      if (k === 'deletedAt' && row.deletedAt !== v) return false;
      if (k === 'id') {
        if (typeof v === 'string' && row.id !== v) return false;
      }
      if (k === 'status') {
        if (typeof v === 'object' && v !== null && 'in' in v) {
          if (!(v as { in: string[] }).in.includes(row.status)) return false;
        } else if (typeof v === 'string' && row.status !== v) return false;
      }
      if (k === 'sellerId' && row.sellerId !== v) return false;
      if (k === 'debtorId' && row.debtorId !== v) return false;
      if (k === 'productId' && row.productId !== v) return false;
      if (k === 'invoiceNumber' && row.invoiceNumber !== v) return false;
      if (k === 'idempotencyKey' && row.idempotencyKey !== v) return false;
      if (k === 'companyName' && row.companyName !== v) return false;
      if (k === 'registrationNumber' && row.registrationNumber !== v) return false;
      if (k === 'type' && row.type !== v) return false;
      if (k === 'debtor' && typeof v === 'object' && v !== null) {
        const debtor = debtors.get(row.debtorId);
        if (!debtor) return false;
        const sub = v as Record<string, unknown>;
        if (
          'industrySector' in sub &&
          debtor.industrySector !== sub.industrySector
        ) {
          return false;
        }
      }
    }
    return true;
  };

  // ── Capture events into a flat array we can assert against ──
  const events: CapturedEvent[] = [];
  const eventBus: EventBusService = {
    emitAndBuild: jest.fn((eventType: string, tenantId: string, payload: any) => {
      events.push({ type: eventType, tenantId, payload });
    }),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  } as unknown as EventBusService;

  // ── Build the Prisma mock surface ──
  // The shape mirrors the prod PrismaService closely enough that the
  // services can call findFirst / findMany / create / update / count /
  // aggregate / $transaction / enterTenantContext without modification.
  const prisma: any = {};

  // Customer
  prisma.customer = {
    findFirst: jest.fn(async (args: any) => {
      for (const c of customers.values()) {
        if (matchesWhere(c, args.where)) return { ...c };
      }
      return null;
    }),
  };

  // Product
  prisma.product = {
    findFirst: jest.fn(async (args: any) => {
      for (const p of products.values()) {
        if (matchesWhere(p, args.where)) return { ...p };
      }
      return null;
    }),
  };

  // Debtor
  prisma.debtor = {
    findFirst: jest.fn(async (args: any) => {
      for (const d of debtors.values()) {
        if (matchesWhere(d, args.where)) return { ...d };
      }
      return null;
    }),
    findMany: jest.fn(async (args: any) => {
      const out: DebtorRow[] = [];
      for (const d of debtors.values()) {
        if (matchesWhere(d, args?.where)) out.push({ ...d });
      }
      return out;
    }),
    create: jest.fn(async (args: any) => {
      const id = args.data.id ?? `debtor-${debtors.size + 1}`;
      const row: DebtorRow = {
        ...baseDebtor,
        id,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      debtors.set(id, row);
      return { ...row };
    }),
    update: jest.fn(async (args: any) => {
      const row = debtors.get(args.where.id);
      if (!row) throw new Error(`Debtor ${args.where.id} not found`);
      // Handle Prisma `increment` on totalExposure.
      const data = { ...args.data };
      if (
        data.totalExposure &&
        typeof data.totalExposure === 'object' &&
        'increment' in data.totalExposure
      ) {
        const inc = data.totalExposure.increment;
        const incStr =
          typeof inc === 'string' ? inc : String((inc as any).toString());
        row.totalExposure = add(row.totalExposure, incStr);
        delete data.totalExposure;
      }
      Object.assign(row, data);
      row.updatedAt = new Date();
      return { ...row };
    }),
  };

  // Invoice
  const aggregateFaceValue = (where: any): string => {
    let sum = '0';
    for (const inv of invoices.values()) {
      if (!matchesWhere(inv, where)) continue;
      sum = add(sum, String(inv.faceValue));
    }
    return sum;
  };

  prisma.invoice = {
    findFirst: jest.fn(async (args: any) => {
      for (const inv of invoices.values()) {
        if (matchesWhere(inv, args?.where)) {
          const out: any = { ...inv };
          if (args?.include?.product) {
            out.product = products.get(inv.productId);
          }
          return out;
        }
      }
      return null;
    }),
    findMany: jest.fn(async (args: any) => {
      const out: any[] = [];
      for (const inv of invoices.values()) {
        if (matchesWhere(inv, args?.where)) {
          const row: any = { ...inv };
          if (args?.include?.product) {
            row.product = products.get(inv.productId);
          }
          if (args?.select?.debtor?.select?.industrySector) {
            row.debtor = {
              industrySector: debtors.get(inv.debtorId)?.industrySector ?? null,
            };
          }
          out.push(row);
        }
      }
      return out;
    }),
    create: jest.fn(async (args: any) => {
      const id = args.data.id ?? `invoice-${invoices.size + 1}`;
      const data = args.data as Record<string, unknown>;
      const row: InvoiceRow = {
        id,
        tenantId: (data.tenantId as string) ?? TENANT,
        sellerId: (data.sellerId as string) ?? SELLER,
        debtorId: (data.debtorId as string) ?? DEBTOR,
        productId: (data.productId as string) ?? PRODUCT,
        contractId: (data.contractId as string | null) ?? null,
        idempotencyKey: (data.idempotencyKey as string) ?? `idem-${id}`,
        invoiceNumber: (data.invoiceNumber as string) ?? `INV-${id}`,
        issueDate: (data.issueDate as Date) ?? new Date(),
        dueDate: (data.dueDate as Date) ?? utcDateOffsetDays(30),
        faceValue: String(data.faceValue ?? '0'),
        currency: (data.currency as string) ?? 'GHS',
        advanceRatePercent: String(data.advanceRatePercent ?? '0'),
        advancedAmount: data.advancedAmount
          ? String(data.advancedAmount)
          : null,
        reserveAmount: data.reserveAmount ? String(data.reserveAmount) : null,
        discountFee: data.discountFee ? String(data.discountFee) : null,
        serviceFee: data.serviceFee ? String(data.serviceFee) : null,
        netDisbursement: data.netDisbursement
          ? String(data.netDisbursement)
          : null,
        status: (data.status as InvoiceStatus) ?? InvoiceStatus.submitted,
        verificationStatus:
          (data.verificationStatus as VerificationStatus) ??
          VerificationStatus.pending,
        verifiedBy: (data.verifiedBy as string | null) ?? null,
        verifiedAt: (data.verifiedAt as Date | null) ?? null,
        verificationNotes: (data.verificationNotes as string | null) ?? null,
        recourseType:
          (data.recourseType as RecourseType) ?? RecourseType.with_recourse,
        debtorNotifiedAt: (data.debtorNotifiedAt as Date | null) ?? null,
        debtorPaymentRef: (data.debtorPaymentRef as string | null) ?? null,
        amountReceived: data.amountReceived ? String(data.amountReceived) : '0',
        reserveReleased: data.reserveReleased
          ? String(data.reserveReleased)
          : '0',
        disputeReason: (data.disputeReason as string | null) ?? null,
        documents: data.documents ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        fundedAt: (data.fundedAt as Date | null) ?? null,
        settledAt: (data.settledAt as Date | null) ?? null,
        defaultedAt: (data.defaultedAt as Date | null) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      invoices.set(id, row);
      return { ...row };
    }),
    update: jest.fn(async (args: any) => {
      const row = invoices.get(args.where.id);
      if (!row) throw new Error(`Invoice ${args.where.id} not found`);
      const data = args.data as Record<string, unknown>;
      // Coerce Decimal-ish values back to strings on the row.
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        if (
          v !== null &&
          typeof v === 'object' &&
          (v as any) instanceof Prisma.Decimal
        ) {
          patch[k] = (v as any).toString();
        } else {
          patch[k] = v;
        }
      }
      Object.assign(row, patch);
      row.updatedAt = new Date();
      return { ...row };
    }),
    count: jest.fn(async (args: any) => {
      let n = 0;
      for (const inv of invoices.values()) {
        if (matchesWhere(inv, args?.where)) n += 1;
      }
      return n;
    }),
    aggregate: jest.fn(async (args: any) => {
      const sum = aggregateFaceValue(args?.where);
      return { _sum: { faceValue: sum === '0' ? null : sum } };
    }),
  };

  // Contract
  prisma.contract = {
    create: jest.fn(async (args: any) => {
      const id = args.data.id ?? `contract-${contracts.size + 1}`;
      // Strip Nest's `connect` shorthand to plain ids on the in-memory row.
      const row: ContractRow = {
        id,
        tenantId: args.data.tenantId,
        contractNumber: args.data.contractNumber,
        status: args.data.status ?? 'active',
        settledAt: args.data.settledAt ?? null,
        customerId: args.data.customer?.connect?.id ?? args.data.customerId,
        productId: args.data.product?.connect?.id ?? args.data.productId,
        lenderId: args.data.lender?.connect?.id ?? args.data.lenderId ?? null,
        loanRequestId: args.data.loanRequestId,
        metadata: args.data.metadata ?? null,
      };
      contracts.set(id, row);
      return { ...row };
    }),
    update: jest.fn(async (args: any) => {
      const row = contracts.get(args.where.id);
      if (!row) throw new Error(`Contract ${args.where.id} not found`);
      Object.assign(row, args.data);
      return { ...row };
    }),
  };

  // LoanRequest stub (factoring origination synthesises one).
  prisma.loanRequest = {
    create: jest.fn(async (args: any) => {
      const id = args.data.id ?? `lr-${loanRequests.size + 1}`;
      const row = { id, ...args.data };
      loanRequests.set(id, row);
      return { ...row };
    }),
  };

  // LedgerEntry append-only.
  prisma.ledgerEntry = {
    create: jest.fn(async (args: any) => {
      const entry = {
        id: `ledger-${ledgerEntries.length + 1}`,
        ...args.data,
      };
      ledgerEntries.push(entry);
      return entry;
    }),
  };

  // CollectionsAction.
  prisma.collectionsAction = {
    create: jest.fn(async (args: any) => {
      const entry = {
        id: `ca-${collectionsActions.length + 1}`,
        ...args.data,
      };
      collectionsActions.push(entry);
      return entry;
    }),
  };

  // $transaction is just a passthrough — the inner fn receives the same
  // prisma surface so create/update calls land in the same in-memory tables.
  prisma.$transaction = jest.fn(async (input: any) => {
    if (typeof input === 'function') return input(prisma);
    return Array.isArray(input) ? input.map(() => ({})) : input;
  });

  // enterTenantContext is just a passthrough — the in-memory store ignores
  // the RLS session variable (no real DB).
  prisma.enterTenantContext = jest.fn(async (_ctx: any, fn: any) => fn());

  // ── Build the testing module with the real Factoring module ──
  // We import ProcessEngineFactoringModule (which itself imports the
  // global PrismaModule + EventBusModule) and then override the
  // PrismaService + EventBusService providers with our in-memory stubs.
  // The seven factoring services are wired by Nest DI, so we exercise
  // the real cross-service constructor graph (Reserve → Origination,
  // Aging → Recourse, Submission → Concentration, etc.).
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [ProcessEngineFactoringModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(EventBusService)
    .useValue(eventBus)
    .compile();

  const debtorService = moduleRef.get(DebtorService);
  const originationService = moduleRef.get(FactoringOriginationService);
  const reserveService = moduleRef.get(ReserveService);
  const recourseService = moduleRef.get(RecourseService);
  const concentrationService = moduleRef.get(ConcentrationLimitService);
  const submissionService = moduleRef.get(InvoiceSubmissionService);
  const agingService = moduleRef.get(InvoiceAgingService);

  const expectEventEmitted = (
    type: string,
    payloadMatcher?: (payload: any) => boolean,
  ): CapturedEvent => {
    const matches = events.filter(
      (e) =>
        e.type === type &&
        (payloadMatcher ? payloadMatcher(e.payload ?? {}) : true),
    );
    expect(matches.length).toBeGreaterThan(0);
    return matches[matches.length - 1];
  };

  return {
    prisma,
    eventBus,
    events,
    expectEventEmitted,
    services: {
      submission: submissionService,
      origination: originationService,
      reserve: reserveService,
      recourse: recourseService,
      concentration: concentrationService,
      aging: agingService,
      debtor: debtorService,
    },
    state: {
      invoices,
      debtors,
      contracts,
      ledgerEntries,
      collectionsActions,
      products,
    },
  };
}

// ─── Lifecycle helpers ─────────────────────────────────────────────────────

function baseSubmitInput(
  overrides: Partial<SubmitInvoiceInput> = {},
): SubmitInvoiceInput {
  return {
    idempotencyKey: 'INV-IDEM-1',
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    invoiceNumber: 'INV-2026-0001',
    // Issue dates are normalized to UTC midnight in the service; pass an
    // ISO calendar date strictly before today.
    issueDate: isoCalendar(utcDateOffsetDays(-5)),
    dueDate: isoCalendar(utcDateOffsetDays(30)),
    faceValue: '10000.00',
    currency: 'GHS',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Invoice Factoring — happy path lifecycle', () => {
  it('walks an invoice from submission through settlement (Sprint 12 §6B)', async () => {
    const world = await buildWorld();

    // ── 1) Submit invoice — auto-verify path (faceValue < autoVerifyBelow) ──
    const submitted = await world.services.submission.submit(
      TENANT,
      baseSubmitInput(),
    );
    expect(submitted.status).toBe(InvoiceStatus.verified);
    expect(submitted.verificationStatus).toBe(VerificationStatus.waived);
    world.expectEventEmitted(EventType.INVOICE_SUBMITTED);
    world.expectEventEmitted(EventType.INVOICE_VERIFIED);

    const invoiceId = submitted.id;

    // ── 2) Generate offer ──
    const offer = await world.services.origination.generateOffer(
      TENANT,
      invoiceId,
    );

    // Re-derive the expected math via @lons/common helpers so the test
    // doesn't hardcode arithmetic results.
    const faceValue = '10000.00';
    // base 85 + debtor 0 (score 75) + tenor 0 (30d) + seller 0 = 85
    const expectedAdvanceRate = '85.00';
    const expectedAdvanced = bankersRound(
      multiply(faceValue, divide(expectedAdvanceRate, '100')),
      4,
    );
    const expectedReserve = bankersRound(
      subtract(faceValue, expectedAdvanced),
      4,
    );
    const tenorDays = 30;
    const expectedDiscount = bankersRound(
      multiply(
        expectedAdvanced,
        multiply(divide('12.00', '100'), divide(String(tenorDays), '365')),
      ),
      4,
    );
    const expectedService = bankersRound('100.00', 4);
    const expectedNet = bankersRound(
      subtract(subtract(expectedAdvanced, expectedDiscount), expectedService),
      4,
    );

    expect(offer.advanceRatePercent).toBe(expectedAdvanceRate);
    expect(offer.advancedAmount).toBe(expectedAdvanced);
    expect(offer.reserveAmount).toBe(expectedReserve);
    expect(offer.discountFee).toBe(expectedDiscount);
    expect(offer.serviceFee).toBe(expectedService);
    expect(offer.netDisbursement).toBe(expectedNet);

    const stored = world.state.invoices.get(invoiceId)!;
    expect(stored.status).toBe(InvoiceStatus.offer_generated);
    expect(stored.advancedAmount).toBe(expectedAdvanced);
    expect(stored.reserveAmount).toBe(expectedReserve);

    world.expectEventEmitted(EventType.INVOICE_OFFER_GENERATED);

    // ── 3) Accept offer ──
    const accepted = await world.services.origination.acceptOffer(
      TENANT,
      invoiceId,
      'ACCEPT-IDEM-1',
    );
    expect(accepted.status).toBe(InvoiceStatus.offer_accepted);
    world.expectEventEmitted(EventType.INVOICE_OFFER_ACCEPTED);

    // ── 4) Disburse advance ──
    const debtorBeforeFunding = world.state.debtors.get(DEBTOR)!.totalExposure;
    const funded = await world.services.origination.disburseAdvance(
      TENANT,
      invoiceId,
      'DISB-IDEM-1',
    );
    expect(funded.status).toBe(InvoiceStatus.funded);
    expect(funded.contractId).toBeTruthy();

    // 4 ledger entries created during disbursement (receivable, net cash,
    // fee income, reserve held).
    const disbursementLedger = world.prisma.ledgerEntry.create.mock.calls;
    expect(disbursementLedger.length).toBeGreaterThanOrEqual(3);

    // Debtor exposure increased by faceValue.
    const debtorAfterFunding = world.state.debtors.get(DEBTOR)!.totalExposure;
    expect(debtorAfterFunding).toBe(add(debtorBeforeFunding, faceValue));

    world.expectEventEmitted(EventType.INVOICE_FUNDED);

    // ── 5) Notify debtor ──
    const notified = await world.services.origination.notifyDebtor(
      TENANT,
      invoiceId,
    );
    expect(notified.status).toBe(InvoiceStatus.debtor_notified);
    expect(notified.debtorNotifiedAt).toBeTruthy();
    world.expectEventEmitted(EventType.INVOICE_DEBTOR_NOTIFIED);

    // ── 6) Record FULL debtor payment ──
    const assessRiskSpy = jest.spyOn(world.services.debtor, 'assessRisk');
    const paidInvoice = await world.services.reserve.recordDebtorPayment(
      TENANT,
      invoiceId,
      {
        amountReceived: faceValue,
        paymentRef: 'PAY-REF-1',
        operatorId: 'op-1',
        idempotencyKey: 'PAY-IDEM-1',
      },
    );
    expect(paidInvoice.status).toBe(InvoiceStatus.payment_received);
    // amountReceived is normalized through @lons/common.add (4dp).
    expect(String(paidInvoice.amountReceived)).toBe(add('0', faceValue));
    expect(assessRiskSpy).toHaveBeenCalledWith(TENANT, DEBTOR);
    world.expectEventEmitted(
      EventType.INVOICE_PAYMENT_RECEIVED,
      (p) => p.isPartial === false,
    );

    // ── 7) Release reserve — this also drives origination.complete() ──
    const released = await world.services.reserve.releaseReserve(
      TENANT,
      invoiceId,
      { idempotencyKey: 'RES-IDEM-1' },
    );
    expect(released.status).toBe(InvoiceStatus.reserve_released);
    expect(String(released.reserveReleased)).toBe(expectedReserve);
    world.expectEventEmitted(EventType.INVOICE_RESERVE_RELEASED);

    // Cross-service integration: ReserveService.releaseReserve calls
    // FactoringOriginationService.complete on full release, which flips
    // status → settled and emits INVOICE_SETTLED.
    const finalInvoice = world.state.invoices.get(invoiceId)!;
    expect(finalInvoice.status).toBe(InvoiceStatus.settled);
    world.expectEventEmitted(EventType.INVOICE_SETTLED);

    // Debtor exposure unwound back to the starting position. The atomic
    // increment+decrement walks through @lons/common.add which normalizes
    // to 4dp ("0" → "0.0000"), so we compare numerically rather than by
    // string equality.
    const debtorAfterSettle = world.state.debtors.get(DEBTOR)!.totalExposure;
    expect(subtract(debtorAfterSettle, debtorBeforeFunding)).toBe('0.0000');
  });
});

describe('Invoice Factoring — partial payment + reserve shortfall', () => {
  it('accumulates partial payments before flipping to payment_received', async () => {
    const world = await buildWorld();

    // Submit + offer + accept + disburse + notify (same as happy path).
    const submitted = await world.services.submission.submit(
      TENANT,
      baseSubmitInput({ idempotencyKey: 'IDEM-PARTIAL-1' }),
    );
    const invoiceId = submitted.id;

    await world.services.origination.generateOffer(TENANT, invoiceId);
    await world.services.origination.acceptOffer(
      TENANT,
      invoiceId,
      'ACCEPT-PARTIAL-1',
    );
    await world.services.origination.disburseAdvance(
      TENANT,
      invoiceId,
      'DISB-PARTIAL-1',
    );
    await world.services.origination.notifyDebtor(TENANT, invoiceId);

    const faceValue = '10000.00';
    const partialOne = '7000.00';
    const partialTwo = '3000.00';

    // First partial payment — invoice stays in debtor_notified.
    const afterFirst = await world.services.reserve.recordDebtorPayment(
      TENANT,
      invoiceId,
      {
        amountReceived: partialOne,
        paymentRef: 'PARTIAL-REF-1',
        operatorId: 'op-1',
        idempotencyKey: 'PARTIAL-IDEM-1',
      },
    );
    expect(afterFirst.status).toBe(InvoiceStatus.debtor_notified);
    // amountReceived is normalized through @lons/common.add (4dp).
    expect(String(afterFirst.amountReceived)).toBe(add('0', partialOne));
    world.expectEventEmitted(
      EventType.INVOICE_PAYMENT_PARTIAL,
      (p) =>
        p.isPartial === true &&
        p.remainingFaceValue === subtract(faceValue, partialOne),
    );

    // Second top-up brings it to faceValue → status flips, event = received.
    const afterSecond = await world.services.reserve.recordDebtorPayment(
      TENANT,
      invoiceId,
      {
        amountReceived: partialTwo,
        paymentRef: 'PARTIAL-REF-2',
        operatorId: 'op-1',
        idempotencyKey: 'PARTIAL-IDEM-2',
      },
    );
    expect(afterSecond.status).toBe(InvoiceStatus.payment_received);
    expect(String(afterSecond.amountReceived)).toBe(
      add(add('0', partialOne), partialTwo),
    );
    world.expectEventEmitted(
      EventType.INVOICE_PAYMENT_RECEIVED,
      (p) => p.isPartial === false,
    );

    // Reserve release proceeds normally now — full payment unlocks settle.
    const released = await world.services.reserve.releaseReserve(
      TENANT,
      invoiceId,
      { idempotencyKey: 'PARTIAL-RES-1' },
    );
    expect(released.status).toBe(InvoiceStatus.reserve_released);
    world.expectEventEmitted(EventType.INVOICE_RESERVE_RELEASED);

    const finalRow = world.state.invoices.get(invoiceId)!;
    expect(finalRow.status).toBe(InvoiceStatus.settled);
    world.expectEventEmitted(EventType.INVOICE_SETTLED);
  });
});

describe('Invoice Factoring — default + with-recourse path', () => {
  it('crosses default DPD via aging scan and triggers recourse enforcement', async () => {
    // Make the dueDate already 90 days in the past so the aging scan classifies
    // the invoice into the Default bucket on first run.
    const world = await buildWorld();

    // Pre-seed an invoice that is funded + debtor_notified + 90 days overdue.
    // Bypassing the submission/offer/disburse flow keeps the date math
    // deterministic — the lifecycle steps 1-5 are already covered above.
    const invoiceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const contractId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const overdueDueDate = utcDateOffsetDays(-90);
    const issueDate = utcDateOffsetDays(-120);

    // Seed contract first so the recourse → collections wiring has a target.
    world.state.contracts.set(contractId, {
      id: contractId,
      tenantId: TENANT,
      contractNumber: 'IF-OVERDUE',
      status: 'active',
      settledAt: null,
      customerId: SELLER,
      productId: PRODUCT,
      lenderId: LENDER,
      loanRequestId: 'lr-overdue',
      metadata: null,
    });

    // Seed an active funded + debtor_notified invoice past dueDate.
    world.state.invoices.set(invoiceId, {
      id: invoiceId,
      tenantId: TENANT,
      sellerId: SELLER,
      debtorId: DEBTOR,
      productId: PRODUCT,
      contractId,
      idempotencyKey: 'IDEM-DEFAULT-1',
      invoiceNumber: 'INV-OVERDUE-1',
      issueDate,
      dueDate: overdueDueDate,
      faceValue: '10000.00',
      currency: 'GHS',
      advanceRatePercent: '85.00',
      advancedAmount: '8500.0000',
      reserveAmount: '1500.0000',
      discountFee: '50.0000',
      serviceFee: '100.0000',
      netDisbursement: '8350.0000',
      status: InvoiceStatus.debtor_notified,
      verificationStatus: VerificationStatus.verified,
      verifiedBy: null,
      verifiedAt: new Date(),
      verificationNotes: null,
      recourseType: RecourseType.with_recourse,
      debtorNotifiedAt: utcDateOffsetDays(-85),
      debtorPaymentRef: null,
      amountReceived: '0',
      reserveReleased: '0',
      disputeReason: null,
      documents: null,
      metadata: null,
      fundedAt: utcDateOffsetDays(-89),
      settledAt: null,
      defaultedAt: null,
      createdAt: utcDateOffsetDays(-120),
      updatedAt: utcDateOffsetDays(-90),
    });

    // Mirror the funding exposure on the debtor so the write-down assertion
    // (if any) is meaningful.
    const debtor = world.state.debtors.get(DEBTOR)!;
    debtor.totalExposure = '10000.00';

    // ── Run aging scan ──
    const result = await world.services.aging.processAging(TENANT);

    expect(result.totalScanned).toBe(1);
    expect(result.newDefaults).toContain(invoiceId);
    expect(result.byBucket.Default).toBe(1);

    // Aging persists the breadcrumb regardless of recourse outcome.
    const finalRow = world.state.invoices.get(invoiceId)!;
    expect(finalRow.metadata?.defaultThresholdCrossedAt).toBeDefined();

    // RecourseService.enforceDefault was called and flipped status →
    // defaulted, recorded the grace deadline, and emitted both events.
    expect(finalRow.status).toBe(InvoiceStatus.defaulted);
    expect(finalRow.defaultedAt).toBeTruthy();
    expect(finalRow.metadata?.recourseGraceEndAt).toBeDefined();
    expect(finalRow.metadata?.recourseAmount).toBeDefined();

    world.expectEventEmitted(
      EventType.INVOICE_DEFAULTED,
      (p) => p.invoiceId === invoiceId,
    );
    // amountToRecover comes through @lons/common subtract → 4dp Decimal-string.
    const expectedRecourseAmount = subtract('10000.00', '0');
    world.expectEventEmitted(
      EventType.RECOURSE_ENFORCEMENT_INITIATED,
      (p) =>
        p.sellerId === SELLER &&
        p.amountToRecover === expectedRecourseAmount,
    );
  });
});

describe('Invoice Factoring — concentration breach blocks submission', () => {
  it('rejects a submission that would push debtor exposure over the cap', async () => {
    // Pre-seed two active funded invoices for the same debtor that already
    // sit at 45,000 of the 50,000 absolute cap. A 10,000 new submission
    // would push to 55,000, breaching the cap. Override the absolute cap on
    // the product config so the breach is unambiguous.
    const world = await buildWorld({
      seedDebtorExposure: '45000.00',
      seedInvoices: [
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          faceValue: '20000.00',
          status: InvoiceStatus.funded,
        },
        {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          faceValue: '25000.00',
          status: InvoiceStatus.debtor_notified,
        },
      ],
      productConfigOverride: {
        concentrationLimits: {
          // Absolute cap below the projected post-submission exposure.
          maxDebtorExposureAmount: '50000.00',
          // Keep percent dimensions permissive so only the absolute cap fires.
          maxDebtorExposurePercent: 100,
          maxIndustryExposurePercent: 100,
          maxSellerDebtorPercent: 100,
        },
      },
    });

    await expect(
      world.services.submission.submit(
        TENANT,
        baseSubmitInput({
          idempotencyKey: 'IDEM-CONC-1',
          invoiceNumber: 'INV-CONC-1',
          faceValue: '10000.00',
        }),
      ),
    ).rejects.toThrow(/Concentration limit breached/);

    // The breach event fires for the debtor_absolute dimension.
    world.expectEventEmitted(
      EventType.CONCENTRATION_LIMIT_BREACHED,
      (p) => p.limitType === 'debtor_absolute',
    );

    // Defensive: the rejected submission did NOT persist a new invoice.
    let invoiceCountForKey = 0;
    for (const inv of world.state.invoices.values()) {
      if (inv.idempotencyKey === 'IDEM-CONC-1') invoiceCountForKey += 1;
    }
    expect(invoiceCountForKey).toBe(0);
  });
});
