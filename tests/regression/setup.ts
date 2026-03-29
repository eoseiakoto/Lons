import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Prisma client singleton for regression tests
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/lons';
const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

export { prisma };

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------

const GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:3000/graphql';

export async function graphqlRequest<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
): Promise<{ data: T; errors?: Array<{ message: string; extensions?: any }> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Authentication helper
// ---------------------------------------------------------------------------

export async function authenticateAs(
  role: 'admin' | 'operator' | 'platform_admin',
  tenantId?: string,
): Promise<string> {
  if (role === 'platform_admin') {
    const { data, errors } = await graphqlRequest<{ loginPlatformUser: { accessToken: string } }>(
      `mutation LoginPlatform($email: String!, $password: String!) {
        loginPlatformUser(email: $email, password: $password) {
          accessToken
          refreshToken
        }
      }`,
      { email: 'platform-admin@lons-test.io', password: 'Test!Passw0rd#Regr' },
    );
    if (errors?.length) throw new Error(`Platform login failed: ${errors[0].message}`);
    return data.loginPlatformUser.accessToken;
  }

  const email = role === 'admin' ? 'admin@lons-test.io' : 'operator@lons-test.io';
  const { data, errors } = await graphqlRequest<{ loginTenantUser: { accessToken: string } }>(
    `mutation Login($tenantId: String!, $email: String!, $password: String!) {
      loginTenantUser(tenantId: $tenantId, email: $email, password: $password) {
        accessToken
        refreshToken
      }
    }`,
    { tenantId: tenantId!, email, password: 'Test!Passw0rd#Regr' },
  );
  if (errors?.length) throw new Error(`Tenant login failed: ${errors[0].message}`);
  return data.loginTenantUser.accessToken;
}

// ---------------------------------------------------------------------------
// Seed data types
// ---------------------------------------------------------------------------

export interface TestSeedData {
  tenantId: string;
  productId: string;
  customerId: string;
  adminUserId: string;
  operatorUserId: string;
  lenderId: string;
}

// ---------------------------------------------------------------------------
// Seed test data
// ---------------------------------------------------------------------------

/**
 * Creates a complete test tenant with a Micro-Loan product (30-day, 5 % flat fee),
 * a KYC-verified customer, and admin + operator users.
 *
 * All IDs are deterministic (UUIDv5-style, derived from the provided suffix) so the
 * same call is idempotent — if the rows already exist they are upserted.
 */
export async function seedTestData(suffix = 'primary'): Promise<TestSeedData> {
  const idSeed = crypto.createHash('sha256').update(`regression-${suffix}`).digest('hex');
  const uid = (offset: number) =>
    [
      idSeed.slice(offset, offset + 8),
      idSeed.slice(offset + 8, offset + 12),
      '4' + idSeed.slice(offset + 13, offset + 16),
      '8' + idSeed.slice(offset + 17, offset + 20),
      idSeed.slice(offset + 20, offset + 32),
    ].join('-');

  const tenantId = uid(0);
  const productId = uid(4);
  const customerId = uid(8);
  const adminUserId = uid(12);
  const operatorUserId = uid(16);
  const lenderId = uid(20);

  // --- Tenant ---
  await (prisma as any).tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: `Regression Tenant ${suffix}`,
      slug: `regression-${suffix}`,
      status: 'active',
      settings: {},
    },
  });

  // --- Lender ---
  await (prisma as any).lender.upsert({
    where: { id: lenderId },
    update: {},
    create: {
      id: lenderId,
      tenantId,
      name: `Test Lender ${suffix}`,
      code: `LND-${suffix.toUpperCase()}`,
      status: 'active',
      revenueSharePct: 70,
    },
  });

  // --- Product (Micro-Loan, 30-day, 5 % flat fee) ---
  await (prisma as any).product.upsert({
    where: { id: productId },
    update: {},
    create: {
      id: productId,
      tenantId,
      lenderId,
      code: `ML-${suffix.toUpperCase()}`,
      name: `Micro Loan ${suffix}`,
      type: 'micro_loan',
      currency: 'GHS',
      minAmount: 50,
      maxAmount: 5000,
      minTenorDays: 7,
      maxTenorDays: 30,
      interestRateModel: 'flat',
      interestRate: 5.0,
      repaymentMethod: 'lump_sum',
      gracePeriodDays: 0,
      approvalWorkflow: 'auto',
      maxActiveLoans: 1,
      status: 'active',
    },
  });

  // --- Customer with KYC ---
  await (prisma as any).customer.upsert({
    where: { id: customerId },
    update: {},
    create: {
      id: customerId,
      tenantId,
      externalId: `EXT-${suffix}`,
      firstName: 'Regression',
      lastName: `Tester-${suffix}`,
      phone: '+233200000001',
      email: `regression-${suffix}@test.io`,
      kycLevel: 'full',
      status: 'active',
      nationalId: `GHA-000-${suffix}`,
      dateOfBirth: new Date('1990-01-15'),
    },
  });

  // --- Admin user ---
  const passwordHash = crypto.createHash('sha256').update('Test!Passw0rd#Regr').digest('hex');

  await (prisma as any).user.upsert({
    where: { id: adminUserId },
    update: {},
    create: {
      id: adminUserId,
      tenantId,
      email: 'admin@lons-test.io',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Tester',
      status: 'active',
    },
  });

  // Assign admin role
  const adminRole = await (prisma as any).role.findFirst({
    where: { tenantId, name: 'admin' },
  });
  if (adminRole) {
    await (prisma as any).userRole.upsert({
      where: { userId_roleId: { userId: adminUserId, roleId: adminRole.id } },
      update: {},
      create: { userId: adminUserId, roleId: adminRole.id },
    });
  }

  // --- Operator user ---
  await (prisma as any).user.upsert({
    where: { id: operatorUserId },
    update: {},
    create: {
      id: operatorUserId,
      tenantId,
      email: 'operator@lons-test.io',
      passwordHash,
      firstName: 'Operator',
      lastName: 'Tester',
      status: 'active',
    },
  });

  const operatorRole = await (prisma as any).role.findFirst({
    where: { tenantId, name: 'operator' },
  });
  if (operatorRole) {
    await (prisma as any).userRole.upsert({
      where: { userId_roleId: { userId: operatorUserId, roleId: operatorRole.id } },
      update: {},
      create: { userId: operatorUserId, roleId: operatorRole.id },
    });
  }

  return { tenantId, productId, customerId, adminUserId, operatorUserId, lenderId };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes all rows created by seedTestData for the given suffix(es).
 * Executed inside afterAll to keep the database tidy between runs.
 */
