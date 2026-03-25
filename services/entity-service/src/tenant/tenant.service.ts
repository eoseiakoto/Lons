import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(data: {
    name: string;
    slug: string;
    legalName?: string;
    registrationNumber?: string;
    country: string;
    schemaName: string;
    planTier?: 'starter' | 'professional' | 'enterprise';
    settings?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.tenant.findUnique({
      where: { schemaName: data.schemaName },
    });
    if (existing) {
      throw new ValidationError('Schema name already exists', { schemaName: data.schemaName });
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        legalName: data.legalName,
        registrationNumber: data.registrationNumber,
        country: data.country,
        schemaName: data.schemaName,
        planTier: data.planTier || 'starter',
        status: 'active',
        settings: data.settings ?? Prisma.JsonNull,
      },
    });

    return tenant;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tenant) throw new NotFoundError('Tenant', id);
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundError('Tenant', slug);
    return tenant;
  }

  async findAll(take: number = 20, cursor?: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: tenants.slice(0, take),
      hasMore: tenants.length > take,
    };
  }

  async update(id: string, data: Prisma.TenantUpdateInput) {
    await this.findById(id);
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async suspend(id: string) {
    const tenant = await this.findById(id);
    if (tenant.status === 'suspended') {
      throw new ValidationError('Tenant is already suspended');
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'suspended' },
    });
  }
}
