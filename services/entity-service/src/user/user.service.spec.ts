/**
 * User-RLS sweep regression tests (DEV-PROMPT-MFA-STATUS-DISPLAY-FIX).
 *
 * Pin the wiring that fixes the "MFA shows Disabled after enrollment"
 * symptom: every UserService method must wrap in `enterTenantContext`
 * and route every `user.X` access through `scoped()`. The previous
 * implementation used the bare singleton (`this.prisma.user.findFirst`)
 * which RLS silently filtered to zero rows.
 *
 * Strategy: a "distinguishing prisma" mock where the bare-singleton
 * `user.X` jest.fns are SEPARATE from the scoped-client `user.X`
 * jest.fns. After invoking each service method, we assert that the
 * SCOPED fns were called and the singleton fns were NOT — which is
 * exactly the wiring contract: tenant-user reads/writes hit the
 * in-tx connection where SET LOCAL is active.
 */
import { UserService } from './user.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

function makeService() {
  // SCOPED model accessors — the tx-routed path, where reads/writes
  // SHOULD land.
  const scopedUser = {
    findFirst: jest.fn().mockResolvedValue({
      id: USER,
      tenantId: TENANT,
      email: 'u@example.com',
      mfaEnabled: true,
      role: { id: 'r1', name: 'sp_admin' },
    }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: USER }),
    update: jest.fn().mockResolvedValue({ id: USER }),
  };

  // SINGLETON model accessors — the broken path. Tests assert these
  // are NEVER touched for tenant-user operations.
  const singletonUser = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const enterTenantContext = jest.fn(
    async (_ctx: { tenantId: string }, fn: () => Promise<unknown>) => fn(),
  );

  const prisma: any = {
    user: singletonUser,
    enterTenantContext,
    scoped: jest.fn(() => ({ user: scopedUser })),
  };

  const quotaService: any = {
    checkEntityLimit: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UserService(prisma, quotaService);
  return { service, prisma, scopedUser, singletonUser, enterTenantContext, quotaService };
}

describe('UserService — RLS routing (Cause C fix)', () => {
  describe('findById', () => {
    it('enters tenant context with the right tenantId', async () => {
      const { service, enterTenantContext } = makeService();
      await service.findById(TENANT, USER);
      expect(enterTenantContext).toHaveBeenCalledTimes(1);
      expect(enterTenantContext.mock.calls[0][0]).toEqual({ tenantId: TENANT });
    });

    it('routes findFirst through scoped() (not the singleton)', async () => {
      const { service, scopedUser, singletonUser } = makeService();
      await service.findById(TENANT, USER);
      expect(scopedUser.findFirst).toHaveBeenCalledTimes(1);
      expect(scopedUser.findFirst.mock.calls[0][0].where).toEqual({
        id: USER,
        tenantId: TENANT,
        deletedAt: null,
      });
      expect(singletonUser.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when scoped findFirst returns null', async () => {
      const { service, scopedUser } = makeService();
      scopedUser.findFirst.mockResolvedValueOnce(null);
      await expect(service.findById(TENANT, USER)).rejects.toThrow(/User/);
    });
  });

  describe('findAll', () => {
    it('enters tenant context + routes findMany through scoped()', async () => {
      const { service, scopedUser, singletonUser, enterTenantContext } = makeService();
      scopedUser.findMany.mockResolvedValueOnce([
        { id: USER, tenantId: TENANT, role: { id: 'r1', name: 'sp_admin' } },
      ]);
      const result = await service.findAll(TENANT);
      expect(enterTenantContext.mock.calls[0][0]).toEqual({ tenantId: TENANT });
      expect(scopedUser.findMany).toHaveBeenCalledTimes(1);
      expect(singletonUser.findMany).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    it('reports hasMore=true when more results than take', async () => {
      const { service, scopedUser } = makeService();
      // take=1 → service asks for take+1=2 rows; if 2 come back, hasMore=true.
      scopedUser.findMany.mockResolvedValueOnce([
        { id: '1', tenantId: TENANT, role: { id: 'r', name: 'x' } },
        { id: '2', tenantId: TENANT, role: { id: 'r', name: 'x' } },
      ]);
      const result = await service.findAll(TENANT, 1);
      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('enforces quota, then routes the dup-check + create through scoped()', async () => {
      const { service, scopedUser, singletonUser, quotaService } = makeService();
      // Dup check returns null → free to create
      scopedUser.findFirst.mockResolvedValueOnce(null);
      await service.create(TENANT, {
        email: 'new@example.com',
        passwordHash: 'hash',
        name: 'New User',
        roleId: 'r1',
      });
      expect(quotaService.checkEntityLimit).toHaveBeenCalledWith(TENANT, 'users');
      expect(scopedUser.findFirst).toHaveBeenCalledTimes(1);
      expect(scopedUser.create).toHaveBeenCalledTimes(1);
      expect(singletonUser.findFirst).not.toHaveBeenCalled();
      expect(singletonUser.create).not.toHaveBeenCalled();
    });

    it('throws ValidationError when scoped dup-check finds an existing row', async () => {
      const { service, scopedUser } = makeService();
      scopedUser.findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.create(TENANT, {
          email: 'dup@example.com',
          passwordHash: 'hash',
          name: 'Dup',
          roleId: 'r1',
        }),
      ).rejects.toThrow(/Email already in use/);
      expect(scopedUser.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('routes findById (nested) AND update through scoped()', async () => {
      const { service, scopedUser, singletonUser } = makeService();
      await service.update(TENANT, USER, { name: 'New Name', email: 'new@example.com' });
      // Two findFirst calls: outer update + nested findById.
      expect(scopedUser.findFirst.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(scopedUser.update).toHaveBeenCalledTimes(1);
      expect(scopedUser.update.mock.calls[0][0].data.name).toBe('New Name');
      expect(scopedUser.update.mock.calls[0][0].data.email).toBe('new@example.com');
      expect(singletonUser.update).not.toHaveBeenCalled();
    });

    it('connects role via relation syntax when roleId is provided', async () => {
      const { service, scopedUser } = makeService();
      await service.update(TENANT, USER, { roleId: 'new-role-id' });
      expect(scopedUser.update.mock.calls[0][0].data.role).toEqual({
        connect: { id: 'new-role-id' },
      });
    });
  });

  describe('updateProfile', () => {
    it('routes through scoped(); ignores undefined fields', async () => {
      const { service, scopedUser, singletonUser } = makeService();
      await service.updateProfile(TENANT, USER, { phone: '+233555000111' });
      expect(scopedUser.update).toHaveBeenCalledTimes(1);
      const data = scopedUser.update.mock.calls[0][0].data;
      expect(data.phone).toBe('+233555000111');
      expect(data.name).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(singletonUser.update).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('routes through scoped()', async () => {
      const { service, scopedUser, singletonUser } = makeService();
      await service.resetPassword(TENANT, USER, 'new-hash');
      expect(scopedUser.update).toHaveBeenCalledTimes(1);
      expect(scopedUser.update.mock.calls[0][0].data).toEqual({ passwordHash: 'new-hash' });
      expect(singletonUser.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('soft-deletes via scoped() update (sets status + deletedAt)', async () => {
      const { service, scopedUser, singletonUser } = makeService();
      await service.deactivate(TENANT, USER);
      expect(scopedUser.update).toHaveBeenCalledTimes(1);
      const data = scopedUser.update.mock.calls[0][0].data;
      expect(data.status).toBe('deactivated');
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(singletonUser.update).not.toHaveBeenCalled();
    });
  });
});
