import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, DisbursementStatus, LoanRequestStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { DisbursementService } from './disbursement.service';
import { WALLET_ADAPTER } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE } from './screening-gate.interface';
import { MockWalletAdapter } from './adapters/mock-wallet.adapter';
import { LoanRequestService } from '../loan-request/loan-request.service';
import { CoolingOffService } from '../cooling-off/cooling-off.service';

describe('DisbursementService', () => {
  let service: DisbursementService;
  let prisma: PrismaService;
  let eventBus: EventBusService;
  let walletAdapter: MockWalletAdapter;
  let loanRequestService: LoanRequestService;

  const tenantId = 'tenant-123';
  const contractId = 'contract-123';
  const customerId = 'customer-123';
  const loanRequestId = 'loan-request-123';

  const mockContract = {
    id: contractId,
    tenantId,
    customerId,
    contractNumber: 'LON-2026-00001',
    principalAmount: { toString: () => '5000.0000' } as any,
    currency: 'GHS',
    customer: {
      phonePrimary: '+233245678901',
      externalId: 'cust-001',
    },
  };

  const mockDisbursement = {
    id: 'disb-123',
    tenantId,
    contractId,
    customerId,
    amount: { toString: () => '5000.0000' } as any,
    currency: 'GHS',
    status: DisbursementStatus.pending,
    retryCount: 0,
    destination: '+233245678901',
    externalRef: null,
    failureReason: null,
    completedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisbursementService,
        {
          provide: PrismaService,
          useValue: {
            contract: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            disbursement: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findUniqueOrThrow: jest.fn(),
              update: jest.fn(),
            },
            loanRequest: {
              findFirst: jest.fn(),
            },
            subscription: {
              findUnique: jest.fn(),
              update: jest.fn(),
              // S18 code-review fix B2 — atomic Prisma { increment }
              // restore in S18-8 rollback uses updateMany.
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          },
        },
        {
          provide: EventBusService,
          useValue: {
            emitAndBuild: jest.fn(),
          },
        },
        {
          provide: WALLET_ADAPTER,
          useClass: MockWalletAdapter,
        },
        {
          provide: LoanRequestService,
          useValue: {
            transitionStatus: jest.fn(),
          },
        },
        {
          provide: CoolingOffService,
          useValue: {
            activateCoolingOff: jest.fn(),
          },
        },
        {
          provide: SCREENING_GATE,
          useValue: {
            screenCustomer: jest.fn().mockResolvedValue({ status: 'CLEAR', screeningId: 'mock-screening-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<DisbursementService>(DisbursementService);
    prisma = module.get<PrismaService>(PrismaService);
    eventBus = module.get<EventBusService>(EventBusService);
    walletAdapter = module.get<MockWalletAdapter>(WALLET_ADAPTER);
    loanRequestService = module.get<LoanRequestService>(LoanRequestService);
  });

  describe('initiateDisbursement', () => {
    it('should create disbursement record and start transfer process', async () => {
      walletAdapter.setSuccessRate(1.0);

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      expect(prisma.contract.findFirst).toHaveBeenCalledWith({
        where: { id: contractId, tenantId },
        include: { customer: true },
      });
      expect(prisma.disbursement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          amount: mockContract.principalAmount,
          currency: 'GHS',
          channel: 'wallet',
        }),
      });
    });

    it('should transition loan request to DISBURSING status', async () => {
      walletAdapter.setSuccessRate(1.0);

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      expect(loanRequestService.transitionStatus).toHaveBeenCalled();
    });

    it('should throw NotFoundError if contract not found', async () => {
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(null);

      await expect(service.initiateDisbursement(tenantId, contractId)).rejects.toThrow('Contract');
    });
  });

  describe('Mock Wallet Adapter - Probability Distribution', () => {
    let adapter: MockWalletAdapter;

    beforeEach(() => {
      adapter = new MockWalletAdapter();
    });

    it('should simulate success with 80% probability', async () => {
      adapter.setSuccessRate(0.8);

      let successCount = 0;
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const result = await adapter.transfer({
          destination: `+233${i}`,
          amount: '1000.0000',
          currency: 'GHS',
          reference: `ref-${i}`,
        });
        if (result.success) successCount++;
      }

      // Allow wider variance with fewer iterations
      const successRate = successCount / iterations;
      expect(successRate).toBeGreaterThan(0.5);
      expect(successRate).toBeLessThan(1.0);
    }, 15000);

    it('should simulate pending transactions that eventually complete', async () => {
      adapter.setSuccessRate(0.0); // 100% failure
      adapter.setSuccessRate(0.1); // 10% immediate success

      const result1 = await adapter.transfer({
        destination: '+233123456789',
        amount: '1000.0000',
        currency: 'GHS',
        reference: 'test-pending',
      });

      if (!result1.success && result1.failureReason?.includes('pending')) {
        // Check status to simulate resolution
        const statusResult = await adapter.getTransactionStatus(result1.failureReason.split(' ')[1] || 'unknown');
        // Status might show pending or completed depending on simulation
        expect(['pending', 'completed']).toContain(statusResult.status);
      }
    });

    it('should have realistic delays', async () => {
      adapter.setSuccessRate(1.0); // Always succeed

      const startTime = Date.now();
      await adapter.transfer({
        destination: '+233123456789',
        amount: '1000.0000',
        currency: 'GHS',
        reference: 'test-delay',
      });
      const elapsed = Date.now() - startTime;

      // Mock adapter uses ~100ms simulated delay
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    /** Helper: mock findUniqueOrThrow to return incrementing retryCount on each call */
    const mockIncrementingRetryCount = () => {
      let callCount = 0;
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockImplementation((() => {
        const result = { ...mockDisbursement, retryCount: callCount };
        callCount++;
        return Promise.resolve(result);
      }) as any);
    };

    it('should retry failed disbursement with exponential delays', async () => {
      walletAdapter.setSuccessRate(0.0); // Always fail

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      mockIncrementingRetryCount();
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      expect(prisma.disbursement.update).toHaveBeenCalled();
    }, 15000);

    it('should emit DISBURSEMENT_COMPLETED event on success', async () => {
      walletAdapter.setSuccessRate(1.0); // Always succeed

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      // Event should be emitted
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.DISBURSEMENT_COMPLETED,
        tenantId,
        expect.objectContaining({
          disbursementId: mockDisbursement.id,
          contractId,
        }),
      );
    });

    it('should emit DISBURSEMENT_FAILED event after max retries exceeded', async () => {
      walletAdapter.setSuccessRate(0.0); // Always fail

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      mockIncrementingRetryCount();
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      // After max retries, failure event should be emitted
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.DISBURSEMENT_FAILED,
        tenantId,
        expect.objectContaining({
          disbursementId: mockDisbursement.id,
          contractId,
        }),
      );
    }, 15000);
  });

  describe('Contract Status Updates', () => {
    it('should update contract status to DISBURSED on success', async () => {
      walletAdapter.setSuccessRate(1.0);

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);

      await service.initiateDisbursement(tenantId, contractId);

      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: contractId },
        data: expect.objectContaining({
          status: 'performing',
        }),
      });
    });

    it('should update contract status to CANCELLED on permanent failure', async () => {
      walletAdapter.setSuccessRate(0.0);

      let retryCall = 0;
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockImplementation((() => {
        const result = { ...mockDisbursement, retryCount: retryCall };
        retryCall++;
        return Promise.resolve(result);
      }) as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      // DISBURSEMENT_FAILED event should be emitted after max retries
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.DISBURSEMENT_FAILED,
        tenantId,
        expect.objectContaining({ contractId }),
      );
    }, 15000);
  });

  describe('Loan Request Status Transitions', () => {
    it('should transition loan request from DISBURSING to DISBURSED on success', async () => {
      walletAdapter.setSuccessRate(1.0);

      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);

      await service.initiateDisbursement(tenantId, contractId);

      expect(loanRequestService.transitionStatus).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        LoanRequestStatus.disbursed,
      );
    });

    it('should transition loan request to DISBURSEMENT_FAILED on permanent failure', async () => {
      walletAdapter.setSuccessRate(0.0);

      let retryCall = 0;
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockImplementation((() => {
        const result = { ...mockDisbursement, retryCount: retryCall };
        retryCall++;
        return Promise.resolve(result);
      }) as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();

      await service.initiateDisbursement(tenantId, contractId);

      // Verify transition to DISBURSEMENT_FAILED
      expect(loanRequestService.transitionStatus).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        LoanRequestStatus.disbursement_failed,
      );
    }, 15000);
  });

  // ─────────────────────────────────────────────────────────────────
  // Sprint 18 — S18-8 (FR-DB-002.3): permanent disbursement failure
  // rolls the contract back to CANCELLED and restores the
  // subscription's available limit for revolving products.
  // ─────────────────────────────────────────────────────────────────
  describe('S18-8: permanent failure contract rollback', () => {
    const setupPermanentFailure = (
      contractOverrides: any = {},
    ) => {
      walletAdapter.setSuccessRate(0.0);
      let retryCall = 0;
      jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
      jest.spyOn(prisma.contract, 'findUnique').mockResolvedValue({
        id: contractId,
        status: 'active',
        metadata: null,
        customerId,
        productId: 'prod-1',
        principalAmount: { toString: () => '5000.0000' } as any,
        ...contractOverrides,
      } as any);
      jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
      jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
      jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockImplementation((() => {
        const result = { ...mockDisbursement, retryCount: retryCall };
        retryCall++;
        return Promise.resolve(result);
      }) as any);
      jest.spyOn(prisma.disbursement, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.contract, 'update').mockResolvedValue({} as any);
      jest.spyOn(loanRequestService, 'transitionStatus').mockResolvedValue({} as any);
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation();
      jest.spyOn((prisma as any).subscription, 'findUnique').mockResolvedValue(null);
      jest.spyOn((prisma as any).subscription, 'update').mockResolvedValue({} as any);
    };

    it('updates contract.status to cancelled on permanent failure', async () => {
      setupPermanentFailure();
      await service.initiateDisbursement(tenantId, contractId);
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: contractId },
        data: expect.objectContaining({
          status: 'cancelled',
          metadata: expect.objectContaining({
            cancellationReason: 'disbursement_failed',
            cancellationDetails: expect.objectContaining({
              disbursementId: mockDisbursement.id,
              retryCount: expect.any(Number),
            }),
          }),
        }),
      });
    }, 15000);

    it('emits CONTRACT_STATE_CHANGED with newStatus=cancelled', async () => {
      setupPermanentFailure();
      await service.initiateDisbursement(tenantId, contractId);
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.CONTRACT_STATE_CHANGED,
        tenantId,
        expect.objectContaining({
          contractId,
          previousStatus: 'active',
          newStatus: 'cancelled',
          reason: 'disbursement_failed',
        }),
      );
    }, 15000);

    it('DISBURSEMENT_FAILED event carries contractRolledBack=true', async () => {
      setupPermanentFailure();
      await service.initiateDisbursement(tenantId, contractId);
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.DISBURSEMENT_FAILED,
        tenantId,
        expect.objectContaining({
          contractId,
          contractRolledBack: true,
        }),
      );
    }, 15000);

    it('restores subscription.availableLimit atomically via Prisma { increment }', async () => {
      // S18 code-review fix B2 — restoration is now an atomic
      // updateMany with `{ increment }`. The where clause uses the
      // composite (tenantId, customerId, productId) + a non-null
      // availableLimit guard, so we no longer need a findUnique +
      // app-side add().
      setupPermanentFailure();
      const updateManyMock = jest
        .spyOn((prisma as any).subscription, 'updateMany')
        .mockResolvedValue({ count: 1 } as any);

      await service.initiateDisbursement(tenantId, contractId);

      expect(updateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            availableLimit: { not: null },
          }),
          data: expect.objectContaining({
            availableLimit: { increment: expect.anything() },
          }),
        }),
      );
    }, 15000);

    it('S18-FIX-3: decrements plan-tier quota counter on permanent failure', async () => {
      // The base test harness omits QuotaTrackingService (it's
      // @Optional). For this test we attach a mock directly to the
      // private field so the rollback path's quotaTrackingService?.
      // decrementDisbursement call lands. The unguarded mode (no
      // quotaTrackingService injected) is implicitly tested by every
      // other rollback test in this describe block — they all pass,
      // proving the @Optional? guard works.
      const decrement = jest.fn().mockResolvedValue(undefined);
      (service as unknown as Record<string, unknown>).quotaTrackingService = {
        decrementDisbursement: decrement,
        // Quota check at the top of initiateDisbursement reads `.allowed`
        // on the resolved value; default jest.fn() returns undefined,
        // which would throw before the rollback path runs.
        incrementDisbursement: jest
          .fn()
          .mockResolvedValue({ allowed: true, currentCount: 0 }),
        getCurrentUsage: jest.fn(),
      };
      jest.spyOn((prisma as any).subscription, 'updateMany').mockResolvedValue({ count: 1 } as any);

      setupPermanentFailure();
      await service.initiateDisbursement(tenantId, contractId);

      expect(decrement).toHaveBeenCalledTimes(1);
      // Pre-fix, the rollback only restored subscription.availableLimit
      // and the Redis quota counter stayed inflated by the failed
      // attempt's count + volume. The decrement reverses both.
      expect(decrement).toHaveBeenCalledWith(tenantId, '5000.0000');
    }, 15000);

    it('does NOT roll back when contract is already performing (partial disbursement)', async () => {
      setupPermanentFailure({ status: 'performing' });
      await service.initiateDisbursement(tenantId, contractId);
      // Contract update with cancelled status must not have been called.
      const updateCalls = (prisma.contract.update as jest.Mock).mock.calls;
      const cancelledCall = updateCalls.find(
        ([arg]) => arg?.data?.status === 'cancelled',
      );
      expect(cancelledCall).toBeUndefined();
      // DISBURSEMENT_FAILED still emitted but contractRolledBack=false.
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.DISBURSEMENT_FAILED,
        tenantId,
        expect.objectContaining({
          contractRolledBack: false,
        }),
      );
    }, 15000);
  });
});
