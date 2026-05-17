import { Injectable, Optional, Logger, Inject } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  ContractStatus,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  compare,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Structural contract for the `PaymentService.processPayment` method we
 * call. Declared inline (not imported from `@lons/repayment-service`) so
 * process-engine doesn't take a runtime dependency on repayment-service.
 * The composition root (graphql-server) wires the real PaymentService
 * instance; Nest's DI matches it structurally.
 */
export interface IPaymentServiceForManualPayment {
  processPayment(
    tenantId: string,
    input: {
      contractId: string;
      amount: string;
      currency: string;
      method: string;
      source?: string;
      externalRef?: string;
      idempotencyKey?: string;
    },
  ): Promise<{ id: string } & Record<string, unknown>>;
}

/**
 * Nest DI token for the optional payment service. The composition root
 * binds this to the real `PaymentService` from
 * `@lons/repayment-service` via:
 *
 *   { provide: PAYMENT_SERVICE_FOR_MANUAL_PAYMENT, useExisting: PaymentService }
 *
 * If unbound, manual payment mutations throw a clear error.
 */
export const PAYMENT_SERVICE_FOR_MANUAL_PAYMENT = Symbol(
  'PAYMENT_SERVICE_FOR_MANUAL_PAYMENT',
);

/**
 * Sprint 18 (S18-2 / FR-LO-003.2) — operator write operations on
 * active contracts.
 *
 * Three actions exposed to portal operators with the `contract:update`
 * permission:
 *
 *   - `recordManualPayment` — operator captures a payment received
 *     out-of-band (cash, wire, cheque). Delegates the waterfall +
 *     contract-state update to `PaymentService.processPayment` so the
 *     same ledger pathway used by adapter-driven repayments is reused.
 *   - `restructureContract` — change tenor, interest rate, or maturity.
 *     History is preserved on `metadata.restructureHistory`.
 *   - `waivePenalties` — partial or full forgiveness of accrued
 *     penalties. Reduces `outstandingPenalties` + `totalOutstanding`
 *     and records the waiver on `metadata.penaltyWaivers`.
 *
 * Multi-tenancy: every method takes an explicit `tenantId` and scopes
 * the contract lookup; RLS provides the safety net.
 *
 * Money: every amount in/out is a Decimal string. We use the shared
 * `add`/`subtract`/`compare` from `@lons/common` so float drift never
 * touches the ledger.
 */
@Injectable()
export class ContractWriteOperationsService {
  private readonly logger = new Logger(ContractWriteOperationsService.name);

