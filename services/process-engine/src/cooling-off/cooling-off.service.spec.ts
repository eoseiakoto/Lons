import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, ContractStatus, RepaymentScheduleStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { AuditService } from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

import { CoolingOffService } from './cooling-off.service';

describe('CoolingOffService', () => {
  let service: CoolingOffService;
  let prisma: PrismaService;
  let eventBus: EventBusService;

  const tenantId = 'tenant-123';
  const contractId = 'contract-123';
  const customerId = 'customer-123';
  const productId = 'product-123';

  const mockProduct = {
    id: productId,
    coolingOffHours: 48,
    name: 'Test Product',
  };

  const mockProductNoCooling = {
    id: productId,
    coolingOffHours: 0,
    name: 'Test Product No Cooling',
  };

  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  const mockContractWithProduct = {
    id: contractId,
    tenantId,
    customerId,
    productId,
    status: ContractStatus.active,
    metadata: null,
    product: mockProduct,
  };

  const mockContractCoolingOff = {
    id: contractId,
    tenantId,
    customerId,
    productId,
    status: ContractStatus.cooling_off,
    metadata: {
      coolingOffExpiresAt: futureDate.toISOString(),
    },
  };

  const mockContractCoolingOffExpired = {
    id: contractId,
    tenantId,
    customerId,
    productId,
    status: ContractStatus.cooling_off,
    metadata: {
      coolingOffExpiresAt: pastDate.toISOString(),
    },
  };

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
              update: jest.fn(),
            },
            repaymentScheduleEntry: {
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitAndBuild: jest.fn(),
          },
        },
        // S13B-1: AuditService stub for system-actor audit entries written
        // when cooling-off contracts auto-transition to active.
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CoolingOffService>(CoolingOffService);
    prisma = module.get<PrismaService>(PrismaService);
    eventBus = module.get<EventBusService>(EventBusService);
  });

  describe('activateCoolingOff', () => {
    it('should activate cooling-off when product has coolingOffHours > 0', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContractWithProduct as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

      await service.activateCoolingOff(tenantId, contractId);

      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: contractId },
        data: expect.objectContaining({
          status: ContractStatus.cooling_off,
          metadata: expect.objectContaining({
            coolingOffExpiresAt: expect.any(String),
          }),
        }),
      });

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

    it('should skip activation when product has coolingOffHours === 0', async () => {
      const contractNoCooling = {
        ...mockContractWithProduct,
        product: mockProductNoCooling,
      };
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(contractNoCooling as any);

      await service.activateCoolingOff(tenantId, contractId);

      expect(prisma.contract.update).not.toHaveBeenCalled();
      expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when contract does not exist', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(null);

      await expect(service.activateCoolingOff(tenantId, contractId)).rejects.toThrow('Contract');
    });

    it('should preserve existing metadata when activating cooling-off', async () => {
      const contractWithMetadata = {
        ...mockContractWithProduct,
        metadata: { someExistingField: 'value' },
      };
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(contractWithMetadata as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

      await service.activateCoolingOff(tenantId, contractId);

      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: contractId },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            someExistingField: 'value',
            coolingOffExpiresAt: expect.any(String),
          }),
        }),
      });
    });
  });

  describe('cancelDuringCoolingOff', () => {
    it('should cancel contract during valid cooling-off period', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContractCoolingOff as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.repaymentScheduleEntry, 'updateMany').mockResolvedValue({ count: 3 } as any);

      const result = await service.cancelDuringCoolingOff(tenantId, contractId, 'Changed my mind', 'idem-123');

      expect(result.success).toBe(true);
      expect(result.contractId).toBe(contractId);
      expect(result.cancelledAt).toBeInstanceOf(Date);

      // Should update contract to cancelled
      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: contractId },
          data: expect.objectContaining({
            status: ContractStatus.cancelled,
          }),
        }),
      );

      // Should cancel repayment schedule entries
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

      // Should zero out outstanding amounts
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

      // Should emit event
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.CONTRACT_COOLING_OFF_CANCELLED,
        tenantId,
        expect.objectContaining({
          contractId,
          customerId,
          reason: 'Changed my mind',
          idempotencyKey: 'idem-123',
        }),
      );
    });

    it('should return error when contract is not found', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(null);

      const result = await service.cancelDuringCoolingOff(tenantId, contractId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Contract not found');
    });

    it('should return error when contract is not in cooling-off status', async () => {
      const activeContract = {
        ...mockContractCoolingOff,
        status: ContractStatus.active,
      };
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(activeContract as any);

      const result = await service.cancelDuringCoolingOff(tenantId, contractId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in cooling-off period');
    });

    it('should return error when cooling-off period has expired', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContractCoolingOffExpired as any);

      const result = await service.cancelDuringCoolingOff(tenantId, contractId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cooling-off period has expired');
    });

    it('should return error when metadata has no coolingOffExpiresAt', async () => {
      const contractNoExpiry = {
        ...mockContractCoolingOff,
        metadata: {},
      };
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(contractNoExpiry as any);

      const result = await service.cancelDuringCoolingOff(tenantId, contractId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cooling-off period has expired');
    });
  });

  describe('expireCoolingOffContracts', () => {
    it('should transition expired cooling-off contracts to active', async () => {
      const expiredContracts = [
        {
          id: 'contract-1',
          tenantId,
          customerId: 'cust-1',
          metadata: { coolingOffExpiresAt: pastDate.toISOString() },
        },
        {
          id: 'contract-2',
          tenantId,
          customerId: 'cust-2',
          metadata: { coolingOffExpiresAt: pastDate.toISOString() },
        },
      ];

      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue(expiredContracts as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

      const count = await service.expireCoolingOffContracts(tenantId);

      expect(count).toBe(2);
      expect(prisma.contract.update).toHaveBeenCalledTimes(2);

      // Each contract should be updated to active
      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contract-1' },
          data: expect.objectContaining({
            status: ContractStatus.active,
          }),
        }),
      );

      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contract-2' },
          data: expect.objectContaining({
            status: ContractStatus.active,
          }),
        }),
      );

      // Events should be emitted for each
      expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(2);
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.CONTRACT_COOLING_OFF_EXPIRED,
        tenantId,
        expect.objectContaining({
          contractId: 'contract-1',
          customerId: 'cust-1',
        }),
      );
    });

    it('should skip contracts whose cooling-off has not yet expired', async () => {
      const contracts = [
        {
          id: 'contract-not-expired',
          tenantId,
          customerId: 'cust-1',
          metadata: { coolingOffExpiresAt: futureDate.toISOString() },
        },
      ];

      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue(contracts as any);

      const count = await service.expireCoolingOffContracts(tenantId);

      expect(count).toBe(0);
      expect(prisma.contract.update).not.toHaveBeenCalled();
      expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should handle contracts without coolingOffExpiresAt in metadata', async () => {
      const contracts = [
        {
          id: 'contract-no-meta',
          tenantId,
          customerId: 'cust-1',
          metadata: {},
        },
        {
          id: 'contract-null-meta',
          tenantId,
          customerId: 'cust-2',
          metadata: null,
        },
      ];

      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue(contracts as any);

      const count = await service.expireCoolingOffContracts(tenantId);

      expect(count).toBe(0);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('should return 0 when no contracts are in cooling-off status', async () => {
      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue([]);

      const count = await service.expireCoolingOffContracts(tenantId);

      expect(count).toBe(0);
    });

    it('should work without tenantId filter (all tenants)', async () => {
      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue([]);

      await service.expireCoolingOffContracts();

      expect(prisma.contract.findMany).toHaveBeenCalledWith({
        where: { status: ContractStatus.cooling_off },
        select: {
          id: true,
          tenantId: true,
          customerId: true,
          metadata: true,
        },
      });
    });

    it('should continue processing remaining contracts if one fails', async () => {
      const contracts = [
        {
          id: 'contract-fail',
          tenantId,
          customerId: 'cust-1',
          metadata: { coolingOffExpiresAt: pastDate.toISOString() },
        },
        {
          id: 'contract-succeed',
          tenantId,
          customerId: 'cust-2',
          metadata: { coolingOffExpiresAt: pastDate.toISOString() },
        },
      ];

      jest.spyOn(prisma.contract, 'findMany').mockResolvedValue(contracts as any);
      jest.spyOn(prisma.contract, 'update')
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({} as any);

      const count = await service.expireCoolingOffContracts(tenantId);

      expect(count).toBe(1);
      expect(prisma.contract.update).toHaveBeenCalledTimes(2);
      expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(1);
    });
  });
});
