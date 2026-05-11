import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError, computeSearchableHash } from '@lons/common';

@Injectable()
export class PlatformUserService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    email: string;
    passwordHash: string;
    name?: string;
    role: 'platform_admin' | 'platform_support';
  }) {
    // S13B-2: PlatformUser.email is encrypted at rest. Lookups go through
    // `emailHash`. Use `findFirst` (not `findUnique`) since `emailHash` is
    // not a unique constraint — duplicate-email prevention is enforced by
    // the application-level check below + the existing unique on `email`
    // (which still applies to the ciphertext blob, but is left in place
    // as a guardrail).
    const existing = await this.prisma.platformUser.findFirst({
      where: { emailHash: computeSearchableHash(data.email) },
    });
    if (existing && !existing.deletedAt) {
      throw new ValidationError('Email already in use', { email: data.email });
    }

    return this.prisma.platformUser.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role,
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.platformUser.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundError('PlatformUser', id);
    return user;
  }

  async findAll(take: number = 20, cursor?: string) {
    const users = await this.prisma.platformUser.findMany({
      where: { deletedAt: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { items: users.slice(0, take), hasMore: users.length > take };
  }

  async update(id: string, data: {
    name?: string;
    email?: string;
    role?: 'platform_admin' | 'platform_support';
    status?: 'active' | 'suspended';
  }) {
    await this.findById(id);

    const updateData: Prisma.PlatformUserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;

    return this.prisma.platformUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.platformUser.update({
      where: { id },
      data: { status: 'deactivated', deletedAt: new Date() },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async resetPassword(id: string, passwordHash: string) {
    await this.findById(id);
    return this.prisma.platformUser.update({
      where: { id },
      data: { passwordHash },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