  // Statuses where operator write operations are allowed. Closed,
  // settled, cancelled, written-off contracts are terminal.
  private static readonly ACTIONABLE_STATUSES: ContractStatus[] = [
    ContractStatus.active,
    ContractStatus.performing,
    ContractStatus.due,
    ContractStatus.overdue,
    ContractStatus.delinquent,
  ];

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    @Optional()
    @Inject(PAYMENT_SERVICE_FOR_MANUAL_PAYMENT)
    private paymentService?: IPaymentServiceForManualPayment,
  ) {}

  /**
   * Record a payment received out-of-band (cash, wire, etc.). Uses
   * `PaymentService.processPayment` for the actual waterfall + ledger
   * update so the result is indistinguishable from an adapter-driven
   * payment. The `paymentRef` doubles as the idempotency key so a
   * double-click from the operator portal returns the same repayment.
   */
  async recordManualPayment(
    tenantId: string,
    contractId: string,
    input: {
      amount: string;
      currency: string;
      paymentMethod: string;
      paymentRef: string;
      paymentDate?: Date;
      notes?: string;
      operatorId: string;
      idempotencyKey?: string;
    },
  ) {
    if (!input.amount || compare(input.amount, '0') <= 0) {
      throw new ValidationError('Manual payment amount must be greater than zero');
    }
    if (!input.paymentRef || input.paymentRef.trim().length === 0) {
      throw new ValidationError('Payment reference is required for manual payments');
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);
    if (!ContractWriteOperationsService.ACTIONABLE_STATUSES.includes(contract.status)) {
      throw new ValidationError(
        `Contract status ${contract.status} does not accept manual payments`,
      );
    }

    if (!this.paymentService) {
      throw new ValidationError(
        'PaymentService unavailable — manual payment cannot be applied',
      );
    }

    const repayment = await this.paymentService.processPayment(tenantId, {
      contractId,
      amount: input.amount,
      currency: input.currency,
      method: input.paymentMethod,
      source: 'manual',
      externalRef: input.paymentRef,
      idempotencyKey: input.idempotencyKey ?? `manual:${input.paymentRef}`,
    });

    this.eventBus.emitAndBuild(EventType.REPAYMENT_RECEIVED, tenantId, {
      repaymentId: repayment.id,
      contractId,
      amount: input.amount,
      source: 'manual',
      paymentMethod: input.paymentMethod,
      paymentRef: input.paymentRef,
      operatorId: input.operatorId,
      notes: input.notes,
    });

    return repayment;
  }

  /**
   * Restructure a contract — change tenor, rate or maturity date.
   * Original terms are appended to `metadata.restructureHistory` so the
   * audit trail is permanent.
   */
  async restructureContract(
    tenantId: string,
    contractId: string,
    input: {
      newTenorDays?: number;
      newInterestRate?: string;
      newMaturityDate?: Date;
      restructureReason: string;
      operatorId: string;
    },
  ) {
    if (!input.restructureReason || input.restructureReason.trim().length === 0) {
      throw new ValidationError('Restructure reason is required');
    }
    if (
      input.newTenorDays == null &&
      input.newInterestRate == null &&
      input.newMaturityDate == null
    ) {
      throw new ValidationError('At least one term must be modified');
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);
    if (!ContractWriteOperationsService.ACTIONABLE_STATUSES.includes(contract.status)) {
      throw new ValidationError(
        `Contract status ${contract.status} cannot be restructured`,
      );
    }

    if (input.newTenorDays != null && input.newTenorDays < 1) {
      throw new ValidationError('New tenor must be at least 1 day');
    }
    if (input.newInterestRate && compare(input.newInterestRate, '0') < 0) {
      throw new ValidationError('Interest rate cannot be negative');
    }

    const originalTerms = {
      tenorDays: contract.tenorDays,
      interestRate: String(contract.interestRate),
      maturityDate: contract.maturityDate.toISOString(),
    };

    const existingMeta = (contract.metadata as Record<string, unknown>) || {};
    const existingHistory =
      (existingMeta.restructureHistory as unknown[]) || [];

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        tenorDays: input.newTenorDays ?? contract.tenorDays,
        interestRate: input.newInterestRate ?? contract.interestRate,
        maturityDate: input.newMaturityDate ?? contract.maturityDate,
        restructured: true,
        restructureCount: (contract.restructureCount ?? 0) + 1,
        metadata: {
          ...existingMeta,
          restructureHistory: [
            ...existingHistory,
            {
              originalTerms,
              newTerms: {
                tenorDays: input.newTenorDays,
                interestRate: input.newInterestRate,
                maturityDate: input.newMaturityDate?.toISOString(),
              },
              reason: input.restructureReason,
              restructuredBy: input.operatorId,
              restructuredAt: new Date().toISOString(),
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
      contractId,
      action: 'restructured',
      originalTerms,
      operatorId: input.operatorId,
    });

    return updated;
  }

  /**
   * Waive penalties — full or partial. Reduces both `outstandingPenalties`
   * and `totalOutstanding` and persists the waiver under
   * `metadata.penaltyWaivers`. Rejects amounts exceeding accrued
   * penalties.
   */
  async waivePenalties(
    tenantId: string,
    contractId: string,
    input: {
      waiverAmount: string;
      waiverReason: string;
      operatorId: string;
    },
  ) {
    if (!input.waiverAmount || compare(input.waiverAmount, '0') <= 0) {
      throw new ValidationError('Waiver amount must be greater than zero');
    }
    if (!input.waiverReason || input.waiverReason.trim().length === 0) {
      throw new ValidationError('Waiver reason is required');
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const outstandingPenalties = String(contract.outstandingPenalties ?? '0');
    if (compare(input.waiverAmount, outstandingPenalties) > 0) {
      throw new ValidationError(
        `Waiver amount ${input.waiverAmount} exceeds outstanding penalties ${outstandingPenalties}`,
        { outstandingPenalties },
      );
    }

    const newOutstandingPenalties = subtract(outstandingPenalties, input.waiverAmount);
    const newTotalOutstanding = subtract(
      String(contract.totalOutstanding ?? '0'),
      input.waiverAmount,
    );

    const existingMeta = (contract.metadata as Record<string, unknown>) || {};
    const existingWaivers = (existingMeta.penaltyWaivers as unknown[]) || [];

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingPenalties: newOutstandingPenalties,
        totalOutstanding: newTotalOutstanding,
        metadata: {
          ...existingMeta,
          penaltyWaivers: [
            ...existingWaivers,
            {
              amount: input.waiverAmount,
              reason: input.waiverReason,
              waivedBy: input.operatorId,
              waivedAt: new Date().toISOString(),
              outstandingBefore: outstandingPenalties,
              outstandingAfter: newOutstandingPenalties,
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
      contractId,
      action: 'penalty_waived',
      waiverAmount: input.waiverAmount,
      operatorId: input.operatorId,
    });

    return updated;
  }
}

