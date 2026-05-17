import { ContractStatus } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

import { ContractWriteOperationsService } from './contract-write-operations.service';

describe('ContractWriteOperationsService', () => {
  const TENANT = '00000000-0000-0000-0000-000000000001';
  const OPERATOR = '00000000-0000-0000-0000-000000000002';
  const CONTRACT_ID = '00000000-0000-0000-0000-000000000003';

  function buildContract(overrides: Partial<any> = {}) {
    return {
      id: CONTRACT_ID,
      tenantId: TENANT,
      status: ContractStatus.active,
      tenorDays: 30,
      interestRate: '12.0000',
      maturityDate: new Date('2026-06-01T00:00:00Z'),
      outstandingPenalties: '50.0000',
      totalOutstanding: '1050.0000',
      restructureCount: 0,
      metadata: {},
      ...overrides,
    };
  }

  function buildMocks(contract: any | null) {
    const prisma = {
      contract: {
        findFirst: jest.fn().mockResolvedValue(contract),
        update: jest.fn().mockImplementation(({ where: _w, data }) =>
          Promise.resolve({ ...contract, ...data }),
        ),
      },
    } as any;
    const eventBus = { emitAndBuild: jest.fn() } as any;
    const paymentService = {
      processPayment: jest.fn().mockResolvedValue({ id: 'rep-1' }),
    } as any;
    return { prisma, eventBus, paymentService };
  }

  function buildService(mocks: ReturnType<typeof buildMocks>) {
    return new ContractWriteOperationsService(
      mocks.prisma,
      mocks.eventBus,
      mocks.paymentService,
    );
  }

  describe('recordManualPayment', () => {
    it('delegates to PaymentService with manual source and idempotency key', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);

      const result = await svc.recordManualPayment(TENANT, CONTRACT_ID, {
        amount: '200',
        currency: 'GHS',
        paymentMethod: 'cash',
        paymentRef: 'CASH-123',
        operatorId: OPERATOR,
        // S18 code-review fix I2 — idempotencyKey is now required.
        idempotencyKey: 'idem-test-1',
      });

      expect(result).toEqual({ id: 'rep-1' });
      expect(mocks.paymentService.processPayment).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          amount: '200',
          source: 'manual',
          externalRef: 'CASH-123',
          idempotencyKey: 'idem-test-1',
        }),
      );
      expect(mocks.eventBus.emitAndBuild).toHaveBeenCalledWith(
        'repayment.received',
        TENANT,
        expect.objectContaining({ source: 'manual', operatorId: OPERATOR }),
      );
    });

    it('rejects zero or negative amounts', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.recordManualPayment(TENANT, CONTRACT_ID, {
          amount: '0',
          currency: 'GHS',
          paymentMethod: 'cash',
          paymentRef: 'CASH-1',
          operatorId: OPERATOR,
          idempotencyKey: 'idem-zero',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects missing paymentRef', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.recordManualPayment(TENANT, CONTRACT_ID, {
          amount: '100',
          currency: 'GHS',
          paymentMethod: 'cash',
          paymentRef: '',
          operatorId: OPERATOR,
          idempotencyKey: 'idem-no-ref',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects payment on settled contract', async () => {
      const mocks = buildMocks(buildContract({ status: ContractStatus.settled }));
      const svc = buildService(mocks);
      await expect(
        svc.recordManualPayment(TENANT, CONTRACT_ID, {
          amount: '100',
          currency: 'GHS',
          paymentMethod: 'cash',
          paymentRef: 'CASH-2',
          operatorId: OPERATOR,
          idempotencyKey: 'idem-settled',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFound for unknown contract', async () => {
      const mocks = buildMocks(null);
      const svc = buildService(mocks);
      await expect(
        svc.recordManualPayment(TENANT, CONTRACT_ID, {
          amount: '100',
          currency: 'GHS',
          paymentMethod: 'cash',
          paymentRef: 'CASH-3',
          operatorId: OPERATOR,
          idempotencyKey: 'idem-unknown',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('restructureContract', () => {
    it('updates contract, appends history, emits event', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);

      await svc.restructureContract(TENANT, CONTRACT_ID, {
        newTenorDays: 60,
        newInterestRate: '14.0000',
        restructureReason: 'customer hardship',
        operatorId: OPERATOR,
      });

      expect(mocks.prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONTRACT_ID },
          data: expect.objectContaining({
            tenorDays: 60,
            interestRate: '14.0000',
            restructured: true,
            restructureCount: 1,
          }),
        }),
      );
      expect(mocks.eventBus.emitAndBuild).toHaveBeenCalledWith(
        'contract.state_changed',
        TENANT,
        expect.objectContaining({ action: 'restructured' }),
      );
    });

    it('requires at least one term modified', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.restructureContract(TENANT, CONTRACT_ID, {
          restructureReason: 'r',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('requires non-empty reason', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.restructureContract(TENANT, CONTRACT_ID, {
          newTenorDays: 60,
          restructureReason: '',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects settled contract', async () => {
      const mocks = buildMocks(buildContract({ status: ContractStatus.settled }));
      const svc = buildService(mocks);
      await expect(
        svc.restructureContract(TENANT, CONTRACT_ID, {
          newTenorDays: 60,
          restructureReason: 'x',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects negative interest rate', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.restructureContract(TENANT, CONTRACT_ID, {
          newInterestRate: '-1',
          restructureReason: 'x',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('waivePenalties', () => {
    it('reduces outstandingPenalties + totalOutstanding by waiver amount', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);

      await svc.waivePenalties(TENANT, CONTRACT_ID, {
        waiverAmount: '20',
        waiverReason: 'goodwill',
        operatorId: OPERATOR,
      });

      expect(mocks.prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONTRACT_ID },
          data: expect.objectContaining({
            outstandingPenalties: '30.0000',
            totalOutstanding: '1030.0000',
          }),
        }),
      );
    });

    it('rejects waiver larger than outstanding penalties', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.waivePenalties(TENANT, CONTRACT_ID, {
          waiverAmount: '999',
          waiverReason: 'no',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects zero or negative waiver amount', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.waivePenalties(TENANT, CONTRACT_ID, {
          waiverAmount: '0',
          waiverReason: 'r',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('requires non-empty reason', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await expect(
        svc.waivePenalties(TENANT, CONTRACT_ID, {
          waiverAmount: '10',
          waiverReason: '',
          operatorId: OPERATOR,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('accepts partial waiver equal to outstanding', async () => {
      const mocks = buildMocks(buildContract());
      const svc = buildService(mocks);
      await svc.waivePenalties(TENANT, CONTRACT_ID, {
        waiverAmount: '50',
        waiverReason: 'full waiver',
        operatorId: OPERATOR,
      });
      expect(mocks.prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outstandingPenalties: '0.0000' }),
        }),
      );
    });
  });
});
