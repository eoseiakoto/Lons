import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { ValidationError } from '@lons/common';

import { TenantService } from './tenant.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

const DEFAULT_SYSTEM_ROLES = [
  {
    name: 'SP Admin',
    description: 'System role: SP Admin — full permissions',
    permissions: [
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
    ],
  },
  {
    name: 'SP Operator',
    description: 'System role: SP Operator — operations and customer-facing',
    permissions: [
      'product:read', 'customer:read', 'customer:create', 'customer:update',
      'loan_request:read', 'loan_request:create', 'loan_request:process',
      'contract:read', 'repayment:read', 'repayment:create',
      'subscription:read', 'subscription:create', 'subscription:update',
    ],
  },
  {
    name: 'SP Analyst',
    description: 'System role: SP Analyst — read-only analytics',
    permissions: [
      'product:read', 'customer:read', 'loan_request:read',
      'contract:read', 'repayment:read', 'analytics:read',
    ],
  },
  {
    name: 'SP Auditor',
    description: 'System role: SP Auditor — read with PII access',
    permissions: [
      'product:read', 'customer:read', 'customer:read_pii',
      'loan_request:read', 'contract:read', 'repayment:read',
      'audit:read', 'analytics:read',
    ],
  },
  {
    name: 'SP Collections',
    description: 'System role: SP Collections — collections and recovery',
    permissions: [
      'customer:read', 'customer:read_pii',
      'contract:read', 'contract:update',
      'repayment:read', 'repayment:create',
      'loan_request:read',
    ],
  },
];

export interface OnboardTenantInput {
  name: string;
  slug: string;
  legalName?: string;
  registrationNumber?: string;
  country: string;
  planTier?: 'starter' | 'growth' | 'enterprise';
  platformFeePercent?: Prisma.Decimal | string;
  settings?: Prisma.InputJsonValue;
  adminName: string;
  adminEmail: string;
  adminPasswordHash: string;
}

@Injectable()
export class TenantOnboardingService {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private platformConfigService: PlatformConfigService,
  ) {}

  async onboard(input: OnboardTenantInput) {
    const schemaName = `tenant_${input.slug.replace(/-/g, '_')}`;

    // Validate slug uniqueness upfront
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existingSlug) {
      throw new ValidationError('Slug already in use', { slug: input.slug });
    }

    // Seed tenant settings from platform defaults if none provided
    let tenantSettings = input.settings;
    if (!tenantSettings) {
      const platformDefaults = await this.platformConfigService.getDefaults();
      tenantSettings = platformDefaults as unknown as Prisma.InputJsonValue;
    }

    // Run everything in a transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          legalName: input.legalName,
          registrationNumber: input.registrationNumber,
          country: input.country,
          schemaName,
          planTier: input.planTier || 'starter',
          status: 'active',
          platformFeePercent: input.platformFeePercent ?? null,
          settings: tenantSettings ?? Prisma.JsonNull,
        },
      });

      // 2. Create default system roles
      const roles = [];
      for (const roleDef of DEFAULT_SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: roleDef.name,
            description: roleDef.description,
            permissions: roleDef.permissions,
            isSystem: true,
          },
        });
        roles.push(role);
      }

      // 3. Create admin user with SP Admin role
      const adminRole = roles.find((r) => r.name === 'SP Admin')!;
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.adminEmail,
          passwordHash: input.adminPasswordHash,
          name: input.adminName,
          status: 'active',
          role: { connect: { id: adminRole.id } },
        },
        include: { role: true },
      });

      return { tenant, roles, adminUser };
    });
  }
}
