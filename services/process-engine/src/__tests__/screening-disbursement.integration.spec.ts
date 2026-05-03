import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, DisbursementStatus, LoanRequestStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { DisbursementService } from '../disbursement/disbursement.service';
import { WALLET_ADAPTER } from '../disbursement/adapters/wallet-adapter.interface';
import { SCREENING_GATE } from '../disbursement/screening-gate.interface';
import { LoanRequestService } from '../loan-request/loan-request.service';
import { CoolingOffService } from '../cooling-off/cooling-off.service';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const tenantId = 'tenant-screen-001';
const contractId = 'contract-screen-001';
const customerId = 'customer-screen-001';
const loanRequestId = 'lr-screen-001';
const screeningId = 'screening-001';

const mockContract = {
  id: contractId,
  tenantId,
  customerId,
  contractNumber: 'LON-2026-00100',
  principalAmount: { toString: () => '5000.0000' } as any,
  currency: 'GHS',
  customer: {
    phonePrimary: '+233245678901',
    externalId: 'cust-ext-001',
  },
};

const mockDisbursement = {
  id: 'disb-screen-001',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Screening-Disbursement Integration', () => {
  let service: DisbursementService;
  let prisma: PrismaService;
  let eventBus: EventBusService;
  let screeningService: { screenCustomer: jest.Mock };
  let loanRequestService: { transitionStatus: jest.Mock };
  let walletAdapter: { transfer: jest.Mock; getTransactionStatus: jest.Mock };

  beforeEach(async () => {
    screeningService = {
      screenCustomer: jest.fn(),
    };

    walletAdapter = {
      transfer: jest.fn().mockResolvedValue({
        success: true,
        externalRef: 'ext-ref-001',
      }),
      getTransactionStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisbursementService,
        {
          provide: PrismaService,
          useValue: {
            contract: {
              findFirst: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            disbursement: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findUniqueOrThrow: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            loanRequest: {
              findFirst: jest.fn(),
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
          provide: SCREENING_GATE,
          useValue: screeningService,
        },
        {
          provide: WALLET_ADAPTER,
          useValue: walletAdapter,
        },
        {
          provide: LoanRequestService,
          useValue: {
            transitionStatus: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: CoolingOffService,
          useValue: {
            activateCoolingOff: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DisbursementService>(DisbursementService);
    prisma = module.get<PrismaService>(PrismaService);
    eventBus = module.get<EventBusService>(EventBusService);
    loanRequestService = module.get(LoanRequestService);
  });

  /**
   * Helper to set up the standard mocks shared by most tests.
   */
  function setupStandardMocks() {
    jest.spyOn(prisma.contract, 'findFirst').mockResolvedValue(mockContract as any);
    jest.spyOn(prisma.loanRequest, 'findFirst').mockResolvedValue({ id: loanRequestId } as any);
    jest.spyOn(prisma.disbursement, 'create').mockResolvedValue(mockDisbursement as any);
    jest.spyOn(prisma.disbursement, 'findUniqueOrThrow').mockResolvedValue(mockDisbursement as any);
  }

  // ─── Test 1: CLEAR screening → disbursement proceeds ───────────────

  it('should proceed with disbursement when screening returns CLEAR', async () => {
    setupStandardMocks();
    screeningService.screenCustomer.mockResolvedValue({
      status: 'CLEAR',
      screeningId,
      riskLevel: 'LOW',
      matches: [],
    });

    const result = await service.initiateDisbursement(tenantId, contractId);

    expect(screeningService.screenCustomer).toHaveBeenCalledWith(tenantId, customerId);
    expect(prisma.disbursement.create).toHaveBeenCalled();
    expect(walletAdapter.transfer).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  // ─── Test 2: MATCH → loan request rejected, error thrown ────────────

  it('should reject loan request and throw when screening returns MATCH', async () => {
    setupStandardMocks();
    screeningService.screenCustomer.mockResolvedValue({
      status: 'MATCH',
      screeningId,
      riskLevel: 'CRITICAL',
      matches: [{ matchId: 'm1', entityName: 'Sanctioned Person' }],
    });

    await expect(
      service.initiateDisbursement(tenantId, contractId),
    ).rejects.toThrow(/AML screening match/);

    expect(loanRequestService.transitionStatus).toHaveBeenCalledWith(
      tenantId,
      loanRequestId,
      LoanRequestStatus.rejected,
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.SCREENING_MATCH_FOUND,
      tenantId,
      expect.objectContaining({
        customerId,
        loanRequestId,
        screeningId,
      }),
    );
    // Disbursement should NOT have been created
    expect(prisma.disbursement.create).not.toHaveBeenCalled();
  });

  // ─── Test 3: POTENTIAL_MATCH → held for manual review ───────────────

  it('should hold loan request for manual review when screening returns POTENTIAL_MATCH', async () => {
    setupStandardMocks();
    screeningService.screenCustomer.mockResolvedValue({
      status: 'POTENTIAL_MATCH',
      screeningId,
      riskLevel: 'MEDIUM',
      matches: [{ matchId: 'm2', entityName: 'Similar Name' }],
    });

    const result = await service.initiateDisbursement(tenantId, contractId);

    expect(result).toEqual({ status: 'held_for_review', screeningId });
    expect(loanRequestService.transitionStatus).toHaveBeenCalledWith(
      tenantId,
      loanRequestId,
      LoanRequestStatus.manual_review,
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.SCREENING_MANUAL_REVIEW_REQUIRED,
      tenantId,
      expect.objectContaining({
        customerId,
        loanRequestId,
        screeningId,
      }),
    );
    // Disbursement should NOT have been created
    expect(prisma.disbursement.create).not.toHaveBeenCalled();
  });

  // ─── Test 4: ERROR → retry → still ERROR → held for review ─────────

  it('should hold for review when screening returns ERROR on both attempts', async () => {
    setupStandardMocks();
    const retryScreeningId = 'screening-retry-002';

    screeningService.screenCustomer
      .mockResolvedValueOnce({
        status: 'ERROR',
        screeningId,
        riskLevel: 'HIGH',
        matches: [],
      })
      .mockResolvedValueOnce({
        status: 'ERROR',
        screeningId: retryScreeningId,
        riskLevel: 'HIGH',
        matches: [],
      });

    const result = await service.initiateDisbursement(tenantId, contractId);

    expect(screeningService.screenCustomer).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: 'held_for_review', screeningId: retryScreeningId });
    expect(loanRequestService.transitionStatus).toHaveBeenCalledWith(
      tenantId,
      loanRequestId,
      LoanRequestStatus.manual_review,
    );
    expect(prisma.disbursement.create).not.toHaveBeenCalled();
  });

  // ─── Test 5: ERROR → retry → CLEAR → disbursement proceeds ─────────

  it('should proceed with disbursement when retry after ERROR returns CLEAR', async () => {
    setupStandardMocks();

    screeningService.screenCustomer
      .mockResolvedValueOnce({
        status: 'ERROR',
        screeningId,
        riskLevel: 'HIGH',
        matches: [],
      })
      .mockResolvedValueOnce({
        status: 'CLEAR',
        screeningId: 'screening-retry-clear',
        riskLevel: 'LOW',
        matches: [],
      });

    const result = await service.initiateDisbursement(tenantId, contractId);

    expect(screeningService.screenCustomer).toHaveBeenCalledTimes(2);
    // Disbursement should proceed after retry returned CLEAR
    expect(prisma.disbursement.create).toHaveBeenCalled();
    expect(walletAdapter.transfer).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  // ─── Test 6: Cached CLEAR → no new screening call ──────────────────

  it('should skip new screening when cached CLEAR result is returned', async () => {
    setupStandardMocks();

    // The ScreeningService internally caches results; the disbursement service
    // just calls screenCustomer and acts on the result.  A cached CLEAR from
    // the screening service looks the same as a fresh CLEAR.
    screeningService.screenCustomer.mockResolvedValue({
      status: 'CLEAR',
      screeningId: 'cached-screening-001',
      riskLevel: 'LOW',
      matches: [],
    });

    await service.initiateDisbursement(tenantId, contractId);

    // Only one call — the ScreeningService resolved from cache internally
    expect(screeningService.screenCustomer).toHaveBeenCalledTimes(1);
    expect(prisma.disbursement.create).toHaveBeenCalled();
    expect(walletAdapter.transfer).toHaveBeenCalled();
  });
});
