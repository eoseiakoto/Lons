import { PrismaService } from '@lons/database';

import { PipelineRetryWorker, PipelineRetryJobData } from './pipeline-retry.worker';
import { PipelineRetryService } from './pipeline-retry.service';
import { PipelineStepLoggerService } from './pipeline-step-logger.service';
import { PipelineStep } from './pipeline-step-registry';

/**
 * S18-12 worker tests. We bypass the NestJS DI container and construct
 * the worker manually — WorkerHost's superclass needs a live BullMQ
 * connection otherwise, and these tests are about dispatch logic, not
 * queue wiring.
 */
describe('PipelineRetryWorker', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const loanRequestId = '22222222-2222-2222-2222-222222222222';

  let prisma: any;
  let retryService: jest.Mocked<PipelineRetryService>;
  let logger: jest.Mocked<PipelineStepLoggerService>;
  let scoringService: any;
  let preQualService: any;
  let approvalService: any;
  let offerService: any;
  let contractService: any;
  let disbursementService: any;

  const makeWorker = () =>
    new PipelineRetryWorker(
      prisma,
      retryService,
      logger,
      preQualService,
      scoringService,
      approvalService,
      offerService,
      contractService,
      disbursementService,
    );

  const makeJob = (
    overrides: Partial<PipelineRetryJobData> = {},
  ): { data: PipelineRetryJobData } => ({
    data: {
      tenantId,
      loanRequestId,
      step: PipelineStep.SCORING,
      attempt: 1,
      maxRetries: 3,
      errorCode: 'SCORING_TIMEOUT',
      errorMessage: 'timed out',
      ...overrides,
    },
  });

  beforeEach(() => {
    prisma = {
      loanRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: loanRequestId,
          status: 'scored',
        }),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: loanRequestId,
          tenantId,
          customerId: 'cust-1',
          productId: 'prod-1',
          requestedAmount: '5000.0000',
          contract: { id: 'contract-1' },
        }),
      },
    };
    retryService = {
      handleStepFailure: jest.fn().mockResolvedValue({ willRetry: false }),
    } as any;
    logger = {
      logStep: jest.fn().mockResolvedValue({ id: 'log-1' }),
    } as any;
    scoringService = { scoreCustomer: jest.fn().mockResolvedValue({}) };
    preQualService = { evaluate: jest.fn().mockResolvedValue({}) };
    approvalService = { makeDecision: jest.fn().mockResolvedValue({}) };
    offerService = { generateOffer: jest.fn().mockResolvedValue({}) };
    contractService = {
      createFromAcceptedRequest: jest.fn().mockResolvedValue({}),
    };
    disbursementService = {
      initiateDisbursement: jest.fn().mockResolvedValue({}),
    };
  });

  describe('terminal-state skip', () => {
    it('returns silently when loan request is cancelled', async () => {
      prisma.loanRequest.findFirst.mockResolvedValue({
        id: loanRequestId,
        status: 'cancelled',
      });
      await makeWorker().process(makeJob() as any);
      expect(scoringService.scoreCustomer).not.toHaveBeenCalled();
    });
    it('returns silently when loan request is rejected', async () => {
      prisma.loanRequest.findFirst.mockResolvedValue({
        id: loanRequestId,
        status: 'rejected',
      });
      await makeWorker().process(makeJob() as any);
      expect(scoringService.scoreCustomer).not.toHaveBeenCalled();
    });
    it('returns silently when loan request is disbursed', async () => {
      prisma.loanRequest.findFirst.mockResolvedValue({
        id: loanRequestId,
        status: 'disbursed',
      });
      await makeWorker().process(makeJob() as any);
      expect(scoringService.scoreCustomer).not.toHaveBeenCalled();
    });
    it('returns silently when loan request not found', async () => {
      prisma.loanRequest.findFirst.mockResolvedValue(null);
      await makeWorker().process(makeJob() as any);
      expect(scoringService.scoreCustomer).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('invokes ScoringService for SCORING step', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.SCORING }) as any,
      );
      expect(scoringService.scoreCustomer).toHaveBeenCalledWith(
        tenantId,
        'cust-1',
        'prod-1',
        'application',
        '5000.0000',
      );
    });

    it('invokes PreQualificationService.evaluate for PRE_QUALIFICATION', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.PRE_QUALIFICATION }) as any,
      );
      expect(preQualService.evaluate).toHaveBeenCalledWith(
        tenantId,
        'cust-1',
        'prod-1',
        '5000.0000',
      );
    });

    it('invokes ApprovalService.makeDecision for APPROVAL', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.APPROVAL }) as any,
      );
      expect(approvalService.makeDecision).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
      );
    });

    it('invokes OfferService.generateOffer for OFFER_GENERATION', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.OFFER_GENERATION }) as any,
      );
      expect(offerService.generateOffer).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
      );
    });

    it('invokes ContractService.createFromAcceptedRequest for CONTRACT_CREATION', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.CONTRACT_CREATION }) as any,
      );
      expect(contractService.createFromAcceptedRequest).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
      );
    });

    it('invokes DisbursementService.initiateDisbursement for DISBURSEMENT', async () => {
      await makeWorker().process(
        makeJob({ step: PipelineStep.DISBURSEMENT }) as any,
      );
      expect(disbursementService.initiateDisbursement).toHaveBeenCalledWith(
        tenantId,
        'contract-1',
      );
    });
  });

  describe('success logging', () => {
    it('writes a {step}_retry success log on success', async () => {
      await makeWorker().process(makeJob() as any);
      expect(logger.logStep).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        expect.objectContaining({
          stepName: 'scoring_retry',
          outcome: 'success',
        }),
      );
    });
  });

  describe('failure feedback loop', () => {
    it('feeds failures back to handleStepFailure with the same attempt count', async () => {
      scoringService.scoreCustomer.mockRejectedValue(
        Object.assign(new Error('still down'), { code: 'SCORING_TIMEOUT' }),
      );
      await makeWorker().process(makeJob({ attempt: 1 }) as any);
      expect(retryService.handleStepFailure).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        PipelineStep.SCORING,
        { code: 'SCORING_TIMEOUT', message: 'still down' },
        1,
      );
    });
  });
});
