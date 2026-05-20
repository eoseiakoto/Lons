/**
 * Test seed — stress-test volume + edge cases.
 *
 * Layered on top of the base seed (prisma/seed.ts). The base seed creates
 * 3 tenants, 20 customers + 8 contracts each. This script reads those
 * tenants back from the DB and adds:
 *
 *   Volume (per tenant):
 *     - +60 customers (varied KYC, age, gender)
 *     - +50 loan requests across every status the admin queue surfaces
 *     - +30 contracts: active / overdue / delinquent / default / settled
 *     - Generated repayment schedules and partial repayment histories
 *
 *   Edge cases (one per tenant):
 *     - Tenant 1 (QuickCash GH): a "frequent defaulter" customer with 3
 *       defaulted contracts — exercises the recovery queue.
 *     - Tenant 2 (Pesa Express KE): a BNPL credit line at 100%
 *       utilization (`availableLimit = 0`) — exercises the quota gate.
 *     - Tenant 3 (NairaLend NG): a customer flagged as a critical
 *       sanctions hit awaiting review — exercises the AML queue.
 *
 *   Global:
 *     - MFA-enabled platform user `mfa-admin@lons.io` (TOTP secret set,
 *       backup codes empty). Same password as the main admin.
 *
 * Idempotent on re-run: every insert either uses a deterministic
 * idempotency key / external ID and `findFirst`-then-create, or relies
 * on `skipDuplicates` for `createMany`.
 *
 * Usage: `pnpm --filter database db:seed:test` after the base seed.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { computeSearchableHash } from '@lons/common';

const prisma = new PrismaClient();

const PASSWORD = 'AdminPass123!@#';

const FIRST_NAMES = [
  'Adwoa', 'Kofi', 'Yaw', 'Akua', 'Kwame', 'Ama', 'Kwesi', 'Esi',
  'Wanjiru', 'Otieno', 'Achieng', 'Kamau', 'Njeri', 'Mwangi', 'Wairimu',
  'Chinwe', 'Adaeze', 'Emeka', 'Ngozi', 'Tunde', 'Bisi', 'Folake',
  'Tariq', 'Khadija', 'Idris', 'Aisha', 'Salim', 'Zainab', 'Bashir',
  'Fadzai', 'Tendai', 'Rumbi', 'Tatenda', 'Chipo', 'Tsitsi',
];
const LAST_NAMES = [
  'Mensah', 'Asante', 'Owusu', 'Boateng', 'Adjei', 'Frimpong',
  'Otieno', 'Wanjiru', 'Kimani', 'Ndegwa', 'Mutua', 'Kariuki',
  'Okafor', 'Adeyemi', 'Eze', 'Nwosu', 'Okeke', 'Achebe',
  'Hassan', 'Bello', 'Ibrahim', 'Yusuf', 'Diallo', 'Cissé',
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

interface TenantCfg {
  id: string;
  slug: string;
  name: string;
  currency: string;
  country: string;
  phonePrefix: string;
  phonePadLen: number;
  externalSource: string;
  countryShort: string;
  region: string;
  city: string;
  nationalIdFmt: (i: number) => string;
}

const TENANT_OVERLAYS: Record<string, Omit<TenantCfg, 'id' | 'name'>> = {
  'quickcash-gh': {
    slug: 'quickcash-gh',
    currency: 'GHS',
    country: 'GH',
    phonePrefix: '+233',
    phonePadLen: 9,
    externalSource: 'mtn_momo_gh',
    countryShort: 'GH',
    region: 'Greater Accra',
    city: 'Accra',
    nationalIdFmt: (i) => `GHA-${String(800000 + i).padStart(9, '0')}-9`,
  },
  'pesa-express-ke': {
    slug: 'pesa-express-ke',
    currency: 'KES',
    country: 'KE',
    phonePrefix: '+254',
    phonePadLen: 9,
    externalSource: 'mpesa_ke',
    countryShort: 'KE',
    region: 'Nairobi',
    city: 'Nairobi',
    nationalIdFmt: (i) => `KEN-${String(20000000 + i).padStart(8, '0')}`,
  },
  'nairalend-ng': {
    slug: 'nairalend-ng',
    currency: 'NGN',
    country: 'NG',
    phonePrefix: '+234',
    phonePadLen: 10,
    externalSource: 'paystack_ng',
    countryShort: 'NG',
    region: 'Lagos',
    city: 'Lagos',
    nationalIdFmt: (i) => `NGA-${String(30000000000 + i).padStart(11, '0')}`,
  },
};

async function loadTenants(): Promise<TenantCfg[]> {
  const rows = await prisma.tenant.findMany({
    where: { slug: { in: Object.keys(TENANT_OVERLAYS) } },
    orderBy: { slug: 'asc' },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    ...TENANT_OVERLAYS[t.slug],
  }));
}

async function loadProducts(tenantId: string) {
  return prisma.product.findMany({
    where: { tenantId, status: 'active', deletedAt: null },
    orderBy: { code: 'asc' },
  });
}

async function loadLender(tenantId: string) {
  const lender = await prisma.lender.findFirst({
    where: { tenantId, name: { not: 'Self-Funded' }, deletedAt: null },
  });
  if (!lender) throw new Error(`no primary lender for tenant ${tenantId}`);
  return lender;
}

// ---------------------------------------------------------------------------
// Volume: customers
// ---------------------------------------------------------------------------

async function addCustomers(cfg: TenantCfg, count: number): Promise<Array<{ id: string; idx: number }>> {
  const created: Array<{ id: string; idx: number }> = [];
  for (let i = 0; i < count; i++) {
    const idx = 100 + i; // base seed uses 0..19; start volume seed at 100 to avoid collisions
    const externalId = `STRESS-CUST-${cfg.countryShort}-${String(idx).padStart(4, '0')}`;
    const existing = await prisma.customer.findFirst({
      where: { tenantId: cfg.id, externalId, externalSource: cfg.externalSource },
    });
    if (existing) {
      created.push({ id: existing.id, idx });
      continue;
    }

    const firstName = pick(FIRST_NAMES, idx);
    const lastName = pick(LAST_NAMES, idx + 7);
    const fullName = `${firstName} ${lastName}`;
    const gender = idx % 2 === 0 ? ('female' as const) : ('male' as const);
    const kycLevel =
      idx % 10 < 2 ? ('tier_3' as const) : idx % 10 < 5 ? ('tier_2' as const) : ('tier_1' as const);
    const status = idx % 25 === 0 ? ('blacklisted' as const) : ('active' as const);
    const phone = `${cfg.phonePrefix}${String(700000000 + idx).slice(-cfg.phonePadLen)}`;

    const customer = await prisma.customer.create({
      data: {
        tenantId: cfg.id,
        externalId,
        externalSource: cfg.externalSource,
        fullName,
        dateOfBirth: new Date(1970 + (idx % 35), idx % 12, 1 + (idx * 3) % 28),
        gender,
        nationalId: cfg.nationalIdFmt(idx),
        nationalIdType: 'national_id',
        phonePrimary: phone,
        country: cfg.country,
        region: cfg.region,
        city: cfg.city,
        kycLevel,
        kycVerifiedAt: kycLevel !== 'tier_1' ? daysAgo(30 + (idx % 90)) : undefined,
        status,
        blacklistReason: status === 'blacklisted' ? 'Stress-seed blacklisted persona' : undefined,
        metadata: { registrationChannel: 'mobile_app', seedBatch: 'stress-volume' },
      },
    });

    // Consents (3 per customer).
    await prisma.customerConsent.createMany({
      data: [
        { tenantId: cfg.id, customerId: customer.id, consentType: 'data_access', granted: true, grantedAt: daysAgo(45), channel: 'mobile_app', version: 1 },
        { tenantId: cfg.id, customerId: customer.id, consentType: 'auto_deduction', granted: true, grantedAt: daysAgo(45), channel: 'mobile_app', version: 1 },
        { tenantId: cfg.id, customerId: customer.id, consentType: 'communications', granted: true, grantedAt: daysAgo(45), channel: 'mobile_app', version: 1 },
      ],
      skipDuplicates: true,
    });

    created.push({ id: customer.id, idx });
  }
  return created;
}

// ---------------------------------------------------------------------------
// Volume: loan requests
// ---------------------------------------------------------------------------

const LOAN_REQUEST_STATUS_DIST: Array<{ status: 'received' | 'scored' | 'approved' | 'offer_sent' | 'disbursed' | 'rejected' | 'declined'; count: number }> = [
  { status: 'received', count: 10 },
  { status: 'scored', count: 8 },
  { status: 'approved', count: 8 },
  { status: 'offer_sent', count: 6 },
  { status: 'disbursed', count: 8 },
  { status: 'rejected', count: 6 },
  { status: 'declined', count: 4 },
];

async function addLoanRequests(
  cfg: TenantCfg,
  customers: Array<{ id: string; idx: number }>,
  products: Array<{ id: string; minAmount: Prisma.Decimal | unknown; maxAmount: Prisma.Decimal | unknown }>,
): Promise<Array<{ id: string; customerId: string; productId: string; amount: number; tenor: number; status: string }>> {
  const out: Array<{ id: string; customerId: string; productId: string; amount: number; tenor: number; status: string }> = [];
  let seq = 0;
  for (const dist of LOAN_REQUEST_STATUS_DIST) {
    for (let j = 0; j < dist.count; j++) {
      const cust = customers[seq % customers.length];
      const prod = products[seq % products.length];
      const min = Number(prod.minAmount);
      const max = Number(prod.maxAmount);
      const amount = Math.round(min + (max - min) * (0.2 + (seq * 0.04) % 0.6));
      const tenor = 30 + (seq * 7) % 60;
      const idempotencyKey = `${cfg.slug}-stress-lr-${String(seq + 1).padStart(4, '0')}`;

      const existing = await prisma.loanRequest.findFirst({ where: { idempotencyKey } });
      if (existing) {
        out.push({ id: existing.id, customerId: cust.id, productId: prod.id, amount, tenor, status: dist.status });
        seq++;
        continue;
      }

      const lr = await prisma.loanRequest.create({
        data: {
          tenantId: cfg.id,
          idempotencyKey,
          customerId: cust.id,
          productId: prod.id,
          requestedAmount: amount,
          requestedTenor: tenor,
          currency: cfg.currency,
          channel: 'mobile_app',
          status: dist.status,
          rejectionReasons: dist.status === 'rejected'
            ? { reasons: ['Credit score below threshold', 'Insufficient transaction history'] }
            : undefined,
          approvedAmount: ['approved', 'offer_sent', 'disbursed'].includes(dist.status) ? amount : undefined,
          approvedTenor: ['approved', 'offer_sent', 'disbursed'].includes(dist.status) ? tenor : undefined,
          offerDetails: ['offer_sent', 'disbursed'].includes(dist.status)
            ? { interestRate: 12, totalCost: Math.round(amount * 1.06) }
            : undefined,
          offerExpiresAt: dist.status === 'offer_sent' ? daysFromNow(3) : undefined,
          acceptedAt: dist.status === 'disbursed' ? daysAgo(40 - seq) : undefined,
          metadata: { source: cfg.externalSource, seedBatch: 'stress-volume' },
          createdAt: daysAgo(60 - seq),
        },
      });
      out.push({ id: lr.id, customerId: cust.id, productId: prod.id, amount, tenor, status: dist.status });
      seq++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volume: contracts + schedules + repayments
// ---------------------------------------------------------------------------

const CONTRACT_DIST: Array<{ count: number; status: 'active' | 'overdue' | 'delinquent' | 'default_status' | 'settled'; classification: 'performing' | 'special_mention' | 'substandard' | 'doubtful' | 'loss'; dpd: number; paidPct: number }> = [
  { count: 12, status: 'active',         classification: 'performing',     dpd: 0,   paidPct: 0.4 },
  { count: 5,  status: 'overdue',        classification: 'special_mention', dpd: 12,  paidPct: 0.3 },
  { count: 3,  status: 'overdue',        classification: 'special_mention', dpd: 25,  paidPct: 0.2 },
  { count: 3,  status: 'delinquent',     classification: 'substandard',    dpd: 45,  paidPct: 0.15 },
  { count: 3,  status: 'default_status', classification: 'doubtful',       dpd: 95,  paidPct: 0.05 },
  { count: 4,  status: 'settled',        classification: 'performing',     dpd: 0,   paidPct: 1.0 },
];

async function addContracts(
  cfg: TenantCfg,
  lender: { id: string },
  customers: Array<{ id: string; idx: number }>,
  products: Array<{ id: string; minAmount: Prisma.Decimal | unknown; maxAmount: Prisma.Decimal | unknown }>,
) {
  // Need ~30 disbursed loan requests as the source for contracts.
  const totalContracts = CONTRACT_DIST.reduce((s, d) => s + d.count, 0);
  const sources: Array<{ lrId: string; customerId: string; productId: string; amount: number; tenor: number }> = [];

  for (let i = 0; i < totalContracts; i++) {
    const cust = customers[i % customers.length];
    const prod = products[i % products.length];
    const min = Number(prod.minAmount);
    const max = Number(prod.maxAmount);
    const amount = Math.round(min + (max - min) * (0.3 + (i * 0.03) % 0.5));
    const tenor = 30 + (i * 5) % 90;
    const idempotencyKey = `${cfg.slug}-stress-contract-lr-${String(i + 1).padStart(4, '0')}`;
    const existing = await prisma.loanRequest.findFirst({ where: { idempotencyKey } });
    const lr = existing ?? await prisma.loanRequest.create({
      data: {
        tenantId: cfg.id,
        idempotencyKey,
        customerId: cust.id,
        productId: prod.id,
        requestedAmount: amount,
        requestedTenor: tenor,
        currency: cfg.currency,
        channel: 'mobile_app',
        status: 'disbursed',
        approvedAmount: amount,
        approvedTenor: tenor,
        acceptedAt: daysAgo(60 + i),
        metadata: { source: cfg.externalSource, seedBatch: 'stress-volume' },
        createdAt: daysAgo(70 + i),
      },
    });
    sources.push({ lrId: lr.id, customerId: cust.id, productId: prod.id, amount, tenor });
  }

  // Now create contracts in the configured distribution.
  let ci = 0;
  const created: Array<{ id: string; customerId: string; principal: number; interest: number; totalCostCredit: number; tenorDays: number; disbursedDaysAgo: number; def: typeof CONTRACT_DIST[0] }> = [];
  for (const def of CONTRACT_DIST) {
    for (let k = 0; k < def.count; k++) {
      const src = sources[ci];
      ci++;
      const contractNumber = `LN-STRESS-${cfg.countryShort}-${String(ci).padStart(4, '0')}`;
      const existing = await prisma.contract.findFirst({ where: { tenantId: cfg.id, contractNumber } });

      const principal = src.amount;
      const interestRate = 12;
      const interestAmount = Math.round(principal * (interestRate / 100));
      const totalFees = Math.round(principal * 0.015);
      const totalCostCredit = principal + interestAmount + totalFees;
      const totalPaid = Math.round(totalCostCredit * def.paidPct);
      const totalOutstanding = totalCostCredit - totalPaid;
      const disbursedDaysAgo =
        def.status === 'settled' ? 90 :
        def.status === 'default_status' ? 130 :
        def.status === 'delinquent' ? 90 :
        def.status === 'overdue' ? 60 :
        45;
      const tenorDays = src.tenor;
      const startDate = daysAgo(disbursedDaysAgo);
      const maturityDate = daysFromNow(tenorDays - disbursedDaysAgo + 30);

      if (existing) {
        created.push({ id: existing.id, customerId: src.customerId, principal, interest: interestAmount, totalCostCredit, tenorDays, disbursedDaysAgo, def });
        continue;
      }

      const c = await prisma.contract.create({
        data: {
          tenantId: cfg.id,
          contractNumber,
          customerId: src.customerId,
          productId: src.productId,
          lenderId: lender.id,
          loanRequestId: src.lrId,
          principalAmount: principal,
          interestRate,
          interestAmount,
          totalFees,
          totalCostCredit,
          currency: cfg.currency,
          tenorDays,
          repaymentMethod: 'auto_deduction',
          startDate,
          maturityDate,
          firstPaymentDate: new Date(startDate.getTime() + 15 * 24 * 60 * 60 * 1000),
          outstandingPrincipal: Math.round(principal * (1 - def.paidPct * 0.8)),
          outstandingInterest: Math.round(interestAmount * (1 - def.paidPct)),
          outstandingFees: def.paidPct >= 0.3 ? 0 : totalFees,
          outstandingPenalties: def.dpd > 0 ? Math.round(principal * 0.02 * Math.ceil(def.dpd / 30)) : 0,
          totalOutstanding,
          totalPaid,
          daysPastDue: def.dpd,
          status: def.status,
          classification: def.classification,
          settledAt: def.status === 'settled' ? daysAgo(10) : undefined,
          defaultedAt: def.status === 'default_status' ? daysAgo(def.dpd - 90) : undefined,
        },
      });
      await prisma.loanRequest.update({ where: { id: src.lrId }, data: { contractId: c.id } });
      created.push({ id: c.id, customerId: src.customerId, principal, interest: interestAmount, totalCostCredit, tenorDays, disbursedDaysAgo, def });
    }
  }
  return created;
}

async function addSchedulesAndRepayments(
  cfg: TenantCfg,
  contracts: Awaited<ReturnType<typeof addContracts>>,
) {
  let scheduleRows = 0;
  let repaymentRows = 0;
  let repaymentSeq = 0;

  for (const c of contracts) {
    const existing = await prisma.repaymentScheduleEntry.count({ where: { contractId: c.id } });
    if (existing > 0) {
      scheduleRows += existing;
      continue;
    }

    const n = Math.max(3, Math.min(6, Math.ceil(c.tenorDays / 15)));
    const installmentPrincipal = Math.round(c.principal / n);
    const installmentInterest = Math.round(c.interest / n);
    const installmentFee = Math.round((c.totalCostCredit - c.principal - c.interest) / n);
    const installmentTotal = installmentPrincipal + installmentInterest + installmentFee;
    const intervalDays = Math.max(7, Math.round(c.tenorDays / n));

    const scheduleData: Prisma.RepaymentScheduleEntryCreateManyInput[] = [];
    for (let si = 0; si < n; si++) {
      const dueDate = new Date(daysAgo(c.disbursedDaysAgo).getTime() + (si + 1) * intervalDays * 24 * 60 * 60 * 1000);
      const isPast = dueDate < new Date();

      let status: 'paid' | 'pending' | 'overdue' = 'pending';
      let paidAmount = 0;
      let paidAt: Date | undefined;

      if (c.def.status === 'settled') {
        status = 'paid';
        paidAmount = installmentTotal;
        paidAt = new Date(dueDate.getTime() - 2 * 24 * 60 * 60 * 1000);
      } else if (c.def.status === 'active' && c.def.dpd === 0 && isPast) {
        status = 'paid';
        paidAmount = installmentTotal;
        paidAt = new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000);
      } else if (c.def.dpd > 0) {
        const paidInstallments = Math.max(0, Math.floor(n * c.def.paidPct));
        if (si < paidInstallments) {
          status = 'paid';
          paidAmount = installmentTotal;
          paidAt = new Date(dueDate.getTime() + 1 * 24 * 60 * 60 * 1000);
        } else if (isPast) {
          status = 'overdue';
        }
      }

      scheduleData.push({
        tenantId: cfg.id,
        contractId: c.id,
        installmentNumber: si + 1,
        dueDate,
        principalAmount: installmentPrincipal,
        interestAmount: installmentInterest,
        feeAmount: installmentFee,
        totalAmount: installmentTotal,
        paidAmount,
        status,
        paidAt: paidAt ?? null,
      });
    }
    await prisma.repaymentScheduleEntry.createMany({ data: scheduleData });
    scheduleRows += scheduleData.length;
  }

  // Repayments — one row per paid schedule entry.
  const repaymentData: Prisma.RepaymentCreateManyInput[] = [];
  for (const c of contracts) {
    const paidEntries = await prisma.repaymentScheduleEntry.findMany({
      where: { contractId: c.id, status: 'paid' },
      orderBy: { installmentNumber: 'asc' },
    });
    for (const entry of paidEntries) {
      repaymentSeq++;
      repaymentData.push({
        tenantId: cfg.id,
        contractId: c.id,
        customerId: c.customerId,
        amount: Number(entry.totalAmount),
        currency: cfg.currency,
        method: repaymentSeq % 2 === 0 ? 'auto_deduction' : 'manual',
        source: cfg.externalSource,
        externalRef: `STRESS-PAY-${cfg.countryShort}-${String(repaymentSeq).padStart(6, '0')}`,
        allocatedPrincipal: Number(entry.principalAmount ?? 0),
        allocatedInterest: Number(entry.interestAmount ?? 0),
        allocatedFees: Number(entry.feeAmount ?? 0),
        allocatedPenalties: 0,
        status: 'completed',
        receiptNumber: `STRESS-RCT-${cfg.countryShort}-${String(repaymentSeq).padStart(6, '0')}`,
        completedAt: entry.paidAt ?? daysAgo(20 - (repaymentSeq % 20)),
      });
    }
  }
  if (repaymentData.length > 0) {
    // skipDuplicates avoids rerun collisions on receiptNumber/externalRef.
    await prisma.repayment.createMany({ data: repaymentData, skipDuplicates: true });
    repaymentRows = repaymentData.length;
  }

  return { scheduleRows, repaymentRows };
}

// ---------------------------------------------------------------------------
// Edge case 1 — frequent defaulter (QuickCash GH)
// ---------------------------------------------------------------------------

async function edgeFrequentDefaulter(cfg: TenantCfg, lender: { id: string }, products: Array<{ id: string; minAmount: Prisma.Decimal | unknown; maxAmount: Prisma.Decimal | unknown }>) {
  const externalId = `EDGE-MULTI-DEFAULT-${cfg.countryShort}`;
  let cust = await prisma.customer.findFirst({ where: { tenantId: cfg.id, externalId } });
  if (!cust) {
    cust = await prisma.customer.create({
      data: {
        tenantId: cfg.id,
        externalId,
        externalSource: cfg.externalSource,
        fullName: 'Frequent Defaulter (test persona)',
        dateOfBirth: new Date(1985, 5, 12),
        gender: 'male',
        nationalId: cfg.nationalIdFmt(900),
        nationalIdType: 'national_id',
        phonePrimary: `${cfg.phonePrefix}999999999`.slice(0, cfg.phonePrefix.length + cfg.phonePadLen),
        country: cfg.country,
        region: cfg.region,
        city: cfg.city,
        kycLevel: 'tier_2',
        status: 'active',
        metadata: { seedBatch: 'edge-frequent-defaulter' },
      },
    });
  }

  const prod = products[0];
  const principal = Math.round(Number(prod.minAmount) * 2);
  for (let i = 1; i <= 3; i++) {
    const contractNumber = `LN-EDGE-MD-${cfg.countryShort}-${i}`;
    const existing = await prisma.contract.findFirst({ where: { tenantId: cfg.id, contractNumber } });
    if (existing) continue;

    const idempotencyKey = `${cfg.slug}-edge-md-lr-${i}`;
    const lr = await prisma.loanRequest.create({
      data: {
        tenantId: cfg.id,
        idempotencyKey,
        customerId: cust.id,
        productId: prod.id,
        requestedAmount: principal,
        requestedTenor: 60,
        currency: cfg.currency,
        channel: 'mobile_app',
        status: 'disbursed',
        approvedAmount: principal,
        approvedTenor: 60,
        acceptedAt: daysAgo(200 - i * 50),
        createdAt: daysAgo(210 - i * 50),
        metadata: { seedBatch: 'edge-frequent-defaulter' },
      },
    });
    const c = await prisma.contract.create({
      data: {
        tenantId: cfg.id,
        contractNumber,
        customerId: cust.id,
        productId: prod.id,
        lenderId: lender.id,
        loanRequestId: lr.id,
        principalAmount: principal,
        interestRate: 12,
        interestAmount: Math.round(principal * 0.12),
        totalFees: Math.round(principal * 0.015),
        totalCostCredit: Math.round(principal * 1.135),
        currency: cfg.currency,
        tenorDays: 60,
        repaymentMethod: 'auto_deduction',
        startDate: daysAgo(200 - i * 50),
        maturityDate: daysAgo(140 - i * 50),
        firstPaymentDate: daysAgo(185 - i * 50),
        outstandingPrincipal: Math.round(principal * 0.85),
        outstandingInterest: Math.round(principal * 0.12),
        outstandingFees: Math.round(principal * 0.015),
        outstandingPenalties: Math.round(principal * 0.05),
        totalOutstanding: Math.round(principal * 1.035),
        totalPaid: Math.round(principal * 0.1),
        daysPastDue: 120 + i * 20,
        status: 'default_status',
        classification: 'doubtful',
        defaultedAt: daysAgo(60 - i * 10),
      },
    });
    await prisma.loanRequest.update({ where: { id: lr.id }, data: { contractId: c.id } });
  }
}

// ---------------------------------------------------------------------------
// Edge case 2 — BNPL credit line at 100% utilization (Pesa Express KE)
// ---------------------------------------------------------------------------

async function edgeBnplAtCap(cfg: TenantCfg, products: Array<{ id: string; type: string }>) {
  const bnplProduct = products.find((p) => p.type === 'bnpl');
  if (!bnplProduct) return; // tenant has no BNPL product

  const externalId = `EDGE-BNPL-MAXED-${cfg.countryShort}`;
  let cust = await prisma.customer.findFirst({ where: { tenantId: cfg.id, externalId } });
  if (!cust) {
    cust = await prisma.customer.create({
      data: {
        tenantId: cfg.id,
        externalId,
        externalSource: cfg.externalSource,
        fullName: 'BNPL Maxed (test persona)',
        dateOfBirth: new Date(1990, 2, 8),
        gender: 'female',
        nationalId: cfg.nationalIdFmt(901),
        nationalIdType: 'national_id',
        phonePrimary: `${cfg.phonePrefix}888888888`.slice(0, cfg.phonePrefix.length + cfg.phonePadLen),
        country: cfg.country,
        region: cfg.region,
        city: cfg.city,
        kycLevel: 'tier_3',
        status: 'active',
        metadata: { seedBatch: 'edge-bnpl-cap' },
      },
    });
  }

  const sub = await prisma.subscription.upsert({
    where: {
      tenantId_customerId_productId: { tenantId: cfg.id, customerId: cust.id, productId: bnplProduct.id },
    },
    update: {},
    create: {
      tenantId: cfg.id,
      customerId: cust.id,
      productId: bnplProduct.id,
      creditLimit: 100000,
      availableLimit: 0,
      status: 'active',
      activatedAt: daysAgo(30),
    },
  });

  await prisma.bnplCreditLine.upsert({
    where: { subscriptionId: sub.id },
    update: {
      approvedLimit: 100000,
      availableLimit: 0,
    },
    create: {
      tenantId: cfg.id,
      customerId: cust.id,
      subscriptionId: sub.id,
      productId: bnplProduct.id,
      approvedLimit: 100000,
      availableLimit: 0,
      currency: cfg.currency,
      status: 'active',
      activatedAt: daysAgo(30),
    },
  });
}

// ---------------------------------------------------------------------------
// Edge case 3 — sanctions hit awaiting review (NairaLend NG)
// ---------------------------------------------------------------------------

async function edgeSanctionsHit(cfg: TenantCfg) {
  const externalId = `EDGE-SANCTIONS-${cfg.countryShort}`;
  let cust = await prisma.customer.findFirst({ where: { tenantId: cfg.id, externalId } });
  if (!cust) {
    cust = await prisma.customer.create({
      data: {
        tenantId: cfg.id,
        externalId,
        externalSource: cfg.externalSource,
        fullName: 'Sanctions Match (test persona)',
        dateOfBirth: new Date(1978, 8, 22),
        gender: 'male',
        nationalId: cfg.nationalIdFmt(902),
        nationalIdType: 'national_id',
        phonePrimary: `${cfg.phonePrefix}777777777`.slice(0, cfg.phonePrefix.length + cfg.phonePadLen),
        country: cfg.country,
        region: cfg.region,
        city: cfg.city,
        kycLevel: 'tier_3',
        status: 'active',
        metadata: { seedBatch: 'edge-sanctions' },
      },
    });
  }

  const existing = await prisma.screeningResult.findFirst({
    where: { tenantId: cfg.id, customerId: cust.id, status: 'POTENTIAL_MATCH', riskLevel: 'CRITICAL' },
  });
  if (existing) return;

  await prisma.screeningResult.create({
    data: {
      tenantId: cfg.id,
      customerId: cust.id,
      externalId: `edge-sanctions-${cfg.id.slice(0, 8)}`,
      provider: 'mock',
      status: 'POTENTIAL_MATCH',
      riskLevel: 'CRITICAL',
      matchCount: 2,
      matchDetails: [
        { matchId: 'edge-sanctions-001', matchType: 'SANCTIONS', entityName: cust.fullName, matchScore: 92, source: 'OFAC SDN List', details: { remarks: 'Edge-seed critical sanctions match — escalate' } },
        { matchId: 'edge-sanctions-002', matchType: 'SANCTIONS', entityName: cust.fullName, matchScore: 88, source: 'EU Consolidated List', details: { remarks: 'Cross-reference EU list' } },
      ],
      screenedAt: daysAgo(0),
      expiresAt: daysFromNow(30),
    },
  });
}

// ---------------------------------------------------------------------------
// Global: MFA-enabled platform user
// ---------------------------------------------------------------------------

async function addMfaPlatformUser() {
  const email = 'mfa-admin@lons.io';
  const emailHash = computeSearchableHash(email)!;
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });

  // Generate a real, working TOTP secret using the same library
  // (`otplib`) the app uses to verify codes. The `otpauth://` URI below
  // can be pasted into Google Authenticator / 1Password / Authy / etc.,
  // or rendered as a QR code, and the resulting 6-digit codes will be
  // accepted by the `verifyMfa` GraphQL mutation.
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(email, 'Lons Platform', secret);

  await prisma.platformUser.upsert({
    where: { emailHash },
    update: { mfaEnabled: true, mfaSecret: secret },
    create: {
      email,
      emailHash,
      passwordHash,
      name: 'MFA Test Admin',
      role: 'platform_admin',
      mfaEnabled: true,
      mfaSecret: secret,
      status: 'active',
    },
  });

  console.log('  TOTP secret (base32):  ', secret);
  console.log('  otpauth URI:           ', otpauthUri);
  console.log('  Current TOTP (now):    ', authenticator.generate(secret));
  console.log('  → Scan the otpauth URI into an authenticator app, then');
  console.log('    log in with verifyMfa(mfaToken, code).');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('============================================================');
  console.log('  Stress + edge-case test seed');
  console.log('============================================================\n');

  await prisma.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', false)`;

  const tenants = await loadTenants();
  if (tenants.length === 0) {
    throw new Error('No base-seed tenants found. Run `pnpm --filter database db:seed` first.');
  }

  for (const cfg of tenants) {
    console.log(`\n--- ${cfg.name} (${cfg.slug}) ---`);
    const lender = await loadLender(cfg.id);
    const products = await loadProducts(cfg.id);
    if (products.length === 0) {
      console.log('  No active products — skipping volume + edge cases for this tenant.');
      continue;
    }

    console.log('  [1/4] Customers (+60)...');
    const customers = await addCustomers(cfg, 60);
    console.log(`        ${customers.length} customers ready`);

    console.log('  [2/4] Loan requests (+50)...');
    const loanRequests = await addLoanRequests(cfg, customers, products);
    console.log(`        ${loanRequests.length} loan requests`);

    console.log('  [3/4] Contracts (+30)...');
    const contracts = await addContracts(cfg, lender, customers, products);
    const sched = await addSchedulesAndRepayments(cfg, contracts);
    console.log(`        ${contracts.length} contracts / ${sched.scheduleRows} schedule entries / ${sched.repaymentRows} repayments`);

    console.log('  [4/4] Edge case for this tenant...');
    if (cfg.slug === 'quickcash-gh') {
      await edgeFrequentDefaulter(cfg, lender, products);
      console.log('        Frequent defaulter (3 defaulted contracts) created');
    } else if (cfg.slug === 'pesa-express-ke') {
      await edgeBnplAtCap(cfg, products as unknown as Array<{ id: string; type: string }>);
      console.log('        BNPL credit line at 100% utilization created');
    } else if (cfg.slug === 'nairalend-ng') {
      await edgeSanctionsHit(cfg);
      console.log('        Critical sanctions hit awaiting review created');
    }
  }

  console.log('\n--- Global: MFA-enabled platform user ---');
  await addMfaPlatformUser();
  console.log('  mfa-admin@lons.io created with mfaEnabled=true');

  console.log('\n============================================================');
  console.log('  Test seed complete');
  console.log('============================================================');
}

main()
  .catch((e) => {
    console.error('Test seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
