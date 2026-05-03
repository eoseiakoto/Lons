import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, ContractStatus, RepaymentScheduleStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { CoolingOffService } from '../cooling-off/cooling-off.service';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const tenantId = 'tenant-cool-001';
const contractId = 'contract-cool-001';
const customerId = 'customer-cool-001';
const productId = 'product-cool-001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cooling-Off Integration', () => {
  let service: CoolingOffService;
  let prisma: PrismaService;
  let eventBus: EventBusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoolingOffService,
        {
          provide: PrismaService,
          useValue: {
            contract: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            repaymentScheduleEntry: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitAndBuild: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CoolingOffService>(CoolingOffService);
    prisma = module.get<PrismaService>(PrismaService);
    eventBus = module.get<EventBusService>(EventBusService);
  });

  // ─── Test 1: coolingOffHours=48 → contract enters cooling_off ──────

  it('should activate cooling-off with 48-hour period and set coolingOffExpiresAt', async () => {
    const mockContract = {
      id: contractId,
      tenantId,
      customerId,
      productId,
      status: ContractStatus.active,
      metadata: null,
      product: {
        id: productId,
        coolingOffHours: 48,
        name: 'Micro Loan with Cooling Off',
      },
    };

    jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
    jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

    const beforeCall = Date.now();
    await service.activateCoolingOff(tenantId, contractId);
    const afterCall = Date.now();

    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: contractId },
      data: expect.objectContaining({
        status: ContractStatus.cooling_off,
        metadata: expect.objectContaining({
          coolingOffExpiresAt: expect.any(String),
        }),
      }),
    });

    // Verify the expiry is approximately 48 hours from now
    const updateCall = (prisma.contract.update as jest.Mock).mock.calls[0][0];
    const expiresAt = new Date(updateCall.data.metadata.coolingOffExpiresAt).getTime();
    const expectedMinMs = beforeCall + 48 * 60 * 60 * 1000;
    const expectedMaxMs = afterCall + 48 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedMinMs);
    expect(expiresAt).toBeLessThanOrEqual(expectedMaxMs);

    // Event emitted
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CONTRACT_COOLING_OFF_STARTED,
      tenantId,
      expect.objectContaining({
        contractId,
        customerId,
        coolingOffHours: 48,
        coolingOffExpiresAt: expect.any(String),
      }),
    );
  });

  // ─── Test 2: Cancel during cooling-off → cancelled + events ────────

  it('should cancel contract during active cooling-off period and emit events', async () => {
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
    const mockContract = {
      id: contractId,
      tenantId,
      customerId,
      productId,
      status: ContractStatus.cooling_off,
      metadata: {
        coolingOffExpiresAt: futureExpiry.toISOString(),
      },
    };

    jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
    jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.repaymentScheduleEntry, 'updateMany').mockResolvedValue({ count: 4 } as any);

    const result = await service.cancelDuringCoolingOff(
      tenantId,
      contractId,
      'Customer changed their mind',
      'idem-key-001',
    );

    expect(result.success).toBe(true);
    expect(result.contractId).toBe(contractId);
    expect(result.cancelledAt).toBeInstanceOf(Date);

    // Contract status updated to cancelled
    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: contractId },
        data: expect.objectContaining({
          status: ContractStatus.cancelled,
          metadata: expect.objectContaining({
            cancellationReason: 'COOLING_OFF_CANCELLATION',
            idempotencyKey: 'idem-key-001',
          }),
        }),
      }),
    );

    // Repayment schedule entries waived
    expect(prisma.repaymentScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: {
        contractId,
        tenantId,
        status: { in: [RepaymentScheduleStatus.pending, RepaymentScheduleStatus.partial] },
      },
      data: {
        status: RepaymentScheduleStatus.waived,
      },
    });

    // Outstanding amounts zeroed out
    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: contractId },
        data: expect.objectContaining({
          outstandingInterest: 0,
          outstandingFees: 0,
          outstandingPenalties: 0,
          outstandingPrincipal: 0,
          totalOutstanding: 0,
        }),
      }),
    );

    // Cancellation event emitted
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CONTRACT_COOLING_OFF_CANCELLED,
      tenantId,
      expect.objectContaining({
        contractId,
        customerId,
        reason: 'Customer changed their mind',
        idempotencyKey: 'idem-key-001',
      }),
    );
  });

  // ─── Test 3: coolingOffHours=0 → skips cooling-off (directly active) ─

  it('should skip cooling-off when product has coolingOffHours=0', async () => {
    const mockContract = {
      id: contractId,
      tenantId,
      customerId,
      productId,
      status: ContractStatus.active,
      metadata: null,
      product: {
        id: productId,
        coolingOffHours: 0,
        name: 'No Cooling Off Product',
      },
    };

    jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);

    await service.activateCoolingOff(tenantId, contractId);

    // Contract should NOT be updated — no cooling-off transition
    expect(prisma.contract.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  // ─── Test 4: Cancel after expiry → error ───────────────────────────

  it('should return error when trying to cancel after cooling-off period has expired', async () => {
    const pastExpiry = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
    const mockContract = {
      id: contractId,
      tenantId,
      customerId,
      productId,
      status: ContractStatus.cooling_off,
      metadata: {
        coolingOffExpiresAt: pastExpiry.toISOString(),
      },
    };

    jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);

    const result = await service.cancelDuringCoolingOff(tenantId, contractId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cooling-off period has expired');
    expect(prisma.contract.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  // ─── Test 5: expireCoolingOffContracts → transitions expired to active

  it('should transition expired cooling-off contracts to active status', async () => {
    const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
    const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now

    const expiredContracts = [
      {
        id: 'contract-expired-1',
        tenantId,
        customerId: 'cust-1',
        metadata: { coolingOffExpiresAt: pastDate.toISOString() },
      },
      {
        id: 'contract-expired-2',
        tenantId,
        customerId: 'cust-2',
        metadata: { coolingOffExpiresAt: pastDate.toISOString() },
      },
      {
        // This one is NOT expired — should be skipped
        id: 'contract-not-expired',
        tenantId,
        customerId: 'cust-3',
        metadata: { coolingOffExpiresAt: futureDate.toISOString() },
      },
    ];

    jest.spyOn(prisma.contract, 'findMany').mockResolvedValue(expiredContracts as any);
    jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

    const count = await service.expireCoolingOffContracts(tenantId);

    // Only 2 expired contracts should be transitioned
    expect(count).toBe(2);
    expect(prisma.contract.update).toHaveBeenCalledTimes(2);

    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contract-expired-1' },
        data: expect.objectContaining({
          status: ContractStatus.active,
        }),
      }),
    );
    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contract-expired-2' },
        data: expect.objectContaining({
          status: ContractStatus.active,
        }),
      }),
    );

    // Events emitted for each transitioned contract
    expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(2);
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CONTRACT_COOLING_OFF_EXPIRED,
      tenantId,
      expect.objectContaining({
        contractId: 'contract-expired-1',
        customerId: 'cust-1',
      }),
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CONTRACT_COOLING_OFF_EXPIRED,
      tenantId,
      expect.objectContaining({
        contractId: 'contract-expired-2',
        customerId: 'cust-2',
      }),
    );
  });
});
