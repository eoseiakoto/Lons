/**
 * seed-staging.ts
 * Staging environment seed script - populates database with realistic test data
 * Designed to run in Kubernetes as a one-off Job via run-staging-seed.sh
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Starting staging database seed...');

  try {
    // Platform schema setup - ensure platform tenant exists
    console.log('Setting up platform tenant...');
    const platformTenant = await prisma.tenant.upsert({
      where: { slug: 'lons-platform' },
      update: {},
      create: {
        name: 'Lons Platform',
        slug: 'lons-platform',
        legalName: 'Lons Inc.',
        registrationNumber: 'PLATFORM-001',
        country: 'GLOBAL',
        schemaName: 'platform',
        planTier: 'enterprise',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Platform tenant: ${platformTenant.id}`);

    // Example staging tenant - Ghana
    console.log('Setting up staging Ghana tenant...');
    const ghTenant = await prisma.tenant.upsert({
      where: { slug: 'staging-quickcash-gh' },
      update: {},
      create: {
        name: 'Staging - QuickCash Ghana',
        slug: 'staging-quickcash-gh',
        legalName: 'QuickCash Financial Services Ltd (STAGING)',
        registrationNumber: 'GHA-REG-2024-001-STAGING',
        country: 'GHA',
        schemaName: 'tenant_quickcash_gh_staging',
        planTier: 'professional',
        currency: 'GHS',
        timezone: 'Africa/Accra',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Ghana staging tenant: ${ghTenant.id}`);

    // Create admin user for Ghana tenant
    console.log('Creating admin user for Ghana tenant...');
    const adminPassword = await hashPassword('staging_admin_123!');
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@quickcash-staging.gh' },
      update: {},
      create: {
        tenantId: ghTenant.id,
        email: 'admin@quickcash-staging.gh',
        firstName: 'Admin',
        lastName: 'User',
        passwordHash: adminPassword,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Admin user: ${adminUser.id}`);

    // Create lender for Ghana tenant
    console.log('Creating lender for Ghana tenant...');
    const ghLender = await prisma.lender.upsert({
      where: { tenantId_externalId: { tenantId: ghTenant.id, externalId: 'lender-gh-001' } },
      update: {},
      create: {
        tenantId: ghTenant.id,
        externalId: 'lender-gh-001',
        name: 'GoldStar Capital (Staging)',
        licenseNumber: 'LIC-GHA-2024-001-STAGING',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Ghana lender: ${ghLender.id}`);

    // Create a product for Ghana
    console.log('Creating overdraft product for Ghana...');
    const ghProduct = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: ghTenant.id, code: 'OD-GHS-001' } },
      update: {},
      create: {
        tenantId: ghTenant.id,
        code: 'OD-GHS-001',
        name: 'Instant Overdraft (Staging)',
        description: 'Short-term overdraft facility for testing',
        type: 'overdraft',
        minAmount: new Prisma.Decimal('10.00'),
        maxAmount: new Prisma.Decimal('5000.00'),
        minTenorDays: 1,
        maxTenorDays: 30,
        interestRateModel: 'flat',
        baseInterestRate: new Prisma.Decimal('5.00'),
        repaymentMethod: 'auto_deduction',
        gracePeriodDays: 0,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Ghana product: ${ghProduct.id}`);

    // Example staging tenant - Kenya
    console.log('Setting up staging Kenya tenant...');
    const keTenant = await prisma.tenant.upsert({
      where: { slug: 'staging-quickcash-ke' },
      update: {},
      create: {
        name: 'Staging - QuickCash Kenya',
        slug: 'staging-quickcash-ke',
        legalName: 'QuickCash Financial Services Ltd (STAGING)',
        registrationNumber: 'KEN-REG-2024-001-STAGING',
        country: 'KEN',
        schemaName: 'tenant_quickcash_ke_staging',
        planTier: 'professional',
        currency: 'KES',
        timezone: 'Africa/Nairobi',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Kenya staging tenant: ${keTenant.id}`);

    // Create lender for Kenya
    console.log('Creating lender for Kenya tenant...');
    const keLender = await prisma.lender.upsert({
      where: { tenantId_externalId: { tenantId: keTenant.id, externalId: 'lender-ke-001' } },
      update: {},
      create: {
        tenantId: keTenant.id,
        externalId: 'lender-ke-001',
        name: 'FastLoan Kenya (Staging)',
        licenseNumber: 'LIC-KEN-2024-001-STAGING',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Kenya lender: ${keLender.id}`);

    // Create a product for Kenya
    console.log('Creating micro-loan product for Kenya...');
    const keProduct = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: keTenant.id, code: 'ML-KES-001' } },
      update: {},
      create: {
        tenantId: keTenant.id,
        code: 'ML-KES-001',
        name: 'Micro Loan (Staging)',
        description: 'Short-term micro loan for testing',
        type: 'micro_loan',
        minAmount: new Prisma.Decimal('500.00'),
        maxAmount: new Prisma.Decimal('50000.00'),
        minTenorDays: 7,
        maxTenorDays: 90,
        interestRateModel: 'reducing_balance',
        baseInterestRate: new Prisma.Decimal('12.50'),
        repaymentMethod: 'equal_installments',
        gracePeriodDays: 0,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`✓ Kenya product: ${keProduct.id}`);

    console.log('');
    console.log('===========================================');
    console.log('Staging database seed completed successfully!');
    console.log('===========================================');
    console.log('');
    console.log('Test credentials:');
    console.log('  Email: admin@quickcash-staging.gh');
    console.log('  Password: staging_admin_123!');
    console.log('');
  } catch (error) {
    console.error('Error during seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Import Prisma types for seed script
declare global {
  namespace Prisma {
    type Decimal = any;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
