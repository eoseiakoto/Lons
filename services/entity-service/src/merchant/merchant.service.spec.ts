/**
 * Merchant CRUD service — Sprint 11 Track B / B3.
 */

import { MerchantService } from './merchant.service';
import { MerchantStatus, SettlementType } from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const MERCHANT_ID = '22222222-2222-2222-2222-222222222222';

function makePrisma(opts: { existing?: any; current?: any } = {}) {
  return {
    merchant: {
      findFirst: jest
        .fn()
        // first call (uniqueness check) returns existing or null;
        // subsequent calls (findById) return `current` if provided.
        .mockResolvedValueOnce(opts.existing ?? null)
        .mockResolvedValue(opts.current ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...args.data })),
      update: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...(args.data ?? {}) })),
    },
  };
}

describe('MerchantService.create', () => {
  it('rejects empty name', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(
      service.create(TENANT, { name: '', code: 'M1', discountRate: '0.025' }),
    ).rejects.toThrow(/Merchant name is required/);
  });

  it('rejects empty code', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(
      service.create(TENANT, { name: 'M', code: '', discountRate: '0.025' }),
    ).rejects.toThrow(/Merchant code is required/);
  });

  it('rejects discount rate >= 1', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(
      service.create(TENANT, { name: 'M', code: 'M1', discountRate: '1.0' }),
    ).rejects.toThrow(/< 1/);
  });

  it('rejects negative discount rate', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(
      service.create(TENANT, { name: 'M', code: 'M1', discountRate: '-0.01' }),
    ).rejects.toThrow(/non-negative/);
  });

  it('rejects duplicate code in the same tenant', async () => {
    const prisma = makePrisma({
      existing: { id: 'm-existing', code: 'M1', tenantId: TENANT },
    });
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(
      service.create(TENANT, { name: 'M', code: 'M1', discountRate: '0.025' }),
    ).rejects.toThrow(/already exists/);
  });

  it('creates a pending merchant with the configured discount rate', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    const created = await service.create(TENANT, {
      name: 'Acme',
      code: 'ACME',
      discountRate: '0.025',
      settlementType: SettlementType.IMMEDIATE,
    });

    expect(prisma.merchant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          status: MerchantStatus.pending,
          settlementType: SettlementType.IMMEDIATE,
          discountRate: '0.025',
        }),
      }),
    );
    expect(created.code).toBe('ACME');
  });

  it('defaults to T_PLUS_1 when settlementType is not supplied', async () => {
    const prisma = makePrisma();
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await service.create(TENANT, {
      name: 'Acme',
      code: 'ACME',
      discountRate: '0.025',
    });

    expect(prisma.merchant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ settlementType: SettlementType.T_PLUS_1 }),
      }),
    );
  });
});

describe('MerchantService.activate / suspend / reactivate / deactivate', () => {
  it('activates a pending merchant and sets onboardedAt', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          tenantId: TENANT,
          status: MerchantStatus.pending,
        }),
        update: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...args.data })),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await service.activate(TENANT, MERCHANT_ID);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: MERCHANT_ID },
      data: expect.objectContaining({
        status: MerchantStatus.active,
        onboardedAt: expect.any(Date),
      }),
    });
  });

  it('rejects activating a suspended merchant', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          tenantId: TENANT,
          status: MerchantStatus.suspended,
        }),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(service.activate(TENANT, MERCHANT_ID)).rejects.toThrow(
      /only pending is allowed/,
    );
  });

  it('suspends an active merchant and records the reason in metadata', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          tenantId: TENANT,
          status: MerchantStatus.active,
          metadata: { existing: 'value' },
        }),
        update: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...args.data })),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await service.suspend(TENANT, MERCHANT_ID, 'fraud_alert');

    const updateCall = prisma.merchant.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe(MerchantStatus.suspended);
    expect(updateCall.data.metadata).toMatchObject({
      existing: 'value',
      suspensionReason: 'fraud_alert',
    });
  });

  it('reactivates a suspended merchant', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          tenantId: TENANT,
          status: MerchantStatus.suspended,
        }),
        update: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...args.data })),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await service.reactivate(TENANT, MERCHANT_ID);

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: MERCHANT_ID },
      data: { status: MerchantStatus.active },
    });
  });

  it('soft-deletes on deactivate when no in-flight transactions remain', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          tenantId: TENANT,
          status: MerchantStatus.active,
        }),
        update: jest.fn(async (args: any) => ({ id: MERCHANT_ID, ...args.data })),
      },
      bnplTransaction: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await service.deactivate(TENANT, MERCHANT_ID);

    const args = prisma.merchant.update.mock.calls[0][0];
    expect(args.data.status).toBe(MerchantStatus.deactivated);
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it('FIX 22: refuses to deactivate when active BNPL transactions remain', async () => {
    const prisma = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: MERCHANT_ID,
          code: 'ACME',
          tenantId: TENANT,
          status: MerchantStatus.active,
        }),
        update: jest.fn(),
      },
      bnplTransaction: { count: jest.fn().mockResolvedValue(3) },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    await expect(service.deactivate(TENANT, MERCHANT_ID)).rejects.toThrow(
      /3 active BNPL transaction/,
    );
    expect(prisma.merchant.update).not.toHaveBeenCalled();
  });
});

describe('MerchantService.list', () => {
  it('returns items + null cursor when within page size', async () => {
    const prisma = {
      merchant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', code: 'A' },
          { id: 'b', code: 'B' },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    const out = await service.list(TENANT, {}, 20);

    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBeNull();
    // FIX 11: totalCount is the real count, not the slice length.
    expect(out.totalCount).toBe(2);
  });

  it('emits a cursor when results exceed page size', async () => {
    const prisma = {
      merchant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new MerchantService(
      prisma as any,
      // S14-10: QuotaEnforcementService stub — no-op for these tests.
      { checkEntityLimit: jest.fn(async () => undefined) } as any,
    );

    const out = await service.list(TENANT, {}, 2);

    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBeTruthy();
  });
});
