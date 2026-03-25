import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    email: string;
    passwordHash: string;
    name?: string;
    roleId: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: data.email, deletedAt: null },
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
    roleId?: string;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.roleId !== undefined) updateData.role = { connect: { id: data.roleId } };

    return this.prisma.user.update({
      where: { id },
      data: updateData,
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
