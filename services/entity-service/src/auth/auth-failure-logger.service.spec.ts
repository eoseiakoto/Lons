import { AuthFailureLoggerService } from './auth-failure-logger.service';
import { IAuthenticatedUser } from './interfaces/jwt-payload.interface';

const USER: IAuthenticatedUser = {
  userId: '00000000-0000-0000-0000-000000000abc',
  tenantId: 'tenant-1',
  role: 'sp_operator',
  permissions: ['customer:read'],
  isPlatformAdmin: false,
};

function makeService(opts: {
  recentFailureCount?: number;
  auditService?: any;
  eventBus?: any;
}) {
  const prisma: any = {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(opts.recentFailureCount ?? 0),
    },
  };
  const auditService = opts.auditService ?? { log: jest.fn().mockResolvedValue(undefined) };
  const eventBus = opts.eventBus ?? { emitAndBuild: jest.fn() };
  const service = new AuthFailureLoggerService(prisma, auditService, eventBus);
  return { service, prisma, auditService, eventBus };
}

describe('AuthFailureLoggerService.logFieldAccessDenied', () => {
  it('writes a hash-chained audit row via AuditService', async () => {
    const { service, auditService } = makeService({});
    await service.logFieldAccessDenied(USER, 'customer', 'nationalId', ['customer:read_pii']);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: USER.tenantId,
        actorId: USER.userId,
        actorType: 'user',
        resourceId: USER.userId,
        metadata: expect.objectContaining({
          action: 'field_access_denied',
          resourceField: 'nationalId',
          requiredPermissions: ['customer:read_pii'],
        }),
      }),
    );
  });

  it('emits AUTHORIZATION_FAILURE event', async () => {
    const { service, eventBus } = makeService({});
    await service.logFieldAccessDenied(USER, 'customer', 'email', ['customer:read_pii']);
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'authorization.failure',
      USER.tenantId,
      expect.objectContaining({ action: 'field_access_denied' }),
    );
  });

  it('falls back to raw auditLog.create when AuditService is absent', async () => {
    const prisma: any = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AuthFailureLoggerService(prisma);
    await service.logFieldAccessDenied(USER, 'customer', 'nationalId', ['customer:read_pii']);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('swallows audit write errors (auth refusal is the user-visible outcome)', async () => {
    const { service } = makeService({
      auditService: { log: jest.fn().mockRejectedValue(new Error('audit down')) },
    });
    await expect(
      service.logFieldAccessDenied(USER, 'customer', 'email', ['customer:read_pii']),
    ).resolves.not.toThrow();
  });
});

describe('AuthFailureLoggerService.logMutationAccessDenied', () => {
  it('writes resolver name as resourceField', async () => {
    const { service, auditService } = makeService({});
    await service.logMutationAccessDenied(USER, 'createCollectionsCase', 'collections:create');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'mutation_access_denied',
          resourceField: 'createCollectionsCase',
          requiredPermissions: ['collections:create'],
        }),
      }),
    );
  });
});

describe('AuthFailureLoggerService — monitoring alert', () => {
  it('emits high-rate alert when failures cross threshold (10 in 5min)', async () => {
    const { service, eventBus } = makeService({ recentFailureCount: 10 });
    await service.logFieldAccessDenied(USER, 'customer', 'email', ['customer:read_pii']);
    const alertEmitted = (eventBus.emitAndBuild as jest.Mock).mock.calls.some(
      (call: any[]) => call[2]?.alertType === 'high_auth_failure_rate',
    );
    expect(alertEmitted).toBe(true);
  });

  it('does NOT emit alert below threshold', async () => {
    const { service, eventBus } = makeService({ recentFailureCount: 9 });
    await service.logFieldAccessDenied(USER, 'customer', 'email', ['customer:read_pii']);
    const alertEmitted = (eventBus.emitAndBuild as jest.Mock).mock.calls.some(
      (call: any[]) => call[2]?.alertType === 'high_auth_failure_rate',
    );
    expect(alertEmitted).toBe(false);
  });
});
