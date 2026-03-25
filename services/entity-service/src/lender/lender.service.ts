import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError } from '@lons/common';

@Injectable()
export class LenderService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    name: string;
    licenseNumber?: string;
    country?: string;
    fundingCapacity?: number;
    fundingCurrency?: string;
    minInterestRate?: number;
    maxInterestRate?: number;
    settlementAccount?: Prisma.InputJsonValue;
    riskParameters?: Prisma.InputJsonValue;
  }) {
    return this.prisma.lender.create({
      data: {
        tenantId,
        name: data.name,
        licenseNumber: data.licenseNumber,
        country: data.country,
        fundingCapacity: data.fundingCapacity,
        fundingCurrency: data.fundingCurrency,
        minInterestRate: data.minInterestRate,
        maxInterestRate: data.maxInterestRate,
        settlementAccount: data.settlementAccount ?? undefined,
        riskParameters: data.riskParameters ?? undefined,
        status: 'active',
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const lender = await this.prisma.lender.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!lender) throw new NotFoundError('Lender', id);
    return lender;
  }

  async findAll(tenantId: string, take: number = 20, cursor?: string) {
    const lenders = await this.prisma.lender.findMany({
      where: { tenantId, deletedAt: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return { items: lenders.slice(0, take), hasMore: lenders.length > take };
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    licenseNumber?: string;
    fundingCapacity?: number;
    minInterestRate?: number;
    maxInterestRate?: number;
    settlementAccount?: Prisma.InputJsonValue;
    riskParameters?: Prisma.InputJsonValue;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.LenderUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.fundingCapacity !== undefined) updateData.fundingCapacity = data.fundingCapacity;
    if (data.minInterestRate !== undefined) updateData.minInterestRate = data.minInterestRate;
    if (data.maxInterestRate !== undefined) updateData.maxInterestRate = data.maxInterestRate;
    if (data.settlementAccount !== undefined) updateData.settlementAccount = data.settlementAccount;
    if (data.riskParameters !== undefined) updateData.riskParameters = data.riskParameters;

    return this.prisma.lender.update({ where: { id }, data: updateData });
  }

  async suspend(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.lender.update({
      where: { id },
      data: { status: 'suspended' },
    });
  }
}
