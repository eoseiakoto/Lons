import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    externalId: string;
    externalSource?: string;
    fullName?: string;
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other' | 'undisclosed';
    nationalId?: string;
    nationalIdType?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    email?: string;
    country?: string;
    region?: string;
    city?: string;
    kycLevel?: 'none' | 'tier_1' | 'tier_2' | 'tier_3';
    metadata?: Prisma.InputJsonValue;
  }) {
    // Check for duplicates by externalId
    const existing = await this.prisma.customer.findFirst({
      where: { tenantId, externalId: data.externalId, externalSource: data.externalSource, deletedAt: null },
    });
    if (existing) {
      throw new ValidationError('Customer with this external ID already exists', {
        externalId: data.externalId,
      });
    }

    return this.prisma.customer.create({
      data: {
        tenantId,
        externalId: data.externalId,
        externalSource: data.externalSource,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        nationalId: data.nationalId,
        nationalIdType: data.nationalIdType,
        phonePrimary: data.phonePrimary,
        phoneSecondary: data.phoneSecondary,
        email: data.email,
        country: data.country,
        region: data.region,
        city: data.city,
        kycLevel: data.kycLevel,
        metadata: data.metadata ?? undefined,
        status: 'active',
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }

  async findByExternalId(tenantId: string, externalId: string, externalSource?: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, externalId, externalSource, deletedAt: null },
    });
  }

  async search(tenantId: string, filters: {
    status?: string;
    kycLevel?: string;
    segment?: string;
    phonePrimary?: string;
    externalId?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
    if (filters.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters.kycLevel) where.kycLevel = filters.kycLevel as Prisma.EnumKycLevelFilter['equals'];
    if (filters.segment) where.segment = filters.segment;
    if (filters.phonePrimary) where.phonePrimary = filters.phonePrimary;
    if (filters.externalId) where.externalId = filters.externalId;

    const customers = await this.prisma.customer.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return { items: customers.slice(0, take), hasMore: customers.length > take };
  }

  async findAll(tenantId: string, filters?: {
    skip?: number;
    take?: number;
    search?: string;
    status?: string;
  }) {
    const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
    if (filters?.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { phonePrimary: { contains: filters.search } },
        { externalId: { contains: filters.search } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      skip: filters?.skip ?? 0,
      take: filters?.take ?? 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string, filters?: {
    search?: string;
    status?: string;
  }) {
    const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
    if (filters?.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { phonePrimary: { contains: filters.search } },
        { externalId: { contains: filters.search } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.count({ where });
  }

  async update(tenantId: string, id: string, data: {
    fullName?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    email?: string;
    country?: string;
    region?: string;
    city?: string;
    kycLevel?: 'none' | 'tier_1' | 'tier_2' | 'tier_3';
    segment?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.phonePrimary !== undefined) updateData.phonePrimary = data.phonePrimary;
    if (data.phoneSecondary !== undefined) updateData.phoneSecondary = data.phoneSecondary;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.kycLevel !== undefined) updateData.kycLevel = data.kycLevel;
    if (data.segment !== undefined) updateData.segment = data.segment;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    return this.prisma.customer.update({ where: { id }, data: updateData });
  }

  async blacklist(tenantId: string, id: string, reason: string) {
    const customer = await this.findById(tenantId, id);
    if (customer.status === 'blacklisted') {
      throw new ValidationError('Customer is already blacklisted');
    }
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'blacklisted', blacklistReason: reason },
    });
  }

  async unblacklist(tenantId: string, id: string) {
    const customer = await this.findById(tenantId, id);
    if (customer.status !== 'blacklisted') {
      throw new ValidationError('Customer is not blacklisted');
    }
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'active', blacklistReason: null },
    });
  }
}
