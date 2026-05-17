import { LoanRequestStatus } from '@lons/database';
import { ValidationError } from '@lons/common';
import { ForbiddenException } from '@nestjs/common';

import { LoanRequestReviewService } from './loan-request-review.service';

/**
 * Unit-level tests for the S18-1 review flow. Mocks Prisma, the bus,
 * LoanRequestService and ApprovalLimitService so the suite runs without
 * a database.
 */
describe('LoanRequestReviewService', () => {
  const TENANT = '00000000-0000-0000-0000-000000000001';
  const OPERATOR = '00000000-0000-0000-0000-000000000002';
  const LR_ID = '00000000-0000-0000-0000-000000000003';

  type MockLR = {
    id: string;
    status: string;
    requestedAmount: string;
    metadata?: Record<string, unknown> | null;
    product: { minAmount?: string; maxAmount?: string; maxTenorDays?: number; type?: string };
  };

  function buildMocks(opts: { lr: MockLR; updateResult?: MockLR }) {
    const prisma = {
      loanRequest: {
        update: jest.fn().mockResolvedValue(opts.updateResult ?? opts.lr),
      },
    } as any;
    const eventBus = { emitAndBuild: jest.fn() } as any;
    const loanRequestService = {
      findById: jest.fn().mockResolvedValue(opts.lr),
      transitionStatus: jest.fn().mockResolvedValue({
        ...opts.lr,
        ...(opts.updateResult ?? {}),
      }),
    } as any;
    const approvalLimitService = {
      validateOperatorAction: jest.fn().mockResolvedValue(undefined),
      incrementDailyCount: jest.fn().mockResolvedValue(undefined),
    } as any;
    return { prisma, eventBus, loanRequestService, approvalLimitService };
  }

  function buildService(mocks: ReturnType<typeof buildMocks>) {
    return new LoanRequestReviewService(
      mocks.prisma,
      mocks.eventBus,
      mocks.loanRequestService,
      mocks.approvalLimitService,
    );
  }

  describe('approve', () => {
    it('approves a manual_review request and increments daily counter', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '5000', type: 'micro_loan' },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await svc.approve(TENANT, LR_ID, '1500', 30, OPERATOR);

      expect(mocks.approvalLimitService.validateOperatorAction).toHaveBeenCalledWith(
        TENANT,
        OPERATOR,
        'approve',
        lr,
      );
      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalledWith(
        TENANT,
        LR_ID,
        LoanRequestStatus.approved,
        expect.objectContaining({ approvedAmount: '1500', approvedTenor: 30 }),
      );
      expect(mocks.approvalLimitService.incrementDailyCount).toHaveBeenCalledWith(TENANT, OPERATOR);
    });

    it('approves an escalated request', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.escalated,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '5000' },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await svc.approve(TENANT, LR_ID, '900', 30, OPERATOR);
      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalledWith(
        TENANT,
        LR_ID,
        LoanRequestStatus.approved,
        expect.any(Object),
      );
    });

    it('rejects approve on a scored request', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.scored,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '5000' },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await expect(svc.approve(TENANT, LR_ID, '1000', 30, OPERATOR)).rejects.toThrow(
        ValidationError,
      );
    });

    it('clamps approvedAmount above product maxAmount', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '2000' },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await svc.approve(TENANT, LR_ID, '9999', 30, OPERATOR);

      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalledWith(
        TENANT,
        LR_ID,
        LoanRequestStatus.approved,
        expect.objectContaining({ approvedAmount: '2000' }),
      );
    });

    it('propagates ForbiddenException from approval limits', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '100000',
        product: { minAmount: '100', maxAmount: '999999' },
      };
      const mocks = buildMocks({ lr });
      mocks.approvalLimitService.validateOperatorAction.mockRejectedValueOnce(
        new ForbiddenException({ code: 'APPROVAL_LIMIT_EXCEEDED' }),
      );
      const svc = buildService(mocks);
      await expect(svc.approve(TENANT, LR_ID, '100000', 30, OPERATOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('works without ApprovalLimitService injected (backwards compat)', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '5000' },
      };
      const mocks = buildMocks({ lr });
      const svc = new LoanRequestReviewService(
        mocks.prisma,
        mocks.eventBus,
        mocks.loanRequestService,
      );
      await svc.approve(TENANT, LR_ID, '1000', 30, OPERATOR);
      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('rejects a manual_review request with structured reasons', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      const reasons = [{ code: 'POLICY_VIOLATION', message: 'Customer is on a watchlist' }];
      await svc.reject(TENANT, LR_ID, reasons, OPERATOR);

      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalledWith(
        TENANT,
        LR_ID,
        LoanRequestStatus.rejected,
        expect.objectContaining({ rejectionReasons: reasons }),
      );
    });

    it('requires at least one reason', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(svc.reject(TENANT, LR_ID, [], OPERATOR)).rejects.toThrow(ValidationError);
    });

    it('refuses to reject an approved request', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.approved,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(
        svc.reject(TENANT, LR_ID, [{ code: 'OTHER', message: 'oops' }], OPERATOR),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('escalate', () => {
    it('escalates manual_review to escalated and emits event', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await svc.escalate(TENANT, LR_ID, 'High exposure', null, OPERATOR);

      expect(mocks.loanRequestService.transitionStatus).toHaveBeenCalledWith(
        TENANT,
        LR_ID,
        LoanRequestStatus.escalated,
        expect.any(Object),
      );
      expect(mocks.eventBus.emitAndBuild).toHaveBeenCalledWith(
        'loan_request.escalated',
        TENANT,
        expect.objectContaining({ loanRequestId: LR_ID, escalatedBy: OPERATOR }),
      );
    });

    it('requires a reason', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(svc.escalate(TENANT, LR_ID, '   ', null, OPERATOR)).rejects.toThrow(
        ValidationError,
      );
    });

    it('refuses to escalate an already-escalated request', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.escalated,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(svc.escalate(TENANT, LR_ID, 'again', null, OPERATOR)).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('modifyTerms', () => {
    it('stores modifications on metadata and emits event', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { minAmount: '100', maxAmount: '5000', maxTenorDays: 60 },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);

      await svc.modifyTerms(
        TENANT,
        LR_ID,
        {
          adjustedAmount: '1500',
          adjustedTenor: 45,
          adjustedInterestRate: '14.5000',
          modificationReason: 'Lower amount due to risk',
        },
        OPERATOR,
      );

      expect(mocks.prisma.loanRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LR_ID },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              termModifications: expect.objectContaining({
                adjustedAmount: '1500',
                adjustedTenor: 45,
              }),
            }),
          }),
        }),
      );
      expect(mocks.eventBus.emitAndBuild).toHaveBeenCalledWith(
        'loan_request.terms_modified',
        TENANT,
        expect.objectContaining({ loanRequestId: LR_ID }),
      );
    });

    it('rejects adjustedAmount below product minimum', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { minAmount: '500', maxAmount: '5000' },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(
        svc.modifyTerms(
          TENANT,
          LR_ID,
          { adjustedAmount: '100', modificationReason: 'r' },
          OPERATOR,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects adjustedTenor above product maxTenorDays', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: { maxTenorDays: 30 },
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(
        svc.modifyTerms(
          TENANT,
          LR_ID,
          { adjustedTenor: 60, modificationReason: 'r' },
          OPERATOR,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('requires a reason', async () => {
      const lr: MockLR = {
        id: LR_ID,
        status: LoanRequestStatus.manual_review,
        requestedAmount: '1000',
        product: {},
      };
      const mocks = buildMocks({ lr });
      const svc = buildService(mocks);
      await expect(
        svc.modifyTerms(TENANT, LR_ID, { modificationReason: '' }, OPERATOR),
      ).rejects.toThrow(ValidationError);
    });
  });
});
