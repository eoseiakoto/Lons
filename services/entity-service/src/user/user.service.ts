import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError, computeSearchableHash } from '@lons/common';

import { QuotaEnforcementService } from '../plan-tier/quota-enforcement.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    // Sprint 14 (S14-10): portal-user quota enforcement.
    private quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async create(tenantId: string, data: {
    email: string;
    passwordHash: string;
    name?: string;
    roleId: string;
  }) {
    // S14-10: cap active portal users at the plan limit.
    await this.quotaEnforcementService.checkEntityLimit(tenantId, 'users');
    // S13B-2: equality lookup on `email` is impossible after encryption,
    // so existence checks go through the `emailHash` companion column.
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        emailHash: computeSearchableHash(data.email),
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ValidationError('Email already in use', { email: data.email });
    }

    return this.prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        status: 'active',
        role: { connect: { id: data.roleId } },
      },
      include: { role: true },
    });
  }

  async findById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async findAll(tenantId: string, take: number = 20, cursor?: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { role: true },
    });
    return { items: users.slice(0, take), hasMore: users.length > take };
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    roleId?: string;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.roleId !== undefined) updateData.role = { connect: { id: data.roleId } };

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { role: true },
    });
  }

  async updateProfile(tenantId: string, id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { role: true },
    });
  }

  async resetPassword(tenantId: string, id: string, passwordHash: string) {
    await this.findById(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      include: { role: true },
    });
  }

  async deactivate(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: { status: 'deactivated', deletedAt: new Date() },
      include: { role: true },
    });
  }
}
