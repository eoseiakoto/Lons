import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

async function createRoles(tenantId: string) {
  const allPermissions = [
    'tenant:create', 'tenant:read', 'tenant:update', 'tenant:suspend',
    'user:create', 'user:read', 'user:update', 'user:deactivate',
    'role:create', 'role:read', 'role:update', 'role:delete',
    'product:create', 'product:read', 'product:update', 'product:activate',
    'customer:create', 'customer:read', 'customer:update', 'customer:read_pii', 'customer:blacklist',
    'lender:create', 'lender:read', 'lender:update',
    'subscription:create', 'subscription:read', 'subscription:update',
    'loan_request:create', 'loan_request:read', 'loan_request:process',
    'contract:read', 'contract:update',
    'repayment:create', 'repayment:read',
    'audit:read', 'analytics:read',
  ];

  const roleDefinitions = {
    sp_admin: { name: 'SP Admin', permissions: allPermissions, isSystem: true },
    sp_operator: {
      name: 'SP Operator',
      permissions: [
        'product:read', 'customer:read', 'customer:create', 'customer:update',
        'loan_request:read', 'loan_request:create', 'loan_request:process',
        'contract:read', 'repayment:read', 'repayment:create',
        'subscription:read', 'subscription:create', 'subscription:update',
      ],
      isSystem: true,
    },
    sp_analyst: {
      name: 'SP Analyst',
      permissions: [
        'product:read', 'customer:read', 'loan_request:read',
        'contract:read', 'repayment:read', 'analytics:read',
      ],
      isSystem: true,
    },
    sp_auditor: {
      name: 'SP Auditor',
      permissions: [
        'product:read', 'customer:read', 'customer:read_pii',
        'loan_request:read', 'contract:read', 'repayment:read',
        'audit:read', 'analytics:read',
      ],
      isSystem: true,
    },
    sp_collections: {
      name: 'SP Collections',
      permissions: [
        'customer:read', 'customer:read_pii',
        'contract:read', 'contract:update',
        'repayment:read', 'repayment:create',
        'loan_request:read',
      ],
      isSystem: true,
    },
  };

  const roles: Record<string, { id: string }> = {};
  for (const [key, def] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: def.name } },
      update: { permissions: def.permissions },
      create: {
        tenantId,
        name: def.name,
        description: `System role: ${def.name}`,
        permissions: def.permissions,
        isSystem: def.isSystem,
      },
    });
    roles[key] = role;
  }

  return roles;
}

/** Return a date N days ago from now */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Return a date N days from now */
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** Deterministic pseudo-random phone digits */
function phoneDigits(len: number, seed: number): string {
  let s = '';
  let v = seed;
  for (let i = 0; i < len; i++) {
    v = (v * 1103515245 + 12345) & 0x7fffffff;
    s += (v % 10).toString();
  }
  return s;
}

// ---------------------------------------------------------------------------
// Tenant configuration
// ---------------------------------------------------------------------------

interface TenantConfig {
  name: string;
  slug: string;
  legalName: string;
  regNumber: string;
  country: string;
  schemaName: string;
  planTier: 'starter' | 'professional' | 'enterprise';
  currency: string;
  timezone: string;
  emailDomain: string;
  lender: {
    name: string;
    license: string;
    capacity: number;
    minRate: number;
    maxRate: number;
    settlementProvider: string;
  };
  products: Array<{
    code: string;
    name: string;
    description: string;
    type: 'overdraft' | 'micro_loan' | 'bnpl' | 'invoice_financing';
    minAmount: number;
    maxAmount: number;
    minTenorDays: number;
    maxTenorDays: number;
    interestRateModel: 'flat' | 'reducing_balance';
    interestRate: number;
    feeStructure: object;
    repaymentMethod: 'auto_deduction' | 'equal_installments' | 'lump_sum';
    gracePeriodDays: number;
    penaltyConfig: object;
    approvalWorkflow: 'auto' | 'semi_auto';
    approvalThresholds?: object;
    eligibilityRules: object;
    revenueSharing: object;
    maxActiveLoans: number;
    status: 'draft' | 'active' | 'suspended';
  }>;
  customers: Array<{ fullName: string; gender: 'male' | 'female' }>;
  phonePrefix: string;
  phonePadLen: number;
  externalSource: string;
  nationalIdType: string;
  nationalIdFmt: (idx: number) => string;
  regions: string[];
  cities: string[];
}

