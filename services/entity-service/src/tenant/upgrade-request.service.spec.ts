import { BadRequestException } from '@nestjs/common';
import { PlanTier } from '@lons/database';

import { UpgradeRequestService } from './upgrade-request.service';

describe('UpgradeRequestService', () => {
  const TENANT = '00000000-0000-0000-0000-000000000001';
  const OPERATOR = '00000000-0000-0000-0000-000000000002';

  function build(currentTier: PlanTier, existingPending: any = null) {
    const prisma = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ planTier: currentTier }),
      },
      upgradeRequest: {
        findFirst: jest.fn().mockResolvedValue(existingPending),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'req-1',
            createdAt: new Date('2026-05-18T00:00:00Z'),
            status: 'pending',
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const eventBus = { emitAndBuild: jest.fn() } as any;
    return {
      prisma,
      eventBus,
      svc: new UpgradeRequestService(prisma, eventBus),
    };
  }

  it('creates an upgrade request for starter -> growth', async () => {
    const { svc, prisma, eventBus } = build('starter' as PlanTier);
    const req = await svc.requestUpgrade(TENANT, {
      targetTier: 'growth' as PlanTier,
      reason: 'need more volume',
      requestedBy: OPERATOR,
    });
    expect(req.id).toBe('req-1');
    expect(prisma.upgradeRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currentTier: 'starter',
        requestedTier: 'growth',
        status: 'pending',
        requestedBy: OPERATOR,
      }),
    });
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'plan.upgrade.requested',
      TENANT,
      expect.objectContaining({ currentTier: 'starter', requestedTier: 'growth' }),
    );
  });

  it('rejects same-tier requests', async () => {
    const { svc } = build('growth' as PlanTier);
    await expect(
      svc.requestUpgrade(TENANT, {
        targetTier: 'growth' as PlanTier,
        requestedBy: OPERATOR,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects downgrade (enterprise -> growth)', async () => {
    const { svc } = build('enterprise' as PlanTier);
    await expect(
      svc.requestUpgrade(TENANT, {
        targetTier: 'growth' as PlanTier,
        requestedBy: OPERATOR,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns existing pending request for the same target tier (idempotent)', async () => {
    const existing = { id: 'existing-1', status: 'pending' };
    const { svc, prisma } = build('starter' as PlanTier, existing);
    const result = await svc.requestUpgrade(TENANT, {
      targetTier: 'growth' as PlanTier,
      requestedBy: OPERATOR,
    });
    expect(result).toBe(existing);
    expect(prisma.upgradeRequest.create).not.toHaveBeenCalled();
  });

  it('lists requests for tenant ordered by createdAt desc', async () => {
    const { svc, prisma } = build('starter' as PlanTier);
    await svc.listForTenant(TENANT);
    expect(prisma.upgradeRequest.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      orderBy: { createdAt: 'desc' },
    });
  });
});
