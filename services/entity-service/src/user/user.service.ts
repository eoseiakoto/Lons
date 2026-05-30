import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError, computeSearchableHash } from '@lons/common';

import { QuotaEnforcementService } from '../plan-tier/quota-enforcement.service';

/**
 * User-RLS sweep (DEV-PROMPT-MFA-STATUS-DISPLAY-FIX, root cause).
 *
 * Every method here touches the RLS-scoped `users` table. The runtime
 * connects as `lons_app` (non-owner), so RLS enforces — a bare
 * `this.prisma.user.findFirst(...)` runs on a fresh pooled connection
 * with no `SET LOCAL app.current_tenant` and is silently filtered to
 * zero rows.
 *
 * The PrismaService middleware's `if (ctx.tx) return next(params)`
 * short-circuit was written assuming "ctx.tx exists → operation will
 * run on tx" — but Prisma routes by which client instance was called,
 * not by what's in AsyncLocalStorage. A singleton call dispatches on
 * a pool connection regardless of an ambient ALS tx.
 *
 * Empirically verified via Node probe replicating the middleware
 * against the real DB as `lons_app`: bare singleton inside
 * `enterTenantContext` returns NULL; via `tx`/`scoped()` returns the
 * row. So every method below now:
 *
 *   1. wraps its body in `prisma.enterTenantContext({ tenantId })`, and
 *   2. uses `prisma.scoped()` for every model access.
 *
 * Nested calls (e.g. `update()` calling `findById()`) become Postgres
 * savepoints — one extra round-trip, no correctness issue. Consistent
 * with the auth-service RLS sweep pattern.
 *
 * The audit doc Docs/AUDIT-ENTITY-SERVICE-RLS-SINGLETON-CALLS-2026-05-30.md
 * lists every other service in entity-service with the same anti-pattern
 * (tenant, role, audit-log, etc.) — to be triaged in a follow-up sweep.
 */
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
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      const tx = this.prisma.scoped();
      // S13B-2: equality lookup on `email` is impossible after encryption,
      // so existence checks go through the `emailHash` companion column.
      const existing = await tx.user.findFirst({
        where: {
          tenantId,
          emailHash: computeSearchableHash(data.email),
          deletedAt: null,
        },
      });
      if (existing) {
        throw new ValidationError('Email already in use', { email: data.email });
      }

      return tx.user.create({
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
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      const tx = this.prisma.scoped();
      const user = await tx.user.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: { role: true },
      });
      if (!user) throw new NotFoundError('User', id);
      return user;
    });
  }

  async findAll(tenantId: string, take: number = 20, cursor?: string) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      const tx = this.prisma.scoped();
      const users = await tx.user.findMany({
        where: { tenantId, deletedAt: null },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: { role: true },
      });
      return { items: users.slice(0, take), hasMore: users.length > take };
    });
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    roleId?: string;
  }) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      // Nested enterTenantContext (via findById) opens a savepoint — fine.
      await this.findById(tenantId, id);

      const updateData: Prisma.UserUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.roleId !== undefined) updateData.role = { connect: { id: data.roleId } };

      const tx = this.prisma.scoped();
      return tx.user.update({
        where: { id },
        data: updateData,
        include: { role: true },
      });
    });
  }

  async updateProfile(tenantId: string, id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
  }) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.findById(tenantId, id);

      const updateData: Prisma.UserUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;

      const tx = this.prisma.scoped();
      return tx.user.update({
        where: { id },
        data: updateData,
        include: { role: true },
      });
    });
  }

  async resetPassword(tenantId: string, id: string, passwordHash: string) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.findById(tenantId, id);
      const tx = this.prisma.scoped();
      return tx.user.update({
        where: { id },
        data: { passwordHash },
        include: { role: true },
      });
    });
  }

  async deactivate(tenantId: string, id: string) {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.findById(tenantId, id);
      const tx = this.prisma.scoped();
      return tx.user.update({
        where: { id },
        data: { status: 'deactivated', deletedAt: new Date() },
        include: { role: true },
      });
    });
  }
}