const TENANTS: TenantConfig[] = [
  // ============================== GHANA ==============================
  {
    name: 'QuickCash Ghana',
    slug: 'quickcash-gh',
    legalName: 'QuickCash Financial Services Ltd',
    regNumber: 'GHA-REG-2024-001',
    country: 'GHA',
    schemaName: 'tenant_quickcash_gh',
    planTier: 'professional',
    currency: 'GHS',
    timezone: 'Africa/Accra',
    emailDomain: 'quickcash.gh',
    lender: {
      name: 'GoldStar Capital',
      license: 'LIC-GHA-2024-001',
      capacity: 5_000_000,
      minRate: 0,
      maxRate: 35,
      settlementProvider: 'mtn_momo',
    },
    products: [
      {
        code: 'OD-GHS-001', name: 'Instant Overdraft',
        description: 'Short-term overdraft facility triggered when wallet balance is insufficient',
        type: 'overdraft', minAmount: 10, maxAmount: 5_000, minTenorDays: 1, maxTenorDays: 30,
        interestRateModel: 'flat', interestRate: 5.0,
        feeStructure: { origination: { type: 'percentage', value: 1.5 } },
        repaymentMethod: 'auto_deduction', gracePeriodDays: 0,
        penaltyConfig: { type: 'percentage', rate: 2.0, cap: 25.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minTransactionHistory: 30 },
        revenueSharing: { lender: 60, sp: 25, emi: 10, platform: 5 }, maxActiveLoans: 1, status: 'active',
      },
      {
        code: 'ML-GHS-001', name: 'Quick Micro-Loan',
        description: 'Small-amount loan for short-term needs',
        type: 'micro_loan', minAmount: 50, maxAmount: 10_000, minTenorDays: 7, maxTenorDays: 90,
        interestRateModel: 'reducing_balance', interestRate: 12.0,
        feeStructure: { origination: { type: 'flat', value: 5.0 }, service: { type: 'percentage', value: 0.5 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 3,
        penaltyConfig: { type: 'percentage', rate: 1.5, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', approvalThresholds: { autoApproveBelow: 1000 },
        eligibilityRules: { minKycLevel: 'tier_1', minAccountAge: 60 },
        revenueSharing: { lender: 55, sp: 30, emi: 10, platform: 5 }, maxActiveLoans: 2, status: 'active',
      },
      {
        code: 'BNPL-GHS-001', name: 'Pay Later at Checkout',
        description: 'Buy now, pay in installments at participating merchants',
        type: 'bnpl', minAmount: 20, maxAmount: 5_000, minTenorDays: 14, maxTenorDays: 90,
        interestRateModel: 'flat', interestRate: 0.0,
        feeStructure: { merchant: { type: 'percentage', value: 3.0 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 0,
        penaltyConfig: { type: 'flat', rate: 5.0, cap: 50.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minCreditScore: 500 },
        revenueSharing: { lender: 50, sp: 30, emi: 10, platform: 10 }, maxActiveLoans: 3, status: 'active',
      },
      {
        code: 'IF-GHS-001', name: 'Invoice Advance',
        description: 'Advance financing against verified invoices',
        type: 'invoice_financing', minAmount: 500, maxAmount: 50_000, minTenorDays: 30, maxTenorDays: 180,
        interestRateModel: 'flat', interestRate: 8.0,
        feeStructure: { origination: { type: 'percentage', value: 2.0 } },
        repaymentMethod: 'lump_sum', gracePeriodDays: 5,
        penaltyConfig: { type: 'percentage', rate: 2.5, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', eligibilityRules: { minKycLevel: 'tier_2', minAccountAge: 180 },
        revenueSharing: { lender: 55, sp: 25, emi: 10, platform: 10 }, maxActiveLoans: 2, status: 'draft',
      },
    ],
    customers: [
      { fullName: 'Kwame Asante', gender: 'male' },
      { fullName: 'Ama Mensah', gender: 'female' },
      { fullName: 'Kofi Owusu', gender: 'male' },
      { fullName: 'Abena Boateng', gender: 'female' },
      { fullName: 'Yaw Adjei', gender: 'male' },
      { fullName: 'Efua Darko', gender: 'female' },
      { fullName: 'Kweku Annan', gender: 'male' },
      { fullName: 'Akua Frimpong', gender: 'female' },
      { fullName: 'Nana Appiah', gender: 'male' },
      { fullName: 'Adwoa Osei', gender: 'female' },
      { fullName: 'Kojo Tetteh', gender: 'male' },
      { fullName: 'Afia Agyemang', gender: 'female' },
      { fullName: 'Kwabena Amponsah', gender: 'male' },
      { fullName: 'Akosua Badu', gender: 'female' },
      { fullName: 'Papa Kwesi Brew', gender: 'male' },
      { fullName: 'Maame Serwaa Bonsu', gender: 'female' },
      { fullName: 'Nii Laryea Quaye', gender: 'male' },
      { fullName: 'Korkor Amarteifio', gender: 'female' },
      { fullName: 'Edem Gakpo', gender: 'male' },
      { fullName: 'Dzifa Aku', gender: 'female' },
    ],
    phonePrefix: '+23324',
    phonePadLen: 7,
    externalSource: 'mtn_momo',
    nationalIdType: 'ghana_card',
    nationalIdFmt: (i) => `GHA-${String(1000 + i * 17).padStart(4, '0')}-${String(2000 + i * 31).padStart(4, '0')}`,
    regions: ['Greater Accra', 'Ashanti', 'Western', 'Central'],
    cities: ['Accra', 'Kumasi', 'Takoradi', 'Cape Coast'],
  },

  // ============================== KENYA ==============================
  {
    name: 'Pesa Express Kenya',
    slug: 'pesa-express-ke',
    legalName: 'Pesa Express Financial Technologies Ltd',
    regNumber: 'KEN-REG-2024-001',
    country: 'KEN',
    schemaName: 'tenant_pesa_ke',
    planTier: 'enterprise',
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    emailDomain: 'pesaexpress.ke',
    lender: {
      name: 'Savanna Finance',
      license: 'LIC-KEN-2024-001',
      capacity: 60_000_000,
      minRate: 0,
      maxRate: 30,
      settlementProvider: 'mpesa',
    },
    products: [
      {
        code: 'OD-KES-001', name: 'Haraka Overdraft',
        description: 'Instant overdraft for M-Pesa wallet shortfalls',
        type: 'overdraft', minAmount: 100, maxAmount: 60_000, minTenorDays: 1, maxTenorDays: 30,
        interestRateModel: 'flat', interestRate: 4.0,
        feeStructure: { origination: { type: 'percentage', value: 1.0 } },
        repaymentMethod: 'auto_deduction', gracePeriodDays: 0,
        penaltyConfig: { type: 'percentage', rate: 2.0, cap: 25.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minTransactionHistory: 30 },
        revenueSharing: { lender: 60, sp: 25, emi: 10, platform: 5 }, maxActiveLoans: 1, status: 'active',
      },
      {
        code: 'ML-KES-001', name: 'Safari Micro-Loan',
        description: 'Short-term micro-loan for everyday needs',
        type: 'micro_loan', minAmount: 500, maxAmount: 120_000, minTenorDays: 7, maxTenorDays: 90,
        interestRateModel: 'reducing_balance', interestRate: 10.0,
        feeStructure: { origination: { type: 'flat', value: 50.0 }, service: { type: 'percentage', value: 0.5 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 3,
        penaltyConfig: { type: 'percentage', rate: 1.5, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', approvalThresholds: { autoApproveBelow: 10000 },
        eligibilityRules: { minKycLevel: 'tier_1', minAccountAge: 60 },
        revenueSharing: { lender: 55, sp: 30, emi: 10, platform: 5 }, maxActiveLoans: 2, status: 'active',
      },
      {
        code: 'BNPL-KES-001', name: 'Lipa Pole Pole',
        description: 'Buy now, pay in installments across Kenya',
        type: 'bnpl', minAmount: 200, maxAmount: 60_000, minTenorDays: 14, maxTenorDays: 90,
        interestRateModel: 'flat', interestRate: 0.0,
        feeStructure: { merchant: { type: 'percentage', value: 3.5 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 0,
        penaltyConfig: { type: 'flat', rate: 50.0, cap: 500.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minCreditScore: 500 },
        revenueSharing: { lender: 50, sp: 30, emi: 10, platform: 10 }, maxActiveLoans: 3, status: 'active',
      },
      {
        code: 'IF-KES-001', name: 'Invoice Express',
        description: 'Advance financing against verified invoices for SMEs',
        type: 'invoice_financing', minAmount: 5_000, maxAmount: 600_000, minTenorDays: 30, maxTenorDays: 180,
        interestRateModel: 'flat', interestRate: 7.0,
        feeStructure: { origination: { type: 'percentage', value: 2.0 } },
        repaymentMethod: 'lump_sum', gracePeriodDays: 5,
        penaltyConfig: { type: 'percentage', rate: 2.5, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', eligibilityRules: { minKycLevel: 'tier_2', minAccountAge: 180 },
        revenueSharing: { lender: 55, sp: 25, emi: 10, platform: 10 }, maxActiveLoans: 2, status: 'suspended',
      },
    ],
    customers: [
      { fullName: 'Wanjiku Kamau', gender: 'female' },
      { fullName: 'James Omondi', gender: 'male' },
      { fullName: 'Grace Achieng', gender: 'female' },
      { fullName: 'Peter Kipchoge', gender: 'male' },
      { fullName: 'Faith Nyambura', gender: 'female' },
      { fullName: 'David Mwangi', gender: 'male' },
      { fullName: 'Esther Wambui', gender: 'female' },
      { fullName: 'Brian Otieno', gender: 'male' },
      { fullName: 'Mercy Muthoni', gender: 'female' },
      { fullName: 'George Kariuki', gender: 'male' },
      { fullName: 'Agnes Chebet', gender: 'female' },
      { fullName: 'Samuel Njoroge', gender: 'male' },
      { fullName: 'Beatrice Wairimu', gender: 'female' },
      { fullName: 'Joseph Kiprotich', gender: 'male' },
      { fullName: 'Tabitha Njeri', gender: 'female' },
      { fullName: 'Patrick Odhiambo', gender: 'male' },
      { fullName: 'Caroline Mwende', gender: 'female' },
      { fullName: 'Daniel Rotich', gender: 'male' },
      { fullName: 'Joyce Atieno', gender: 'female' },
      { fullName: 'Stephen Muturi', gender: 'male' },
    ],
    phonePrefix: '+2547',
    phonePadLen: 8,
    externalSource: 'mpesa',
    nationalIdType: 'national_id',
    nationalIdFmt: (i) => `KEN-${String(10000 + i * 137).padStart(5, '0')}-${String(100 + i * 7).padStart(3, '0')}`,
    regions: ['Nairobi', 'Central', 'Rift Valley', 'Coast'],
    cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
  },

  // ============================== NIGERIA ==============================
  {
    name: 'NairaLend Nigeria',
    slug: 'nairalend-ng',
    legalName: 'NairaLend Microfinance Bank Ltd',
    regNumber: 'NGA-REG-2024-001',
    country: 'NGA',
    schemaName: 'tenant_naira_ng',
    planTier: 'starter',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    emailDomain: 'nairalend.ng',
    lender: {
      name: 'Atlas Microfinance',
      license: 'LIC-NGA-2024-001',
      capacity: 900_000_000,
      minRate: 0,
      maxRate: 40,
      settlementProvider: 'bank_transfer',
    },
    products: [
      {
        code: 'OD-NGN-001', name: 'Naira Overdraft',
        description: 'Instant overdraft for bank account shortfalls',
        type: 'overdraft', minAmount: 2_000, maxAmount: 900_000, minTenorDays: 1, maxTenorDays: 30,
        interestRateModel: 'flat', interestRate: 6.0,
        feeStructure: { origination: { type: 'percentage', value: 1.5 } },
        repaymentMethod: 'auto_deduction', gracePeriodDays: 0,
        penaltyConfig: { type: 'percentage', rate: 2.0, cap: 25.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minTransactionHistory: 30 },
        revenueSharing: { lender: 60, sp: 25, emi: 10, platform: 5 }, maxActiveLoans: 1, status: 'active',
      },
      {
        code: 'ML-NGN-001', name: 'Quick Naira Loan',
        description: 'Short-term micro-loan in Naira',
        type: 'micro_loan', minAmount: 10_000, maxAmount: 1_800_000, minTenorDays: 7, maxTenorDays: 90,
        interestRateModel: 'reducing_balance', interestRate: 15.0,
        feeStructure: { origination: { type: 'flat', value: 1000 }, service: { type: 'percentage', value: 0.5 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 3,
        penaltyConfig: { type: 'percentage', rate: 2.0, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', approvalThresholds: { autoApproveBelow: 200000 },
        eligibilityRules: { minKycLevel: 'tier_1', minAccountAge: 60 },
        revenueSharing: { lender: 55, sp: 30, emi: 10, platform: 5 }, maxActiveLoans: 2, status: 'active',
      },
      {
        code: 'BNPL-NGN-001', name: 'Buy Now Naija',
        description: 'Buy now, pay in installments at Nigerian merchants',
        type: 'bnpl', minAmount: 5_000, maxAmount: 900_000, minTenorDays: 14, maxTenorDays: 90,
        interestRateModel: 'flat', interestRate: 0.0,
        feeStructure: { merchant: { type: 'percentage', value: 4.0 } },
        repaymentMethod: 'equal_installments', gracePeriodDays: 0,
        penaltyConfig: { type: 'flat', rate: 500.0, cap: 5000.0, compound: false },
        approvalWorkflow: 'auto', eligibilityRules: { minKycLevel: 'tier_1', minCreditScore: 500 },
        revenueSharing: { lender: 50, sp: 30, emi: 10, platform: 10 }, maxActiveLoans: 3, status: 'draft',
      },
      {
        code: 'IF-NGN-001', name: 'Naira Invoice Finance',
        description: 'Invoice factoring for Nigerian businesses',
        type: 'invoice_financing', minAmount: 100_000, maxAmount: 9_000_000, minTenorDays: 30, maxTenorDays: 180,
        interestRateModel: 'flat', interestRate: 10.0,
        feeStructure: { origination: { type: 'percentage', value: 2.5 } },
        repaymentMethod: 'lump_sum', gracePeriodDays: 5,
        penaltyConfig: { type: 'percentage', rate: 3.0, cap: 30.0, compound: false },
        approvalWorkflow: 'semi_auto', eligibilityRules: { minKycLevel: 'tier_2', minAccountAge: 180 },
        revenueSharing: { lender: 55, sp: 25, emi: 10, platform: 10 }, maxActiveLoans: 2, status: 'draft',
      },
    ],
    customers: [
      { fullName: 'Chidinma Okafor', gender: 'female' },
      { fullName: 'Oluwaseun Adeyemi', gender: 'male' },
      { fullName: 'Amaka Eze', gender: 'female' },
      { fullName: 'Emeka Nwosu', gender: 'male' },
      { fullName: 'Ngozi Igwe', gender: 'female' },
      { fullName: 'Tunde Bakare', gender: 'male' },
      { fullName: 'Funke Adesanya', gender: 'female' },
      { fullName: 'Chukwudi Obi', gender: 'male' },
      { fullName: 'Blessing Umeh', gender: 'female' },
      { fullName: 'Segun Alabi', gender: 'male' },
      { fullName: 'Kemi Fashola', gender: 'female' },
      { fullName: 'Obinna Mba', gender: 'male' },
      { fullName: 'Yetunde Oladipo', gender: 'female' },
      { fullName: 'Ikenna Chukwu', gender: 'male' },
      { fullName: 'Aisha Bello', gender: 'female' },
      { fullName: 'Femi Akindele', gender: 'male' },
      { fullName: 'Halima Yusuf', gender: 'female' },
      { fullName: 'Chinedu Okwu', gender: 'male' },
      { fullName: 'Nkechi Nnadi', gender: 'female' },
      { fullName: 'Babatunde Ogundimu', gender: 'male' },
    ],
    phonePrefix: '+234',
    phonePadLen: 10,
    externalSource: 'bank_transfer',
    nationalIdType: 'nin',
    nationalIdFmt: (i) => `NGA-${String(1000 + i * 23).padStart(4, '0')}-${String(10000 + i * 43).padStart(5, '0')}`,
    regions: ['Lagos', 'Abuja FCT', 'Rivers', 'Kano'],
    cities: ['Lagos', 'Abuja', 'Port Harcourt', 'Kano'],
  },
];

// ---------------------------------------------------------------------------
// Country code -> 3-letter abbreviation used in contract numbers
// ---------------------------------------------------------------------------
const COUNTRY_SHORT: Record<string, string> = { GHA: 'GHA', KEN: 'KEN', NGA: 'NGA' };

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('============================================================');
  console.log('  Seeding Lons platform with multi-country data');
  console.log('============================================================\n');

  // -----------------------------------------------------------------------
  // 1. Platform admin (shared across all tenants)
  // -----------------------------------------------------------------------
  console.log('[1/8] Creating platform admin...');
  const adminPasswordHash = await hashPassword('AdminPass123!@#');
  const platformAdmin = await prisma.platformUser.upsert({
    where: { email: 'admin@lons.io' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'admin@lons.io',
      passwordHash: adminPasswordHash,
      name: 'Platform Admin',
      role: 'platform_admin',
      mfaEnabled: false,
      status: 'active',
    },
  });
  console.log(`  Created platform admin: ${platformAdmin.email}`);

  // -----------------------------------------------------------------------
  // Loop through each tenant
  // -----------------------------------------------------------------------
  for (let ti = 0; ti < TENANTS.length; ti++) {
    const cfg = TENANTS[ti];
    const label = `[Tenant ${ti + 1}/${TENANTS.length}] ${cfg.name}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'='.repeat(60)}`);

    // ---------------------------------------------------------------------
    // 2. Create tenant
    // ---------------------------------------------------------------------
    console.log(`\n[2/8] Creating tenant: ${cfg.name}...`);
    const tenant = await prisma.tenant.upsert({
      where: { schemaName: cfg.schemaName },
      update: {},
      create: {
        name: cfg.name,
        slug: cfg.slug,
        legalName: cfg.legalName,
        registrationNumber: cfg.regNumber,
        country: cfg.country,
        schemaName: cfg.schemaName,
        planTier: cfg.planTier,
        status: 'active',
        settings: {
          currencies: [cfg.currency],
          timezone: cfg.timezone,
          businessHours: { start: '08:00', end: '17:00' },
        },
      },
    });
    console.log(`  Tenant ID: ${tenant.id}`);

    // ---------------------------------------------------------------------
    // 3. Create roles
    // ---------------------------------------------------------------------
    console.log('[3/8] Creating roles...');
    const roles = await createRoles(tenant.id);
    console.log(`  Created ${Object.keys(roles).length} roles`);

    // ---------------------------------------------------------------------
    // 4. Create users (5 per tenant)
    // ---------------------------------------------------------------------
    console.log('[4/8] Creating users...');
    const userDefs = [
      { key: 'sp_admin', email: `spadmin@${cfg.emailDomain}`, password: 'SpAdmin123!@#', name: `${cfg.name} Admin` },
      { key: 'sp_operator', email: `operator@${cfg.emailDomain}`, password: 'Operator123!@#', name: `${cfg.name} Operator` },
      { key: 'sp_analyst', email: `analyst@${cfg.emailDomain}`, password: 'Analyst123!@#', name: `${cfg.name} Analyst` },
      { key: 'sp_auditor', email: `auditor@${cfg.emailDomain}`, password: 'Auditor123!@#', name: `${cfg.name} Auditor` },
      { key: 'sp_collections', email: `collections@${cfg.emailDomain}`, password: 'Collections123!@#', name: `${cfg.name} Collections` },
    ];

    let spAdminId: string = '';
    for (const u of userDefs) {
      const roleObj = roles[u.key];
      if (!roleObj) { console.log(`  Skipping ${u.email} — role not found`); continue; }
      const pwHash = await hashPassword(u.password);
      const user = await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
        update: { passwordHash: pwHash },
        create: {
          tenantId: tenant.id,
          email: u.email,
          passwordHash: pwHash,
          name: u.name,
          roleId: roleObj.id,
          mfaEnabled: false,
          status: 'active',
        },
      });
      if (u.key === 'sp_admin') spAdminId = user.id;
      console.log(`  Created user: ${u.email} (${u.key})`);
    }

    // ---------------------------------------------------------------------
    // 5. Create lender
    // ---------------------------------------------------------------------
    console.log('[5/8] Creating lender...');
    const existingLender = await prisma.lender.findFirst({
      where: { tenantId: tenant.id, licenseNumber: cfg.lender.license },
    });
    const lender = existingLender ?? await prisma.lender.create({
      data: {
        tenantId: tenant.id,
        name: cfg.lender.name,
        licenseNumber: cfg.lender.license,
        country: cfg.country,
        fundingCapacity: cfg.lender.capacity,
        fundingCurrency: cfg.currency,
        minInterestRate: cfg.lender.minRate,
        maxInterestRate: cfg.lender.maxRate,
        settlementAccount: { provider: cfg.lender.settlementProvider, accountId: `${cfg.slug.toUpperCase()}-SETTLE-001` },
        riskParameters: { maxExposure: cfg.lender.capacity * 0.2, singleBorrowerLimit: cfg.lender.capacity * 0.01 },
        status: 'active',
      },
    });
    console.log(`  Lender: ${lender.name} (${lender.id})`);

    // ---------------------------------------------------------------------
    // 6. Create products (4 per tenant)
    // ---------------------------------------------------------------------
    console.log('[6/8] Creating products...');
    const productRecords: Array<{ id: string; code: string; type: string; currency: string; minAmount: number; maxAmount: number; status: string }> = [];
    for (const p of cfg.products) {
      const product = await prisma.product.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
        update: {},
        create: {
          tenantId: tenant.id,
          code: p.code,
          name: p.name,
          description: p.description,
          type: p.type,
          lenderId: lender.id,
          currency: cfg.currency,
          minAmount: p.minAmount,
          maxAmount: p.maxAmount,
          minTenorDays: p.minTenorDays,
          maxTenorDays: p.maxTenorDays,
          interestRateModel: p.interestRateModel,
          interestRate: p.interestRate,
          feeStructure: p.feeStructure as Prisma.InputJsonValue,
          repaymentMethod: p.repaymentMethod,
          gracePeriodDays: p.gracePeriodDays,
          penaltyConfig: p.penaltyConfig as Prisma.InputJsonValue,
          approvalWorkflow: p.approvalWorkflow,
          approvalThresholds: p.approvalThresholds ? (p.approvalThresholds as Prisma.InputJsonValue) : undefined,
          eligibilityRules: p.eligibilityRules as Prisma.InputJsonValue,
          revenueSharing: p.revenueSharing as Prisma.InputJsonValue,
          maxActiveLoans: p.maxActiveLoans,
          status: p.status,
          activatedAt: p.status === 'active' ? new Date() : undefined,
          createdBy: spAdminId || undefined,
        },
      });
      productRecords.push({
        id: product.id,
        code: product.code,
        type: p.type,
        currency: cfg.currency,
        minAmount: p.minAmount,
        maxAmount: p.maxAmount,
        status: p.status,
      });
      console.log(`  Product: ${p.code} (${p.status})`);
    }

    // Active products only for subscriptions / loan requests
    const activeProducts = productRecords.filter((p) => p.status === 'active');

    // ---------------------------------------------------------------------
    // 7. Create customers (20 per tenant) with consents
    // ---------------------------------------------------------------------
    console.log('[7/8] Creating customers...');
    interface CustomerRecord { id: string; idx: number; fullName: string }
    const customerRecords: CustomerRecord[] = [];

    for (let i = 0; i < cfg.customers.length; i++) {
      const c = cfg.customers[i];
      const externalId = `EMI-CUST-${String(i + 1).padStart(4, '0')}`;
      const phone = cfg.phonePrefix + phoneDigits(cfg.phonePadLen, (ti + 1) * 10000 + i);

      // Determine KYC level: 60% tier_1, 30% tier_2, 10% tier_3
      let kycLevel: 'tier_1' | 'tier_2' | 'tier_3' = 'tier_1';
      if (i % 10 < 2) kycLevel = 'tier_3';
      else if (i % 10 < 5) kycLevel = 'tier_2';

      // 2 per tenant blacklisted (indices 18, 19)
      const status = i >= 18 ? 'blacklisted' as const : 'active' as const;

      const existingCustomer = await prisma.customer.findFirst({
        where: { tenantId: tenant.id, externalId, externalSource: cfg.externalSource },
      });
      const customer = existingCustomer ?? await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          externalId,
          externalSource: cfg.externalSource,
          fullName: c.fullName,
          dateOfBirth: new Date(1980 + (i % 20), i % 12, 1 + (i * 3) % 28),
          gender: c.gender,
          nationalId: cfg.nationalIdFmt(i),
          nationalIdType: cfg.nationalIdType,
          phonePrimary: phone,
          country: cfg.country,
          region: cfg.regions[i % cfg.regions.length],
          city: cfg.cities[i % cfg.cities.length],
          kycLevel,
          kycVerifiedAt: kycLevel !== 'tier_1' ? daysAgo(90 + i * 5) : undefined,
          status,
          blacklistReason: status === 'blacklisted' ? 'Multiple loan defaults and fraudulent documentation' : undefined,
          metadata: { registrationChannel: 'mobile_app' },
        },
      });

      // Create consents (skip if already exist)
      const existingConsents = await prisma.customerConsent.count({ where: { customerId: customer.id } });
      if (existingConsents === 0) {
        await prisma.customerConsent.createMany({
          data: [
            { tenantId: tenant.id, customerId: customer.id, consentType: 'data_access', granted: true, grantedAt: daysAgo(60), channel: 'mobile_app', version: 1 },
            { tenantId: tenant.id, customerId: customer.id, consentType: 'auto_deduction', granted: true, grantedAt: daysAgo(60), channel: 'mobile_app', version: 1 },
            { tenantId: tenant.id, customerId: customer.id, consentType: 'communications', granted: true, grantedAt: daysAgo(60), channel: 'mobile_app', version: 1 },
          ],
        });
      }

      customerRecords.push({ id: customer.id, idx: i, fullName: c.fullName });
    }
    console.log(`  Created ${customerRecords.length} customers with consents`);

    // Only non-blacklisted customers participate in loans
    const eligibleCustomers = customerRecords.filter((c) => c.idx < 18);

    // ---------------------------------------------------------------------
    // 8. Create subscriptions, loan requests, contracts, schedules, repayments
    // ---------------------------------------------------------------------
    console.log('[8/8] Creating subscriptions, loan requests, contracts, schedules, repayments...');

    // -- 8a. Subscriptions (10 per tenant) --------------------------------
    const subscriptionCustomers = eligibleCustomers.slice(0, 10);
    const subscriptionRecords: Array<{ id: string; customerId: string; productId: string }> = [];
    for (let si = 0; si < subscriptionCustomers.length; si++) {
      const cust = subscriptionCustomers[si];
      const prod = activeProducts[si % activeProducts.length];
      // Credit limit: mid-range of product min/max
      const creditLimit = Math.round((prod.minAmount + prod.maxAmount) / 2);

      const existing = await prisma.subscription.findFirst({
        where: { tenantId: tenant.id, customerId: cust.id, productId: prod.id },
      });
      const sub = existing ?? await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          customerId: cust.id,
          productId: prod.id,
          creditLimit,
          availableLimit: creditLimit,
          status: 'active',
          activatedAt: daysAgo(45 + si * 3),
        },
      });
      subscriptionRecords.push({ id: sub.id, customerId: cust.id, productId: prod.id });
    }
    console.log(`  Created ${subscriptionRecords.length} subscriptions`);

    // -- 8b. Loan Requests (15 per tenant) --------------------------------
    /*
     * Status distribution:
     *  3 × received, 2 × scored, 2 × approved, 2 × offer_sent,
     *  3 × disbursed, 2 × rejected, 1 × declined
     */
    const loanRequestStatuses: Array<{
      status: 'received' | 'scored' | 'approved' | 'offer_sent' | 'disbursed' | 'rejected' | 'declined';
      count: number;
    }> = [
      { status: 'received', count: 3 },
      { status: 'scored', count: 2 },
      { status: 'approved', count: 2 },
      { status: 'offer_sent', count: 2 },
      { status: 'disbursed', count: 3 },
      { status: 'rejected', count: 2 },
      { status: 'declined', count: 1 },
    ];

    interface LoanRequestRecord {
      id: string;
      customerId: string;
      productId: string;
      requestedAmount: number;
      requestedTenor: number;
      status: string;
    }
    const loanRequestRecords: LoanRequestRecord[] = [];
    let lrIdx = 0;

    for (const lrs of loanRequestStatuses) {
      for (let j = 0; j < lrs.count; j++) {
        const cust = eligibleCustomers[lrIdx % eligibleCustomers.length];
        const prod = activeProducts[lrIdx % activeProducts.length];
        const requestedAmount = Math.round(prod.minAmount + (prod.maxAmount - prod.minAmount) * (0.2 + (lrIdx * 0.05)));
        const requestedTenor = Math.min(prod.maxAmount === prod.minAmount ? 30 : 30 + lrIdx * 5, 90);
        const idempotencyKey = `${cfg.slug}-lr-${String(lrIdx + 1).padStart(4, '0')}`;

        // Check if already exists
        const existing = await prisma.loanRequest.findFirst({
          where: { idempotencyKey },
        });
        if (existing) {
          loanRequestRecords.push({
            id: existing.id,
            customerId: cust.id,
            productId: prod.id,
            requestedAmount,
            requestedTenor,
            status: lrs.status,
          });
          lrIdx++;
          continue;
        }

        const lr = await prisma.loanRequest.create({
          data: {
            tenantId: tenant.id,
            idempotencyKey,
            customerId: cust.id,
            productId: prod.id,
            requestedAmount,
            requestedTenor,
            currency: cfg.currency,
            channel: 'mobile_app',
            status: lrs.status,
            rejectionReasons: lrs.status === 'rejected'
              ? { reasons: ['Credit score below threshold', 'Insufficient transaction history'] }
              : undefined,
            approvedAmount: ['approved', 'offer_sent', 'disbursed'].includes(lrs.status)
              ? requestedAmount
              : undefined,
            approvedTenor: ['approved', 'offer_sent', 'disbursed'].includes(lrs.status)
              ? requestedTenor
              : undefined,
            offerDetails: ['offer_sent', 'disbursed'].includes(lrs.status)
              ? { interestRate: prod.type === 'overdraft' ? 5 : 12, totalCost: Math.round(requestedAmount * 1.05) }
              : undefined,
            offerExpiresAt: lrs.status === 'offer_sent'
              ? daysFromNow(3)
              : undefined,
            acceptedAt: lrs.status === 'disbursed' ? daysAgo(60 - lrIdx) : undefined,
            metadata: { source: cfg.externalSource },
            createdAt: daysAgo(90 - lrIdx * 3),
          },
        });
        loanRequestRecords.push({
          id: lr.id,
          customerId: cust.id,
          productId: prod.id,
          requestedAmount,
          requestedTenor,
          status: lrs.status,
        });
        lrIdx++;
      }
    }
    console.log(`  Created ${loanRequestRecords.length} loan requests`);

    // -- 8c. Contracts (8 per tenant from disbursed requests) ---------------
    /*
     * 3 × active/performing (current, DPD=0)
     * 2 × overdue (DPD 5-25, classification: special_mention)
     * 1 × delinquent (DPD 35, classification: substandard)
     * 1 × default_status (DPD 95, classification: doubtful)
     * 1 × settled (fully repaid)
     */
    const disbursedRequests = loanRequestRecords.filter((lr) => lr.status === 'disbursed');

    // We need 8 contracts but only have 3 disbursed requests — create extra loan requests for the rest
    const contractDefs = [
      { status: 'active' as const, classification: 'performing' as const, dpd: 0, paidPct: 0.4 },
      { status: 'active' as const, classification: 'performing' as const, dpd: 0, paidPct: 0.6 },
      { status: 'active' as const, classification: 'performing' as const, dpd: 0, paidPct: 0.2 },
      { status: 'overdue' as const, classification: 'special_mention' as const, dpd: 8, paidPct: 0.3 },
      { status: 'overdue' as const, classification: 'special_mention' as const, dpd: 22, paidPct: 0.15 },
      { status: 'delinquent' as const, classification: 'substandard' as const, dpd: 35, paidPct: 0.1 },
      { status: 'default_status' as const, classification: 'doubtful' as const, dpd: 95, paidPct: 0.05 },
      { status: 'settled' as const, classification: 'performing' as const, dpd: 0, paidPct: 1.0 },
    ];

    // Create additional disbursed loan requests to reach 8 total contract sources
    const contractSources: Array<{ lrId: string; customerId: string; productId: string; amount: number; tenor: number }> = [];

    // Use the 3 existing disbursed requests first
    for (const dr of disbursedRequests) {
      contractSources.push({
        lrId: dr.id,
        customerId: dr.customerId,
        productId: dr.productId,
        amount: dr.requestedAmount,
        tenor: dr.requestedTenor,
      });
    }

    // Create 5 more disbursed loan requests for remaining contracts
    for (let extra = 0; extra < 5; extra++) {
      const custIdx = 3 + extra; // use customers 3..7
      const cust = eligibleCustomers[custIdx % eligibleCustomers.length];
      const prod = activeProducts[extra % activeProducts.length];
      const amount = Math.round(prod.minAmount + (prod.maxAmount - prod.minAmount) * (0.3 + extra * 0.1));
      const tenor = 30 + extra * 10;
      const idempotencyKey = `${cfg.slug}-contract-lr-${String(extra + 1).padStart(4, '0')}`;

      const existing = await prisma.loanRequest.findFirst({ where: { idempotencyKey } });
      const lr = existing ?? await prisma.loanRequest.create({
        data: {
          tenantId: tenant.id,
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
          acceptedAt: daysAgo(70 + extra * 5),
          metadata: { source: cfg.externalSource },
          createdAt: daysAgo(80 + extra * 5),
        },
      });
      contractSources.push({
        lrId: lr.id,
        customerId: cust.id,
        productId: prod.id,
        amount,
        tenor,
      });
    }

    // Now create the 8 contracts
    interface ContractRecord {
      id: string;
      customerId: string;
      tenantId: string;
      principalAmount: number;
      interestAmount: number;
      totalCostCredit: number;
      totalPaid: number;
      totalOutstanding: number;
      contractDef: typeof contractDefs[0];
      tenorDays: number;
      disbursedDaysAgo: number;
      currency: string;
      numInstallments: number;
    }
    const contractRecords: ContractRecord[] = [];

    for (let ci = 0; ci < contractDefs.length; ci++) {
      const cDef = contractDefs[ci];
      const src = contractSources[ci];
      const contractNumber = `LN-${COUNTRY_SHORT[cfg.country]}-2026-${String(ci + 1).padStart(4, '0')}`;

      // Check if contract already exists
      const existingContract = await prisma.contract.findFirst({
        where: { tenantId: tenant.id, contractNumber },
      });
      if (existingContract) {
        contractRecords.push({
          id: existingContract.id,
          customerId: src.customerId,
          tenantId: tenant.id,
          principalAmount: Number(existingContract.principalAmount),
          interestAmount: Number(existingContract.interestAmount ?? 0),
          totalCostCredit: Number(existingContract.totalCostCredit ?? 0),
          totalPaid: Number(existingContract.totalPaid ?? 0),
          totalOutstanding: Number(existingContract.totalOutstanding ?? 0),
          contractDef: cDef,
          tenorDays: src.tenor,
          disbursedDaysAgo: 60 + ci * 5,
          currency: cfg.currency,
          numInstallments: Math.max(3, Math.min(6, Math.ceil(src.tenor / 15))),
        });
        continue;
      }

      const principal = src.amount;
      const interestRate = ci < 3 ? 5 : 12; // simple seed value
      const interestAmount = Math.round(principal * (interestRate / 100));
      const totalFees = Math.round(principal * 0.015); // 1.5% origination fee
      const totalCostCredit = principal + interestAmount + totalFees;
      const totalPaid = Math.round(totalCostCredit * cDef.paidPct);
      const totalOutstanding = totalCostCredit - totalPaid;
      const disbursedDaysAgo = cDef.status === 'settled' ? 90 : cDef.status === 'default_status' ? 120 : 60 + ci * 5;
      const tenorDays = src.tenor;
      const startDate = daysAgo(disbursedDaysAgo);
      const maturityDate = cDef.status === 'default_status'
        ? daysAgo(disbursedDaysAgo - tenorDays) // already past
        : daysFromNow(tenorDays - disbursedDaysAgo + 30);

      const contract = await prisma.contract.create({
        data: {
          tenantId: tenant.id,
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
          repaymentMethod: ci < 3 ? 'auto_deduction' : 'equal_installments',
          startDate,
          maturityDate,
          firstPaymentDate: new Date(startDate.getTime() + 15 * 24 * 60 * 60 * 1000),
          outstandingPrincipal: Math.round(principal * (1 - cDef.paidPct * 0.8)),
          outstandingInterest: Math.round(interestAmount * (1 - cDef.paidPct)),
          outstandingFees: cDef.paidPct >= 0.3 ? 0 : totalFees,
          outstandingPenalties: cDef.dpd > 0 ? Math.round(principal * 0.02 * Math.ceil(cDef.dpd / 30)) : 0,
          totalOutstanding,
          totalPaid,
          daysPastDue: cDef.dpd,
          status: cDef.status,
          classification: cDef.classification,
          settledAt: cDef.status === 'settled' ? daysAgo(10) : undefined,
          defaultedAt: cDef.status === 'default_status' ? daysAgo(cDef.dpd - 90) : undefined,
        },
      });

      // Link loan request to contract
      await prisma.loanRequest.update({
        where: { id: src.lrId },
        data: { contractId: contract.id },
      });

      const numInstallments = Math.max(3, Math.min(6, Math.ceil(tenorDays / 15)));
      contractRecords.push({
        id: contract.id,
        customerId: src.customerId,
        tenantId: tenant.id,
        principalAmount: principal,
        interestAmount,
        totalCostCredit,
        totalPaid,
        totalOutstanding,
        contractDef: cDef,
        tenorDays,
        disbursedDaysAgo,
        currency: cfg.currency,
        numInstallments,
      });
    }
    console.log(`  Created ${contractRecords.length} contracts`);

    // -- 8d. Repayment Schedules (3-6 per contract) -----------------------
    let totalScheduleEntries = 0;
    for (const cr of contractRecords) {
      // Check if schedule already exists
      const existingCount = await prisma.repaymentScheduleEntry.count({
        where: { contractId: cr.id },
      });
      if (existingCount > 0) {
        totalScheduleEntries += existingCount;
        continue;
      }

      const n = cr.numInstallments;
      const installmentPrincipal = Math.round(cr.principalAmount / n);
      const installmentInterest = Math.round(cr.interestAmount / n);
      const installmentFee = n > 0 ? Math.round((cr.totalCostCredit - cr.principalAmount - cr.interestAmount) / n) : 0;
      const installmentTotal = installmentPrincipal + installmentInterest + installmentFee;
      const intervalDays = Math.max(7, Math.round(cr.tenorDays / n));

      const scheduleData: Prisma.RepaymentScheduleEntryCreateManyInput[] = [];
      for (let si = 0; si < n; si++) {
        const dueDate = new Date(daysAgo(cr.disbursedDaysAgo).getTime() + (si + 1) * intervalDays * 24 * 60 * 60 * 1000);
        const isPast = dueDate < new Date();

        let status: 'paid' | 'pending' | 'overdue' = 'pending';
        let paidAmount = 0;
        let paidAt: Date | undefined;

        if (cr.contractDef.status === 'settled') {
          // All installments paid
          status = 'paid';
          paidAmount = installmentTotal;
          paidAt = new Date(dueDate.getTime() - 2 * 24 * 60 * 60 * 1000); // paid 2 days before due
        } else if (cr.contractDef.status === 'active' && cr.contractDef.dpd === 0) {
          // Performing: past due dates are paid, future are pending
          if (isPast) {
            status = 'paid';
            paidAmount = installmentTotal;
            paidAt = new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000);
          }
        } else if (cr.contractDef.dpd > 0) {
          // Overdue/delinquent/default: early installments paid, recent ones overdue
          const paidInstallments = Math.max(0, Math.floor(n * cr.contractDef.paidPct));
          if (si < paidInstallments) {
            status = 'paid';
            paidAmount = installmentTotal;
            paidAt = new Date(dueDate.getTime() + 1 * 24 * 60 * 60 * 1000);
          } else if (isPast) {
            status = 'overdue';
            paidAmount = 0;
          }
        }

        scheduleData.push({
          tenantId: tenant.id,
          contractId: cr.id,
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
      totalScheduleEntries += scheduleData.length;
    }
    console.log(`  Created ${totalScheduleEntries} repayment schedule entries`);

    // -- 8e. Repayments (20 per tenant) -----------------------------------
    // Create repayment records matching paid schedule entries
    const existingRepaymentCount = await prisma.repayment.count({ where: { tenantId: tenant.id } });
    if (existingRepaymentCount === 0) {
      let repaymentSeq = 0;
      const repaymentData: Prisma.RepaymentCreateManyInput[] = [];
      const methods: Array<'auto_deduction' | 'manual'> = ['auto_deduction', 'manual'];

      for (const cr of contractRecords) {
        // Find paid schedule entries for this contract
        const paidEntries = await prisma.repaymentScheduleEntry.findMany({
          where: { contractId: cr.id, status: 'paid' },
          orderBy: { installmentNumber: 'asc' },
        });

        for (const entry of paidEntries) {
          if (repaymentSeq >= 20) break;
          repaymentSeq++;

          const amount = Number(entry.totalAmount);
          const principalPortion = Number(entry.principalAmount ?? 0);
          const interestPortion = Number(entry.interestAmount ?? 0);
          const feePortion = Number(entry.feeAmount ?? 0);

          repaymentData.push({
            tenantId: tenant.id,
            contractId: cr.id,
            customerId: cr.customerId,
            amount,
            currency: cr.currency,
            method: methods[repaymentSeq % 2],
            source: cfg.externalSource,
            externalRef: `PAY-${COUNTRY_SHORT[cfg.country]}-${String(repaymentSeq).padStart(6, '0')}`,
            allocatedPrincipal: principalPortion,
            allocatedInterest: interestPortion,
            allocatedFees: feePortion,
            allocatedPenalties: 0,
            status: 'completed',
            receiptNumber: `RCT-${COUNTRY_SHORT[cfg.country]}-${String(repaymentSeq).padStart(6, '0')}`,
            completedAt: entry.paidAt ?? daysAgo(30 - repaymentSeq),
          });
        }
        if (repaymentSeq >= 20) break;
      }

      if (repaymentData.length > 0) {
        await prisma.repayment.createMany({ data: repaymentData });
      }
      console.log(`  Created ${repaymentData.length} repayments`);
    } else {
      console.log(`  Skipped repayments (${existingRepaymentCount} already exist)`);
    }
  }

  console.log('\n============================================================');
  console.log('  Seeding complete!');
  console.log('============================================================');
}

// ---------------------------------------------------------------------------
// Staging Seed Data (DEV-07)
// ---------------------------------------------------------------------------

/**
 * Comprehensive staging seed data for realistic testing.
 * Creates 3 SPs with products, customers in various states, contracts,
 * ledger entries, reconciliation batches, settlements, notifications, and audit logs.
 *
 * **Idempotent** — safe to run multiple times.
 */
async function seedStagingData(p: PrismaClient) {
  console.log('\n============================================================');
  console.log('  Seeding STAGING data (ENVIRONMENT=staging)');
  console.log('============================================================\n');

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const STAGING_COUNTRY_SHORT: Record<string, string> = { GH: 'GHA', KE: 'KEN', NG: 'NGA' };

  interface StagingSP {
    name: string;
    slug: string;
    legalName: string;
    regNumber: string;
    country: string;
    countryCode: string;
    schemaName: string;
    planTier: 'starter' | 'professional' | 'enterprise';
    currency: string;
    timezone: string;
    emailDomain: string;
    walletProvider: 'MOCK';
    walletDisplayName: string;
    productTypes: Array<'overdraft' | 'micro_loan' | 'bnpl' | 'invoice_financing'>;
    lender: {
      name: string;
      license: string;
      capacity: number;
      minRate: number;
      maxRate: number;
      settlementProvider: string;
    };
    phonePrefix: string;
    phonePadLen: number;
    externalSource: string;
    nationalIdType: string;
    nationalIdFmt: (i: number) => string;
    regions: string[];
    cities: string[];
  }

  const SPS: StagingSP[] = [
    {
      name: 'GhanaLend Financial',
      slug: 'ghanalend-stg',
      legalName: 'GhanaLend Financial Services Ltd',
      regNumber: 'GHA-STG-2026-001',
      country: 'GH',
      countryCode: 'GHA',
      schemaName: 'tenant_ghanalend_stg',
      planTier: 'enterprise',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      emailDomain: 'ghanalend-stg.lons.io',
      walletProvider: 'MOCK',
      walletDisplayName: 'Mock MTN MoMo (Sandbox)',
      productTypes: ['overdraft', 'micro_loan', 'bnpl', 'invoice_financing'],
      lender: { name: 'GhanaLend Capital', license: 'LIC-GHA-STG-001', capacity: 8_000_000, minRate: 0, maxRate: 35, settlementProvider: 'mtn_momo' },
      phonePrefix: '+23324',
      phonePadLen: 7,
      externalSource: 'mtn_momo',
      nationalIdType: 'ghana_card',
      nationalIdFmt: (i) => `GHA-STG-${String(2000 + i * 13).padStart(4, '0')}-${String(3000 + i * 29).padStart(4, '0')}`,
      regions: ['Greater Accra', 'Ashanti', 'Western', 'Central'],
      cities: ['Accra', 'Kumasi', 'Takoradi', 'Cape Coast'],
    },
    {
      name: 'KenyaCredit Ltd',
      slug: 'kenyacredit-stg',
      legalName: 'KenyaCredit Ltd',
      regNumber: 'KEN-STG-2026-001',
      country: 'KE',
      countryCode: 'KEN',
      schemaName: 'tenant_kenyacredit_stg',
      planTier: 'professional',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      emailDomain: 'kenyacredit-stg.lons.io',
      walletProvider: 'MOCK',
      walletDisplayName: 'Mock M-Pesa (Sandbox)',
      productTypes: ['overdraft', 'micro_loan', 'bnpl'],
      lender: { name: 'KenyaCredit Finance', license: 'LIC-KEN-STG-001', capacity: 80_000_000, minRate: 0, maxRate: 30, settlementProvider: 'mpesa' },
      phonePrefix: '+2547',
      phonePadLen: 8,
      externalSource: 'mpesa',
      nationalIdType: 'national_id',
      nationalIdFmt: (i) => `KEN-STG-${String(20000 + i * 131).padStart(5, '0')}-${String(200 + i * 11).padStart(3, '0')}`,
      regions: ['Nairobi', 'Central', 'Rift Valley', 'Coast'],
      cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
    },
    {
      name: 'NaijaFunds Inc',
      slug: 'naijafunds-stg',
      legalName: 'NaijaFunds Inc',
      regNumber: 'NGA-STG-2026-001',
      country: 'NG',
      countryCode: 'NGA',
      schemaName: 'tenant_naijafunds_stg',
      planTier: 'starter',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      emailDomain: 'naijafunds-stg.lons.io',
      walletProvider: 'MOCK',
      walletDisplayName: 'Mock Generic Wallet (Sandbox)',
      productTypes: ['micro_loan', 'bnpl', 'invoice_financing'],
      lender: { name: 'NaijaFunds Capital', license: 'LIC-NGA-STG-001', capacity: 1_200_000_000, minRate: 0, maxRate: 40, settlementProvider: 'bank_transfer' },
      phonePrefix: '+234',
      phonePadLen: 10,
      externalSource: 'bank_transfer',
      nationalIdType: 'nin',
      nationalIdFmt: (i) => `NGA-STG-${String(3000 + i * 19).padStart(4, '0')}-${String(20000 + i * 37).padStart(5, '0')}`,
      regions: ['Lagos', 'Abuja FCT', 'Rivers', 'Kano'],
      cities: ['Lagos', 'Abuja', 'Port Harcourt', 'Kano'],
    },
  ];

  // Product templates keyed by type
  const productTemplates: Record<string, {
    code: (currency: string) => string;
    name: string;
    description: string;
    minAmountMultiplier: number;
    maxAmountMultiplier: number;
    minTenorDays: number;
    maxTenorDays: number;
    interestRateModel: 'flat' | 'reducing_balance';
    interestRate: number;
    feeStructure: object;
    repaymentMethod: 'auto_deduction' | 'equal_installments' | 'lump_sum';
    gracePeriodDays: number;
    penaltyConfig: object;
    approvalWorkflow: 'auto' | 'semi_auto';
    eligibilityRules: object;
    revenueSharing: object;
    maxActiveLoans: number;
  }> = {
    overdraft: {
      code: (c) => `STG-OD-${c}-001`,
      name: 'Staging Overdraft',
      description: 'Staging overdraft facility',
      minAmountMultiplier: 1,
      maxAmountMultiplier: 50,
      minTenorDays: 1,
      maxTenorDays: 30,
      interestRateModel: 'flat',
      interestRate: 5.0,
      feeStructure: { origination: { type: 'percentage', value: 1.5 } },
      repaymentMethod: 'auto_deduction',
      gracePeriodDays: 0,
      penaltyConfig: { type: 'percentage', rate: 2.0, cap: 25.0, compound: false },
      approvalWorkflow: 'auto',
      eligibilityRules: { minKycLevel: 'tier_1', minTransactionHistory: 30 },
      revenueSharing: { lender: 60, sp: 25, emi: 10, platform: 5 },
      maxActiveLoans: 1,
    },
    micro_loan: {
      code: (c) => `STG-ML-${c}-001`,
      name: 'Staging Micro-Loan',
      description: 'Staging micro-loan product',
      minAmountMultiplier: 5,
      maxAmountMultiplier: 100,
      minTenorDays: 7,
      maxTenorDays: 90,
      interestRateModel: 'reducing_balance',
      interestRate: 12.0,
      feeStructure: { origination: { type: 'flat', value: 5.0 }, service: { type: 'percentage', value: 0.5 } },
      repaymentMethod: 'equal_installments',
      gracePeriodDays: 3,
      penaltyConfig: { type: 'percentage', rate: 1.5, cap: 30.0, compound: false },
      approvalWorkflow: 'semi_auto',
      eligibilityRules: { minKycLevel: 'tier_1', minAccountAge: 60 },
      revenueSharing: { lender: 55, sp: 30, emi: 10, platform: 5 },
      maxActiveLoans: 2,
    },
    bnpl: {
      code: (c) => `STG-BNPL-${c}-001`,
      name: 'Staging BNPL',
      description: 'Staging buy-now-pay-later product',
      minAmountMultiplier: 2,
      maxAmountMultiplier: 50,
      minTenorDays: 14,
      maxTenorDays: 90,
      interestRateModel: 'flat',
      interestRate: 0.0,
      feeStructure: { merchant: { type: 'percentage', value: 3.0 } },
      repaymentMethod: 'equal_installments',
      gracePeriodDays: 0,
      penaltyConfig: { type: 'flat', rate: 5.0, cap: 50.0, compound: false },
      approvalWorkflow: 'auto',
      eligibilityRules: { minKycLevel: 'tier_1', minCreditScore: 500 },
      revenueSharing: { lender: 50, sp: 30, emi: 10, platform: 10 },
      maxActiveLoans: 3,
    },
    invoice_financing: {
      code: (c) => `STG-IF-${c}-001`,
      name: 'Staging Invoice Finance',
      description: 'Staging invoice factoring product',
      minAmountMultiplier: 50,
      maxAmountMultiplier: 500,
      minTenorDays: 30,
      maxTenorDays: 180,
      interestRateModel: 'flat',
      interestRate: 8.0,
      feeStructure: { origination: { type: 'percentage', value: 2.0 } },
      repaymentMethod: 'lump_sum',
      gracePeriodDays: 5,
      penaltyConfig: { type: 'percentage', rate: 2.5, cap: 30.0, compound: false },
      approvalWorkflow: 'semi_auto',
      eligibilityRules: { minKycLevel: 'tier_2', minAccountAge: 180 },
      revenueSharing: { lender: 55, sp: 25, emi: 10, platform: 10 },
      maxActiveLoans: 2,
    },
  };

  // Base amount per currency (smallest useful unit for products)
  const BASE_AMOUNT: Record<string, number> = { GHS: 10, KES: 100, NGN: 2000 };

  // Customer profile definitions — each gets specific treatment
  interface CustomerProfile {
    tag: string;
    fullName: (spIdx: number) => string;
    gender: 'male' | 'female';
    kycLevel: 'tier_1' | 'tier_2' | 'tier_3';
    status: 'active' | 'blacklisted' | 'suspended';
    watchlist: boolean;
    creditScore: number;
    blacklistReason?: string;
    consentRevoked?: boolean;
    contractSpec?: {
      status: 'active' | 'overdue' | 'delinquent' | 'default_status' | 'written_off' | 'settled';
      classification: 'performing' | 'special_mention' | 'substandard' | 'doubtful' | 'loss';
      dpd: number;
      paidPct: number;
      restructured?: boolean;
      earlyPartialPayment?: boolean;
      count?: number;
    };
  }

  const ghNames = [
    { m: 'Kwadwo Mensah', f: 'Ama Serwaa' },
    { m: 'Kofi Boakye', f: 'Abena Ofosu' },
    { m: 'Yaw Opoku', f: 'Efua Gyamfi' },
    { m: 'Kweku Asante', f: 'Akua Nkrumah' },
    { m: 'Nana Amponsah', f: 'Adwoa Bediako' },
    { m: 'Kojo Frimpong', f: 'Afia Darko' },
    { m: 'Kwabena Tetteh', f: 'Akosua Aidoo' },
    { m: 'Papa Annan', f: 'Maame Konadu' },
    { m: 'Edem Quarcoo', f: 'Dzifa Amegashie' },
    { m: 'Nii Armah', f: 'Korkor Lamptey' },
    { m: 'Kwasi Appiah', f: 'Afua Badu' },
    { m: 'Kodjo Brew', f: 'Esi Quarshie' },
    { m: 'Fiifi Owusu', f: 'Aba Ankomah' },
    { m: 'Kobi Amoako', f: 'Naa Adjeley' },
    { m: 'Yoofi Tawiah', f: 'Araba Tagoe' },
    { m: 'Kweku Danso', f: 'Ama Boateng' },
  ];
  const keNames = [
    { m: 'John Kamau', f: 'Mary Wanjiku' },
    { m: 'Peter Omondi', f: 'Grace Achieng' },
    { m: 'James Kipchoge', f: 'Faith Nyambura' },
    { m: 'David Mwangi', f: 'Esther Wambui' },
    { m: 'Brian Otieno', f: 'Mercy Muthoni' },
    { m: 'George Kariuki', f: 'Agnes Chebet' },
    { m: 'Samuel Njoroge', f: 'Beatrice Wairimu' },
    { m: 'Joseph Kiprotich', f: 'Tabitha Njeri' },
    { m: 'Patrick Odhiambo', f: 'Caroline Mwende' },
    { m: 'Daniel Rotich', f: 'Joyce Atieno' },
    { m: 'Stephen Muturi', f: 'Lucy Wangari' },
    { m: 'Andrew Kiptoo', f: 'Sarah Nduta' },
    { m: 'Michael Onyango', f: 'Janet Awuor' },
    { m: 'Francis Wekesa', f: 'Rose Chemutai' },
    { m: 'Charles Mutiso', f: 'Ann Moraa' },
    { m: 'Henry Kosgei', f: 'Jane Akinyi' },
  ];
  const ngNames = [
    { m: 'Chidi Okafor', f: 'Chidinma Eze' },
    { m: 'Emeka Nwosu', f: 'Amaka Igwe' },
    { m: 'Tunde Bakare', f: 'Ngozi Obi' },
    { m: 'Segun Alabi', f: 'Funke Adesanya' },
    { m: 'Obinna Mba', f: 'Blessing Umeh' },
    { m: 'Ikenna Chukwu', f: 'Kemi Fashola' },
    { m: 'Femi Akindele', f: 'Yetunde Oladipo' },
    { m: 'Chinedu Okwu', f: 'Aisha Bello' },
    { m: 'Babatunde Ogundimu', f: 'Halima Yusuf' },
    { m: 'Dayo Adeniyi', f: 'Nkechi Nnadi' },
    { m: 'Uche Nnaji', f: 'Folake Ojo' },
    { m: 'Kunle Oni', f: 'Zainab Ibrahim' },
    { m: 'Nonso Okonkwo', f: 'Binta Suleiman' },
    { m: 'Wale Adebayo', f: 'Titilayo Dosunmu' },
    { m: 'Ebuka Anichebe', f: 'Omowunmi Fasasi' },
    { m: 'Gbenga Oduya', f: 'Ifeoma Udeze' },
  ];
  const namesBySP = [ghNames, keNames, ngNames];

  const PROFILES: CustomerProfile[] = [
    // 0: New customer — no contracts
    { tag: 'new', fullName: (si) => namesBySP[si][0].m, gender: 'male', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 650 },
    // 1: Active — current, 0 DPD
    { tag: 'active-current', fullName: (si) => namesBySP[si][1].f, gender: 'female', kycLevel: 'tier_2', status: 'active', watchlist: false, creditScore: 720,
      contractSpec: { status: 'active', classification: 'performing', dpd: 0, paidPct: 0.4 } },
    // 2: Active — multiple contracts
    { tag: 'active-multi', fullName: (si) => namesBySP[si][2].m, gender: 'male', kycLevel: 'tier_2', status: 'active', watchlist: false, creditScore: 700,
      contractSpec: { status: 'active', classification: 'performing', dpd: 0, paidPct: 0.3, count: 2 } },
    // 3: Overdue — 30 DPD
    { tag: 'overdue-30', fullName: (si) => namesBySP[si][3].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 550,
      contractSpec: { status: 'overdue', classification: 'special_mention', dpd: 30, paidPct: 0.2 } },
    // 4: Overdue — 60 DPD, in collections
    { tag: 'overdue-60', fullName: (si) => namesBySP[si][4].m, gender: 'male', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 480,
      contractSpec: { status: 'delinquent', classification: 'substandard', dpd: 60, paidPct: 0.1 } },
    // 5: Overdue — 90+ DPD, escalated
    { tag: 'overdue-90', fullName: (si) => namesBySP[si][5].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 400,
      contractSpec: { status: 'default_status', classification: 'doubtful', dpd: 95, paidPct: 0.05 } },
    // 6: Defaulted — written off
    { tag: 'defaulted', fullName: (si) => namesBySP[si][6].m, gender: 'male', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 350,
      contractSpec: { status: 'written_off', classification: 'loss', dpd: 180, paidPct: 0.02 } },
    // 7: Fully repaid
    { tag: 'repaid', fullName: (si) => namesBySP[si][7].f, gender: 'female', kycLevel: 'tier_2', status: 'active', watchlist: false, creditScore: 780,
      contractSpec: { status: 'settled', classification: 'performing', dpd: 0, paidPct: 1.0 } },
    // 8: Partial early repayment
    { tag: 'early-partial', fullName: (si) => namesBySP[si][8].m, gender: 'male', kycLevel: 'tier_2', status: 'active', watchlist: false, creditScore: 740,
      contractSpec: { status: 'active', classification: 'performing', dpd: 0, paidPct: 0.7, earlyPartialPayment: true } },
    // 9: Restructured
    { tag: 'restructured', fullName: (si) => namesBySP[si][9].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 520,
      contractSpec: { status: 'active', classification: 'special_mention', dpd: 0, paidPct: 0.25, restructured: true } },
    // 10: Blacklisted — fraud
    { tag: 'blacklisted', fullName: (si) => namesBySP[si][10].m, gender: 'male', kycLevel: 'tier_1', status: 'blacklisted', watchlist: false, creditScore: 200, blacklistReason: 'Confirmed identity fraud and forged documentation' },
    // 11: Watchlist — manual review
    { tag: 'watchlist', fullName: (si) => namesBySP[si][11].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: true, creditScore: 560 },
    // 12: High credit score >800
    { tag: 'high-score', fullName: (si) => namesBySP[si][12].m, gender: 'male', kycLevel: 'tier_3', status: 'active', watchlist: false, creditScore: 850 },
    // 13: Low credit score <400
    { tag: 'low-score', fullName: (si) => namesBySP[si][13].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 320 },
    // 14: Borderline credit score
    { tag: 'borderline', fullName: (si) => namesBySP[si][14].m, gender: 'male', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 600 },
    // 15: Expired consent
    { tag: 'expired-consent', fullName: (si) => namesBySP[si][15].f, gender: 'female', kycLevel: 'tier_1', status: 'active', watchlist: false, creditScore: 650, consentRevoked: true },
  ];

  // -----------------------------------------------------------------------
  // 1. Platform Admin for staging
  // -----------------------------------------------------------------------
  console.log('[STG 1/9] Platform admin (admin@lons.io) already created by base seed...');

  // -----------------------------------------------------------------------
  // Loop SPs
  // -----------------------------------------------------------------------
  for (let spIdx = 0; spIdx < SPS.length; spIdx++) {
    const sp = SPS[spIdx];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  [STG SP ${spIdx + 1}/${SPS.length}] ${sp.name}`);
    console.log(`${'='.repeat(60)}`);

    // -----------------------------------------------------------------
    // 2. Tenant
    // -----------------------------------------------------------------
    console.log('[STG 2/9] Creating tenant...');
    const tenant = await p.tenant.upsert({
      where: { schemaName: sp.schemaName },
      update: {},
      create: {
        name: sp.name,
        slug: sp.slug,
        legalName: sp.legalName,
        registrationNumber: sp.regNumber,
        country: sp.countryCode,
        schemaName: sp.schemaName,
        planTier: sp.planTier,
        status: 'active',
        settings: {
          currencies: [sp.currency],
          timezone: sp.timezone,
          businessHours: { start: '08:00', end: '17:00' },
          environment: 'staging',
        },
      },
    });
    console.log(`  Tenant: ${tenant.id}`);

    // -----------------------------------------------------------------
    // 3. Roles & Users
    // -----------------------------------------------------------------
    console.log('[STG 3/9] Creating roles and users...');
    const roles = await createRoles(tenant.id);

    const userDefs = [
      { key: 'sp_admin', email: `admin@${sp.emailDomain}`, password: 'StgAdmin123!@#', name: `${sp.name} Admin` },
      { key: 'sp_operator', email: `operator@${sp.emailDomain}`, password: 'StgOperator123!@#', name: `${sp.name} Operator` },
      { key: 'sp_analyst', email: `analyst@${sp.emailDomain}`, password: 'StgAnalyst123!@#', name: `${sp.name} Analyst` },
      { key: 'sp_auditor', email: `auditor@${sp.emailDomain}`, password: 'StgAuditor123!@#', name: `${sp.name} Auditor` },
    ];

    let spAdminId = '';
    for (const u of userDefs) {
      const roleObj = roles[u.key];
      if (!roleObj) continue;
      const pwHash = await hashPassword(u.password);
      const user = await p.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
        update: { passwordHash: pwHash },
        create: {
          tenantId: tenant.id,
          email: u.email,
          passwordHash: pwHash,
          name: u.name,
          roleId: roleObj.id,
          mfaEnabled: false,
          status: 'active',
        },
      });
      if (u.key === 'sp_admin') spAdminId = user.id;
      console.log(`  User: ${u.email}`);
    }

    // -----------------------------------------------------------------
    // 4. Adapter Configs (Wallet + Notification)
    // -----------------------------------------------------------------
    console.log('[STG 4/9] Creating adapter configs...');

    // WalletProviderConfig — use the composite unique constraint
    await p.walletProviderConfig.upsert({
      where: {
        uq_wallet_provider_active: {
          tenantId: tenant.id,
          providerType: 'MOCK',
          isActive: true,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        providerType: 'MOCK',
        environmentMode: 'SANDBOX',
        displayName: sp.walletDisplayName,
        configJson: {
          initial_balance: '1000000.0000',
          supported_currencies: [sp.currency],
          simulate_failures: false,
          latency_ms: 200,
        },
        isActive: true,
        isDefault: true,
      },
    });
    console.log(`  Wallet: ${sp.walletDisplayName}`);

    // NotificationProviderConfig
    await p.notificationProviderConfig.upsert({
      where: {
        uq_notification_provider_active: {
          tenantId: tenant.id,
          providerType: 'RECORDING_MOCK',
          isActive: true,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        providerType: 'RECORDING_MOCK',
        environmentMode: 'SANDBOX',
        displayName: 'Recording Mock (Sandbox)',
        configJson: {
          record_all: true,
          supported_channels: ['sms', 'email', 'push'],
        },
        isActive: true,
        isDefault: true,
      },
    });
    console.log('  Notification: Recording Mock (Sandbox)');

    // -----------------------------------------------------------------
    // 5. Lender
    // -----------------------------------------------------------------
    console.log('[STG 5/9] Creating lender...');
    const existingLender = await p.lender.findFirst({
      where: { tenantId: tenant.id, licenseNumber: sp.lender.license },
    });
    const lender = existingLender ?? await p.lender.create({
      data: {
        tenantId: tenant.id,
        name: sp.lender.name,
        licenseNumber: sp.lender.license,
        country: sp.countryCode,
        fundingCapacity: sp.lender.capacity,
        fundingCurrency: sp.currency,
        minInterestRate: sp.lender.minRate,
        maxInterestRate: sp.lender.maxRate,
        settlementAccount: { provider: sp.lender.settlementProvider, accountId: `${sp.slug.toUpperCase()}-SETTLE-001` },
        riskParameters: { maxExposure: sp.lender.capacity * 0.2, singleBorrowerLimit: sp.lender.capacity * 0.01 },
        status: 'active',
      },
    });
    console.log(`  Lender: ${lender.name}`);

    // -----------------------------------------------------------------
    // 6. Products — active products + suspended/discontinued/draft extras
    // -----------------------------------------------------------------
    console.log('[STG 6/9] Creating products...');
    const base = BASE_AMOUNT[sp.currency] ?? 10;
    const activeProductRecords: Array<{ id: string; code: string; type: string; minAmount: number; maxAmount: number }> = [];

    // Active products from SP's productTypes
    for (const pType of sp.productTypes) {
      const tmpl = productTemplates[pType];
      const code = tmpl.code(sp.currency);
      const minAmount = base * tmpl.minAmountMultiplier;
      const maxAmount = base * tmpl.maxAmountMultiplier;

      const product = await p.product.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        update: {},
        create: {
          tenantId: tenant.id,
          code,
          name: tmpl.name,
          description: tmpl.description,
          type: pType,
          lenderId: lender.id,
          currency: sp.currency,
          minAmount,
          maxAmount,
          minTenorDays: tmpl.minTenorDays,
          maxTenorDays: tmpl.maxTenorDays,
          interestRateModel: tmpl.interestRateModel,
          interestRate: tmpl.interestRate,
          feeStructure: tmpl.feeStructure as Prisma.InputJsonValue,
          repaymentMethod: tmpl.repaymentMethod,
          gracePeriodDays: tmpl.gracePeriodDays,
          penaltyConfig: tmpl.penaltyConfig as Prisma.InputJsonValue,
          approvalWorkflow: tmpl.approvalWorkflow,
          eligibilityRules: tmpl.eligibilityRules as Prisma.InputJsonValue,
          revenueSharing: tmpl.revenueSharing as Prisma.InputJsonValue,
          maxActiveLoans: tmpl.maxActiveLoans,
          status: 'active',
          activatedAt: daysAgo(120),
          createdBy: spAdminId || undefined,
        },
      });
      activeProductRecords.push({ id: product.id, code: product.code, type: pType, minAmount, maxAmount });
      console.log(`  Product: ${code} (active)`);
    }

    // Extra products: suspended, discontinued, draft
    const extraStatuses: Array<{ suffix: string; status: 'suspended' | 'discontinued' | 'draft' }> = [
      { suffix: 'SUSP', status: 'suspended' },
      { suffix: 'DISC', status: 'discontinued' },
      { suffix: 'DRFT', status: 'draft' },
    ];
    for (const extra of extraStatuses) {
      const code = `STG-ML-${sp.currency}-${extra.suffix}`;
      await p.product.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        update: {},
        create: {
          tenantId: tenant.id,
          code,
          name: `Staging Micro-Loan (${extra.status})`,
          description: `Testing product in ${extra.status} state`,
          type: 'micro_loan',
          lenderId: lender.id,
          currency: sp.currency,
          minAmount: base * 5,
          maxAmount: base * 100,
          minTenorDays: 7,
          maxTenorDays: 90,
          interestRateModel: 'reducing_balance',
          interestRate: 12.0,
          feeStructure: { origination: { type: 'flat', value: 5.0 } } as Prisma.InputJsonValue,
          repaymentMethod: 'equal_installments',
          gracePeriodDays: 3,
          penaltyConfig: { type: 'percentage', rate: 1.5, cap: 30.0, compound: false } as Prisma.InputJsonValue,
          approvalWorkflow: 'semi_auto',
          eligibilityRules: { minKycLevel: 'tier_1' } as Prisma.InputJsonValue,
          revenueSharing: { lender: 55, sp: 30, emi: 10, platform: 5 } as Prisma.InputJsonValue,
          maxActiveLoans: 2,
          status: extra.status,
          createdBy: spAdminId || undefined,
        },
      });
      console.log(`  Product: ${code} (${extra.status})`);
    }

    // -----------------------------------------------------------------
    // 7. Customers — 16 profiles per SP
    // -----------------------------------------------------------------
    console.log('[STG 7/9] Creating customers with profiles...');
    interface StagingCustomerRecord { id: string; profile: CustomerProfile; idx: number }
    const customerRecords: StagingCustomerRecord[] = [];

    for (let ci = 0; ci < PROFILES.length; ci++) {
      const prof = PROFILES[ci];
      const fullName = prof.fullName(spIdx);
      const externalId = `STG-CUST-${sp.country}-${String(ci + 1).padStart(4, '0')}`;
      const phone = sp.phonePrefix + phoneDigits(sp.phonePadLen, (spIdx + 10) * 10000 + ci);

      const existingCustomer = await p.customer.findFirst({
        where: { tenantId: tenant.id, externalId, externalSource: sp.externalSource },
      });
      const customer = existingCustomer ?? await p.customer.create({
        data: {
          tenantId: tenant.id,
          externalId,
          externalSource: sp.externalSource,
          fullName,
          dateOfBirth: new Date(1985 + (ci % 15), ci % 12, 1 + (ci * 3) % 28),
          gender: prof.gender,
          nationalId: sp.nationalIdFmt(ci),
          nationalIdType: sp.nationalIdType,
          phonePrimary: phone,
          country: sp.countryCode,
          region: sp.regions[ci % sp.regions.length],
          city: sp.cities[ci % sp.cities.length],
          kycLevel: prof.kycLevel,
          kycVerifiedAt: prof.kycLevel !== 'tier_1' ? daysAgo(90 + ci * 5) : undefined,
          status: prof.status,
          blacklistReason: prof.blacklistReason ?? undefined,
          watchlist: prof.watchlist,
          segment: prof.creditScore >= 800 ? 'premium' : prof.creditScore >= 600 ? 'standard' : 'subprime',
          metadata: { registrationChannel: 'mobile_app', creditScore: prof.creditScore, stagingProfile: prof.tag },
        },
      });

      // Consents
      const existingConsents = await p.customerConsent.count({ where: { customerId: customer.id } });
      if (existingConsents === 0) {
        const consentData: Prisma.CustomerConsentCreateManyInput[] = [
          {
            tenantId: tenant.id,
            customerId: customer.id,
            consentType: 'data_access',
            granted: prof.consentRevoked ? false : true,
            grantedAt: daysAgo(120),
            revokedAt: prof.consentRevoked ? daysAgo(5) : undefined,
            channel: 'mobile_app',
            version: 1,
          },
          {
            tenantId: tenant.id,
            customerId: customer.id,
            consentType: 'auto_deduction',
            granted: prof.consentRevoked ? false : true,
            grantedAt: daysAgo(120),
            revokedAt: prof.consentRevoked ? daysAgo(5) : undefined,
            channel: 'mobile_app',
            version: 1,
          },
          {
            tenantId: tenant.id,
            customerId: customer.id,
            consentType: 'communications',
            granted: true,
            grantedAt: daysAgo(120),
            channel: 'mobile_app',
            version: 1,
          },
          {
            tenantId: tenant.id,
            customerId: customer.id,
            consentType: 'credit_reporting',
            granted: prof.consentRevoked ? false : true,
            grantedAt: daysAgo(120),
            revokedAt: prof.consentRevoked ? daysAgo(5) : undefined,
            channel: 'mobile_app',
            version: 1,
          },
        ];
        await p.customerConsent.createMany({ data: consentData });
      }

      // Scoring result for customers with a credit score
      const existingScore = await p.scoringResult.findFirst({
        where: { tenantId: tenant.id, customerId: customer.id },
      });
      if (!existingScore && activeProductRecords.length > 0) {
        const scoreProd = activeProductRecords[0];
        await p.scoringResult.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            productId: scoreProd.id,
            modelType: 'rule_based',
            modelVersion: 'v1.0-staging',
            score: prof.creditScore,
            scoreRangeMin: 0,
            scoreRangeMax: 1000,
            probabilityDefault: prof.creditScore >= 700 ? 0.02 : prof.creditScore >= 500 ? 0.10 : 0.30,
            riskTier: prof.creditScore >= 700 ? 'low' : prof.creditScore >= 500 ? 'medium' : prof.creditScore >= 350 ? 'high' : 'critical',
            recommendedLimit: scoreProd.maxAmount * (prof.creditScore / 1000),
            contributingFactors: {
              transactionHistory: prof.creditScore >= 600 ? 'positive' : 'negative',
              accountAge: prof.kycLevel === 'tier_3' ? 'excellent' : 'fair',
              repaymentHistory: prof.creditScore >= 700 ? 'excellent' : prof.creditScore >= 500 ? 'fair' : 'poor',
            },
            confidence: 0.85,
            context: 'application',
          },
        });
      }

      customerRecords.push({ id: customer.id, profile: prof, idx: ci });
      console.log(`  Customer [${prof.tag}]: ${fullName}`);
    }

    // -----------------------------------------------------------------
    // 8. Contracts, schedules, repayments, disbursements, ledger entries
    // -----------------------------------------------------------------
    console.log('[STG 8/9] Creating contracts, schedules, repayments, ledger...');
    const customersWithContracts = customerRecords.filter((c) => c.profile.contractSpec);
    let contractSeq = 0;

    for (const custRec of customersWithContracts) {
      const spec = custRec.profile.contractSpec!;
      const numContracts = spec.count ?? 1;

      for (let contractIdx = 0; contractIdx < numContracts; contractIdx++) {
        contractSeq++;
        const prod = activeProductRecords[(contractSeq - 1) % activeProductRecords.length];
        const contractNumber = `STG-LN-${STAGING_COUNTRY_SHORT[sp.country] ?? sp.countryCode}-${String(contractSeq).padStart(4, '0')}`;

        // Check existing
        const existingContract = await p.contract.findFirst({
          where: { tenantId: tenant.id, contractNumber },
        });
        if (existingContract) {
          console.log(`  Contract ${contractNumber} already exists, skipping`);
          continue;
        }

        // Create the backing loan request
        const idempotencyKey = `${sp.slug}-stg-lr-${String(contractSeq).padStart(4, '0')}`;
        const requestedAmount = Math.round(prod.minAmount + (prod.maxAmount - prod.minAmount) * 0.5);
        const requestedTenor = 60;

        const existingLR = await p.loanRequest.findFirst({ where: { idempotencyKey } });
        const lr = existingLR ?? await p.loanRequest.create({
          data: {
            tenantId: tenant.id,
            idempotencyKey,
            customerId: custRec.id,
            productId: prod.id,
            requestedAmount,
            requestedTenor,
            currency: sp.currency,
            channel: 'mobile_app',
            status: 'disbursed',
            approvedAmount: requestedAmount,
            approvedTenor: requestedTenor,
            acceptedAt: daysAgo(70 + contractSeq),
            metadata: { source: sp.externalSource, stagingProfile: custRec.profile.tag },
            createdAt: daysAgo(80 + contractSeq),
          },
        });

        const principal = requestedAmount;
        const interestRate = prod.type === 'overdraft' ? 5 : 12;
        const interestAmount = Math.round(principal * (interestRate / 100));
        const totalFees = Math.round(principal * 0.015);
        const totalCostCredit = principal + interestAmount + totalFees;
        const totalPaid = Math.round(totalCostCredit * spec.paidPct);
        const totalOutstanding = totalCostCredit - totalPaid;

        const isSettled = spec.status === 'settled';
        const isWrittenOff = spec.status === 'written_off';
        const isDefaultStatus = spec.status === 'default_status';
        const disbursedDaysAgo = isSettled ? 120 : isDefaultStatus || isWrittenOff ? 200 : 70 + contractSeq;
        const tenorDays = requestedTenor;
        const startDate = daysAgo(disbursedDaysAgo);
        const maturityDate = isDefaultStatus || isWrittenOff
          ? daysAgo(disbursedDaysAgo - tenorDays)
          : isSettled
            ? daysAgo(disbursedDaysAgo - tenorDays)
            : daysFromNow(tenorDays - disbursedDaysAgo + 30);

        const contract = await p.contract.create({
          data: {
            tenantId: tenant.id,
            contractNumber,
            customerId: custRec.id,
            productId: prod.id,
            lenderId: lender.id,
            loanRequestId: lr.id,
            principalAmount: principal,
            interestRate,
            interestAmount,
            totalFees,
            totalCostCredit,
            currency: sp.currency,
            tenorDays,
            repaymentMethod: prod.type === 'overdraft' ? 'auto_deduction' : 'equal_installments',
            startDate,
            maturityDate,
            firstPaymentDate: new Date(startDate.getTime() + 15 * 24 * 60 * 60 * 1000),
            outstandingPrincipal: Math.round(principal * (1 - spec.paidPct * 0.8)),
            outstandingInterest: Math.round(interestAmount * (1 - spec.paidPct)),
            outstandingFees: spec.paidPct >= 0.3 ? 0 : totalFees,
            outstandingPenalties: spec.dpd > 0 ? Math.round(principal * 0.02 * Math.ceil(spec.dpd / 30)) : 0,
            totalOutstanding,
            totalPaid,
            daysPastDue: spec.dpd,
            status: spec.status,
            classification: spec.classification,
            restructured: spec.restructured ?? false,
            restructureCount: spec.restructured ? 1 : 0,
            settledAt: isSettled ? daysAgo(10) : undefined,
            defaultedAt: isDefaultStatus ? daysAgo(spec.dpd - 90) : undefined,
            writtenOffAt: isWrittenOff ? daysAgo(30) : undefined,
          },
        });

        // Link loan request to contract
        await p.loanRequest.update({
          where: { id: lr.id },
          data: { contractId: contract.id },
        });

        // -- Disbursement
        const existingDisbursement = await p.disbursement.findFirst({ where: { contractId: contract.id } });
        if (!existingDisbursement) {
          await p.disbursement.create({
            data: {
              tenantId: tenant.id,
              contractId: contract.id,
              customerId: custRec.id,
              amount: principal,
              currency: sp.currency,
              channel: sp.externalSource,
              destination: sp.phonePrefix + phoneDigits(sp.phonePadLen, (spIdx + 10) * 10000 + custRec.idx),
              externalRef: `STG-DISB-${STAGING_COUNTRY_SHORT[sp.country] ?? sp.countryCode}-${String(contractSeq).padStart(6, '0')}`,
              status: 'completed',
              completedAt: startDate,
            },
          });
        }

        // -- Repayment Schedule (4 installments)
        const numInstallments = 4;
        const existingScheduleCount = await p.repaymentScheduleEntry.count({ where: { contractId: contract.id } });
        if (existingScheduleCount === 0) {
          const installmentPrincipal = Math.round(principal / numInstallments);
          const installmentInterest = Math.round(interestAmount / numInstallments);
          const installmentFee = Math.round(totalFees / numInstallments);
          const installmentTotal = installmentPrincipal + installmentInterest + installmentFee;
          const intervalDays = Math.round(tenorDays / numInstallments);

          const scheduleData: Prisma.RepaymentScheduleEntryCreateManyInput[] = [];
          for (let si = 0; si < numInstallments; si++) {
            const dueDate = new Date(startDate.getTime() + (si + 1) * intervalDays * 24 * 60 * 60 * 1000);
            const isPast = dueDate < new Date();
            let entryStatus: 'paid' | 'pending' | 'overdue' = 'pending';
            let paidAmount = 0;
            let paidAt: Date | null = null;

            if (isSettled) {
              entryStatus = 'paid';
              paidAmount = installmentTotal;
              paidAt = new Date(dueDate.getTime() - 2 * 24 * 60 * 60 * 1000);
            } else if (spec.dpd === 0 && spec.status === 'active') {
              if (isPast) {
                entryStatus = 'paid';
                paidAmount = installmentTotal;
                paidAt = new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000);
                // Early partial payment: last paid installment only partial
                if (spec.earlyPartialPayment && si === Math.floor(numInstallments * spec.paidPct) - 1) {
                  paidAmount = Math.round(installmentTotal * 1.5); // overpaid
                }
              }
            } else if (spec.dpd > 0) {
              const paidInstallments = Math.max(0, Math.floor(numInstallments * spec.paidPct));
              if (si < paidInstallments) {
                entryStatus = 'paid';
                paidAmount = installmentTotal;
                paidAt = new Date(dueDate.getTime() + 1 * 24 * 60 * 60 * 1000);
              } else if (isPast) {
                entryStatus = 'overdue';
              }
            }

            scheduleData.push({
              tenantId: tenant.id,
              contractId: contract.id,
              installmentNumber: si + 1,
              dueDate,
              principalAmount: installmentPrincipal,
              interestAmount: installmentInterest,
              feeAmount: installmentFee,
              totalAmount: installmentTotal,
              paidAmount,
              status: entryStatus,
              paidAt,
            });
          }
          await p.repaymentScheduleEntry.createMany({ data: scheduleData });
        }

        // -- Repayments matching paid schedule entries
        const existingRepayments = await p.repayment.count({ where: { contractId: contract.id } });
        if (existingRepayments === 0) {
          const paidEntries = await p.repaymentScheduleEntry.findMany({
            where: { contractId: contract.id, status: 'paid' },
            orderBy: { installmentNumber: 'asc' },
          });

          const repaymentData: Prisma.RepaymentCreateManyInput[] = [];
          for (let ri = 0; ri < paidEntries.length; ri++) {
            const entry = paidEntries[ri];
            repaymentData.push({
              tenantId: tenant.id,
              contractId: contract.id,
              customerId: custRec.id,
              amount: Number(entry.paidAmount),
              currency: sp.currency,
              method: ri % 2 === 0 ? 'auto_deduction' : 'manual',
              source: sp.externalSource,
              externalRef: `STG-PAY-${STAGING_COUNTRY_SHORT[sp.country] ?? sp.countryCode}-${String(contractSeq).padStart(4, '0')}-${String(ri + 1).padStart(2, '0')}`,
              allocatedPrincipal: Number(entry.principalAmount ?? 0),
              allocatedInterest: Number(entry.interestAmount ?? 0),
              allocatedFees: Number(entry.feeAmount ?? 0),
              allocatedPenalties: 0,
              status: 'completed',
              receiptNumber: `STG-RCT-${String(contractSeq).padStart(4, '0')}-${String(ri + 1).padStart(2, '0')}`,
              completedAt: entry.paidAt ?? daysAgo(30 - ri),
            });
          }
          if (repaymentData.length > 0) {
            await p.repayment.createMany({ data: repaymentData });
          }
        }

        // -- Ledger entries (double-entry: debit + credit for disbursement, each repayment)
        const existingLedger = await p.ledgerEntry.count({ where: { contractId: contract.id } });
        if (existingLedger === 0) {
          const ledgerData: Prisma.LedgerEntryCreateManyInput[] = [];
          let runningBalance = principal + interestAmount + totalFees;

          // Disbursement entry (debit — customer owes)
          ledgerData.push({
            tenantId: tenant.id,
            contractId: contract.id,
            entryType: 'disbursement',
            debitCredit: 'debit',
            amount: principal,
            currency: sp.currency,
            runningBalance,
            effectiveDate: startDate,
            valueDate: startDate,
            description: `Disbursement of ${sp.currency} ${principal.toFixed(4)} to customer`,
          });

          // Interest accrual
          ledgerData.push({
            tenantId: tenant.id,
            contractId: contract.id,
            entryType: 'interest_accrual',
            debitCredit: 'debit',
            amount: interestAmount,
            currency: sp.currency,
            runningBalance,
            effectiveDate: startDate,
            valueDate: startDate,
            description: `Interest accrual of ${sp.currency} ${interestAmount.toFixed(4)}`,
          });

          // Fee
          ledgerData.push({
            tenantId: tenant.id,
            contractId: contract.id,
            entryType: 'fee',
            debitCredit: 'debit',
            amount: totalFees,
            currency: sp.currency,
            runningBalance,
            effectiveDate: startDate,
            valueDate: startDate,
            description: `Origination fee of ${sp.currency} ${totalFees.toFixed(4)}`,
          });

          // Repayment credits
          const paidScheduleEntries = await p.repaymentScheduleEntry.findMany({
            where: { contractId: contract.id, status: 'paid' },
            orderBy: { installmentNumber: 'asc' },
          });
          for (const entry of paidScheduleEntries) {
            runningBalance -= Number(entry.paidAmount);
            ledgerData.push({
              tenantId: tenant.id,
              contractId: contract.id,
              entryType: 'repayment',
              debitCredit: 'credit',
              amount: Number(entry.paidAmount),
              currency: sp.currency,
              runningBalance: Math.max(0, runningBalance),
              effectiveDate: entry.paidAt ?? daysAgo(30),
              valueDate: entry.paidAt ?? daysAgo(30),
              description: `Repayment installment ${entry.installmentNumber}`,
            });
          }

          // Write-off entry if applicable
          if (isWrittenOff) {
            ledgerData.push({
              tenantId: tenant.id,
              contractId: contract.id,
              entryType: 'write_off',
              debitCredit: 'credit',
              amount: Math.max(0, runningBalance),
              currency: sp.currency,
              runningBalance: 0,
              effectiveDate: daysAgo(30),
              valueDate: daysAgo(30),
              description: `Write-off of remaining balance ${sp.currency} ${Math.max(0, runningBalance).toFixed(4)}`,
            });
          }

          if (ledgerData.length > 0) {
            await p.ledgerEntry.createMany({ data: ledgerData });
          }
        }

        // -- Collections actions for overdue/delinquent/default contracts
        if (spec.dpd >= 30) {
          const existingActions = await p.collectionsAction.count({ where: { contractId: contract.id } });
          if (existingActions === 0) {
            const actions: Prisma.CollectionsActionCreateManyInput[] = [
              {
                tenantId: tenant.id,
                contractId: contract.id,
                actionType: 'sms_reminder',
                notes: `Automated SMS reminder sent for ${spec.dpd} DPD contract`,
                actorId: null,
                createdAt: daysAgo(spec.dpd - 5),
              },
            ];
            if (spec.dpd >= 60) {
              actions.push({
                tenantId: tenant.id,
                contractId: contract.id,
                actionType: 'phone_call',
                notes: 'Collections agent phone call — customer promised to pay',
                actorId: spAdminId || null,
                promiseDate: daysFromNow(7),
                createdAt: daysAgo(spec.dpd - 30),
              });
            }
            if (spec.dpd >= 90) {
              actions.push({
                tenantId: tenant.id,
                contractId: contract.id,
                actionType: 'escalation',
                notes: 'Escalated to senior collections — no payment received after multiple attempts',
                actorId: spAdminId || null,
                createdAt: daysAgo(spec.dpd - 60),
              });
            }
            await p.collectionsAction.createMany({ data: actions });
          }
        }

        // -- Notifications
        const existingNotifications = await p.notification.count({ where: { contractId: contract.id } });
        if (existingNotifications === 0) {
          const notifData: Prisma.NotificationCreateManyInput[] = [
            {
              tenantId: tenant.id,
              customerId: custRec.id,
              contractId: contract.id,
              eventType: 'loan.disbursed',
              channel: 'sms',
              recipient: sp.phonePrefix + phoneDigits(sp.phonePadLen, (spIdx + 10) * 10000 + custRec.idx),
              templateId: 'disbursement_notification',
              content: `Your loan of ${sp.currency} ${principal} has been disbursed to your wallet.`,
              status: 'delivered',
              sentAt: startDate,
              deliveredAt: startDate,
            },
          ];
          if (spec.dpd >= 30) {
            notifData.push({
              tenantId: tenant.id,
              customerId: custRec.id,
              contractId: contract.id,
              eventType: 'payment.overdue',
              channel: 'sms',
              recipient: sp.phonePrefix + phoneDigits(sp.phonePadLen, (spIdx + 10) * 10000 + custRec.idx),
              templateId: 'overdue_reminder',
              content: `Your payment is ${spec.dpd} days overdue. Please make a payment to avoid further penalties.`,
              status: 'delivered',
              sentAt: daysAgo(spec.dpd - 5),
              deliveredAt: daysAgo(spec.dpd - 5),
            });
          }
          await p.notification.createMany({ data: notifData });
        }

        console.log(`  Contract ${contractNumber} [${custRec.profile.tag}]: ${spec.status}, ${spec.dpd} DPD`);
      }
    }

    // -----------------------------------------------------------------
    // 9. Reconciliation, Settlements, Audit Logs
    // -----------------------------------------------------------------
    console.log('[STG 9/9] Creating reconciliation, settlements, audit logs...');

    // -- Reconciliation: 2 clean batches + 1 with exceptions
    const reconDates = [daysAgo(3), daysAgo(2), daysAgo(1)];
    for (let ri = 0; ri < reconDates.length; ri++) {
      const reconDate = reconDates[ri];
      const existingRecon = await p.reconciliationRun.findFirst({
        where: { tenantId: tenant.id, runDate: reconDate },
      });
      if (existingRecon) continue;

      const hasExceptions = ri === 2; // last one has exceptions
      const totalTxns = 50 + ri * 10;
      const matchedTxns = hasExceptions ? totalTxns - 3 : totalTxns;
      const exceptionCount = hasExceptions ? 3 : 0;

      const recon = await p.reconciliationRun.create({
        data: {
          tenantId: tenant.id,
          runDate: reconDate,
          status: hasExceptions ? 'completed_with_exceptions' : 'completed',
          matchRate: hasExceptions ? 94.0 : 100.0,
          totalTxns,
          matchedTxns,
          exceptionCount,
        },
      });

      if (hasExceptions) {
        await p.reconciliationException.createMany({
          data: [
            {
              tenantId: tenant.id,
              reconciliationRunId: recon.id,
              txnType: 'repayment',
              externalRef: `STG-RECON-EXC-${sp.country}-001`,
              exceptionType: 'amount_mismatch',
              severity: 'medium',
              amount: base * 5,
              description: 'External payment amount does not match internal record',
              resolved: false,
            },
            {
              tenantId: tenant.id,
              reconciliationRunId: recon.id,
              txnType: 'disbursement',
              externalRef: `STG-RECON-EXC-${sp.country}-002`,
              exceptionType: 'missing_internal',
              severity: 'high',
              amount: base * 20,
              description: 'External disbursement has no matching internal transaction',
              resolved: false,
            },
            {
              tenantId: tenant.id,
              reconciliationRunId: recon.id,
              txnType: 'repayment',
              externalRef: `STG-RECON-EXC-${sp.country}-003`,
              exceptionType: 'duplicate',
              severity: 'low',
              amount: base * 3,
              description: 'Potential duplicate repayment detected',
              resolved: true,
              resolvedAt: daysAgo(0),
            },
          ],
        });
      }
      console.log(`  Reconciliation batch ${ri + 1}: ${hasExceptions ? 'with exceptions' : 'clean'}`);
    }

    // -- Settlement with revenue splits
    const existingSettlement = await p.settlementRun.findFirst({
      where: { tenantId: tenant.id },
    });
    if (!existingSettlement) {
      const totalRevenue = base * 200;
      const settlement = await p.settlementRun.create({
        data: {
          tenantId: tenant.id,
          periodStart: daysAgo(30),
          periodEnd: daysAgo(1),
          status: 'settled',
          totalRevenue,
          approvedBy: spAdminId || undefined,
          approvedAt: daysAgo(0),
        },
      });

      // Revenue splits: lender 55%, SP 30%, EMI 10%, Platform 5%
      const splits = [
        { partyType: 'lender', partyId: lender.id, sharePct: 55 },
        { partyType: 'sp', partyId: tenant.id, sharePct: 30 },
        { partyType: 'emi', partyId: tenant.id, sharePct: 10 },
        { partyType: 'platform', partyId: tenant.id, sharePct: 5 },
      ];
      const lineData: Prisma.SettlementLineCreateManyInput[] = splits.map((s) => ({
        tenantId: tenant.id,
        settlementRunId: settlement.id,
        partyType: s.partyType,
        partyId: s.partyId,
        grossRevenue: totalRevenue,
        sharePercentage: s.sharePct,
        shareAmount: Math.round(totalRevenue * s.sharePct / 100),
        deductions: 0,
        netAmount: Math.round(totalRevenue * s.sharePct / 100),
      }));
      await p.settlementLine.createMany({ data: lineData });
      console.log(`  Settlement: ${sp.currency} ${totalRevenue} with ${splits.length} revenue splits`);
    }

    // -- Audit logs
    const existingAuditLogs = await p.auditLog.count({ where: { tenantId: tenant.id } });
    if (existingAuditLogs === 0) {
      const auditData: Prisma.AuditLogCreateManyInput[] = [
        {
          tenantId: tenant.id,
          actorId: spAdminId || undefined,
          actorType: 'user',
          actorIp: '10.0.1.100',
          action: 'user.login',
          resourceType: 'user',
          resourceId: spAdminId || undefined,
          metadata: { userAgent: 'Mozilla/5.0', environment: 'staging' },
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant.id,
          actorType: 'system',
          action: 'contract.status_changed',
          resourceType: 'contract',
          beforeValue: { status: 'active' },
          afterValue: { status: 'overdue' },
          metadata: { reason: 'Payment overdue by 30 days', environment: 'staging' },
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenant.id,
          actorId: spAdminId || undefined,
          actorType: 'user',
          actorIp: '10.0.1.100',
          action: 'product.created',
          resourceType: 'product',
          afterValue: { code: activeProductRecords[0]?.code ?? 'unknown', status: 'active' },
          metadata: { environment: 'staging' },
          createdAt: daysAgo(5),
        },
        {
          tenantId: tenant.id,
          actorType: 'system',
          action: 'reconciliation.completed',
          resourceType: 'reconciliation_run',
          metadata: { totalTxns: 50, matchRate: 100.0, environment: 'staging' },
          createdAt: daysAgo(2),
        },
        {
          tenantId: tenant.id,
          actorType: 'system',
          action: 'settlement.executed',
          resourceType: 'settlement_run',
          metadata: { totalRevenue: base * 200, currency: sp.currency, environment: 'staging' },
          createdAt: daysAgo(0),
        },
      ];
      await p.auditLog.createMany({ data: auditData });
      console.log(`  Audit logs: ${auditData.length} entries`);
    }
  }

  console.log('\n============================================================');
  console.log('  Staging seed complete!');
  console.log('============================================================');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main()
  .then(async () => {
    if (process.env.ENVIRONMENT === 'staging') {
      await seedStagingData(prisma);
    }
  })
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