export async function cleanup(suffixes: string[] = ['primary']): Promise<void> {
  for (const suffix of suffixes) {
    const idSeed = crypto.createHash('sha256').update(`regression-${suffix}`).digest('hex');
    const uid = (offset: number) =>
      [
        idSeed.slice(offset, offset + 8),
        idSeed.slice(offset + 8, offset + 12),
        '4' + idSeed.slice(offset + 13, offset + 16),
        '8' + idSeed.slice(offset + 17, offset + 20),
        idSeed.slice(offset + 20, offset + 32),
      ].join('-');

    const tenantId = uid(0);

    // Delete in dependency order — children before parents.
    // Using deleteMany with tenantId filter keeps it safe.
    const tables = [
      'webhookDeliveryLog',
      'webhookEndpoint',
      'auditLog',
      'collectionsAction',
      'reconciliationException',
      'reconciliationRun',
      'settlementLine',
      'settlementRun',
      'ledgerEntry',
      'repayment',
      'repaymentScheduleEntry',
      'contract',
      'scoringResult',
      'loanRequest',
      'customer',
      'product',
      'userRole',
      'user',
      'lender',
      'tenant',
    ];

    for (const table of tables) {
      try {
        const model = (prisma as any)[table];
        if (!model) continue;

        if (table === 'tenant') {
          await model.deleteMany({ where: { id: tenantId } });
        } else if (table === 'userRole') {
          const userIds = [uid(12), uid(16)];
          await model.deleteMany({ where: { userId: { in: userIds } } });
        } else {
          await model.deleteMany({ where: { tenantId } });
        }
      } catch {
        // Table may not exist in every schema version — skip silently.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Teardown – disconnect Prisma
// ---------------------------------------------------------------------------

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
