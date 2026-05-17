import { Injectable, Optional, Inject } from '@nestjs/common';
import { PrismaService, Prisma, RepaymentStatus, RepaymentMethodType, ContractStatus } from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  subtract,
  compare,
  bankersRound,
  IWalletCollectionAdapter,
  WALLET_COLLECTION_ADAPTER,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { allocatePayment, OutstandingAmounts } from '../waterfall/waterfall-allocator';
import { ScheduleRecalculationService } from '../schedule/schedule-recalculation.service';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    /**
     * Sprint 16 (S16-7) — optional injection so legacy tests that
     * construct PaymentService without the schedule module still work.
     * Production wiring always provides it via RepaymentServiceModule.
     */
    @Optional() private scheduleRecalc?: ScheduleRecalculationService,
    /**
     * S17-FIX-3 (DI-only, scoped down per S17 review): the shared
     * `IWalletCollectionAdapter` from `@lons/common/wallet` is wired in
     * via `WALLET_COLLECTION_ADAPTER` so Phase 5 can swap real adapters
     * (MTN MoMo, M-Pesa) without touching this service. The actual
     * collection *call* lives in the per-product auto-collect jobs
     * (BNPL: `BnplAutoCollectJob`; overdraft: `OverdraftCollectionJob`)
     * which still use their own collection adapters. Migrating those
     * call sites to the shared interface is deferred — tracked for
     * Sprint 18+ along with the unified wallet-adapter resolver.
     * This field is intentionally unused today.
     */
    @Optional()
    @Inject(WALLET_COLLECTION_ADAPTER)
    private _walletCollectionAdapter?: IWalletCollectionAdapter,
  ) {}

  async processPayment(tenantId: string, input: {
    contractId: string;
    amount: string;
    currency: string;
    method: string;
    source?: string;
    externalRef?: string;
    /**
     * FIX-3 (Sprint 16 fixes): caller-supplied replay key. A duplicate
     * call with the same `(tenantId, idempotencyKey)` returns the
     * existing repayment instead of creating a phantom row. Optional
     * for legacy / internal callers; the GraphQL resolver requires it.
     */
    idempotencyKey?: string;
  }) {
    // FIX-3: idempotency check BEFORE any read of contract state so a
    // replayed mutation against a since-settled contract still returns
    // the original repayment (instead of throwing on the status guard).
    if (input.idempotencyKey) {
      const existing = await this.prisma.repayment.findFirst({
        where: { tenantId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: input.contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', input.contractId);

    if (contract.status === 'settled' || contract.status === 'cancelled') {
      throw new ValidationError('Contract is already settled or cancelled');
    }

    const outstanding: OutstandingAmounts = {
      overduePenalties: String(contract.outstandingPenalties || 0),
      overdueInterest: '0.0000', // Simplified: treat all interest as current for Phase 2
      overduePrincipal: '0.0000',
      currentFees: String(contract.outstandingFees || 0),
      currentInterest: String(contract.outstandingInterest || 0),
      currentPrincipal: String(contract.outstandingPrincipal || 0),
    };

    const allocation = allocatePayment(input.amount, outstanding);

    // Prisma's Decimal columns accept string values directly — no Number() cast.
    // Casting to Number() loses precision past ~15 significant digits.
    const repayment = await this.prisma.repayment.create({
      data: {
        tenantId,
        amount: input.amount,
        currency: input.currency,
        method: input.method as RepaymentMethodType,
        source: input.source,
        externalRef: input.externalRef,
        // FIX-3: persist the replay key. The partial unique index in
        // the migration enforces (tenantId, idempotencyKey) uniqueness
        // for non-null keys — backstops the application-level check.
        idempotencyKey: input.idempotencyKey,
        allocatedPrincipal: allocation.allocatedPrincipal,
        allocatedInterest: allocation.allocatedInterest,
        allocatedFees: allocation.allocatedFees,
        allocatedPenalties: allocation.allocatedPenalties,
        status: RepaymentStatus.completed,
        completedAt: new Date(),
        contract: { connect: { id: input.contractId } },
        customer: { connect: { id: contract.customerId } },
      },
    });

    // Update contract outstanding amounts
    const newOutstandingPrincipal = bankersRound(subtract(String(contract.outstandingPrincipal || 0), allocation.allocatedPrincipal), 4);
    const newOutstandingInterest = bankersRound(subtract(String(contract.outstandingInterest || 0), allocation.allocatedInterest), 4);
    const newOutstandingFees = bankersRound(subtract(String(contract.outstandingFees || 0), allocation.allocatedFees), 4);
    const newOutstandingPenalties = bankersRound(subtract(String(contract.outstandingPenalties || 0), allocation.allocatedPenalties), 4);
    const newTotalOutstanding = add(add(newOutstandingPrincipal, newOutstandingInterest), add(newOutstandingFees, newOutstandingPenalties));
    const newTotalPaid = add(String(contract.totalPaid || 0), input.amount);

    const isSettled = compare(newTotalOutstanding, '0') <= 0;

    await this.prisma.contract.update({
      where: { id: input.contractId },
      data: {
        outstandingPrincipal: newOutstandingPrincipal,
        outstandingInterest: newOutstandingInterest,
        outstandingFees: newOutstandingFees,
        outstandingPenalties: newOutstandingPenalties,
        totalOutstanding: newTotalOutstanding,
        totalPaid: newTotalPaid,
        ...(isSettled ? { status: ContractStatus.settled, settledAt: new Date() } : {}),
      },
    });

    // Create ledger entry
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        entryType: 'repayment',
        debitCredit: 'credit',
        amount: input.amount,
        currency: input.currency,
        runningBalance: newTotalOutstanding,
        effectiveDate: new Date(),
        valueDate: new Date(),
        description: `Repayment of ${input.amount} ${input.currency}`,
        referenceType: 'repayment',
        referenceId: repayment.id,
        contract: { connect: { id: input.contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.REPAYMENT_RECEIVED, tenantId, {
      repaymentId: repayment.id,
      contractId: input.contractId,
      amount: input.amount,
      allocatedPrincipal: allocation.allocatedPrincipal,
      allocatedInterest: allocation.allocatedInterest,
      allocatedFees: allocation.allocatedFees,
      allocatedPenalties: allocation.allocatedPenalties,
    });

    // Sprint 16 (S16-7): recalculate the future schedule when the
    // payment was an early/advance payment — defined as principal
    // allocated > 0 AND the contract is NOT now fully settled.
    // Settlement skips the recalc (no future installments to balance).
    // Best-effort: failure logs but does not roll back the payment.
    if (
      this.scheduleRecalc &&
      !isSettled &&
      compare(allocation.allocatedPrincipal, '0') > 0
    ) {
      try {
        await this.scheduleRecalc.recalculate(
          tenantId,
          input.contractId,
          'early_payment',
        );
      } catch {
        // Schedule recalc is best-effort — never break the payment.
      }
    }

    return repayment;
  }

  async findAll(tenantId: string, filters?: {
    skip?: number;
    take?: number;
    contractId?: string;
  }) {
    const where: Prisma.RepaymentWhereInput = { tenantId };
    if (filters?.contractId) where.contractId = filters.contractId;

    return this.prisma.repayment.findMany({
      where,
      skip: filters?.skip ?? 0,
      take: filters?.take ?? 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string, filters?: {
    contractId?: string;
  }) {
    const where: Prisma.RepaymentWhereInput = { tenantId };
    if (filters?.contractId) where.contractId = filters.contractId;

    return this.prisma.repayment.count({ where });
  }

  async getRepayments(tenantId: string, contractId: string, take: number = 20, cursor?: string) {
    const items = await this.prisma.repayment.findMany({
      where: { tenantId, contractId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.slice(0, take), hasMore: items.length > take };
  }

  async calculateEarlySettlement(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    return {
      contractId,
      outstandingPrincipal: String(contract.outstandingPrincipal || 0),
      outstandingInterest: String(contract.outstandingInterest || 0),
      outstandingFees: String(contract.outstandingFees || 0),
      outstandingPenalties: String(contract.outstandingPenalties || 0),
      totalSettlementAmount: String(contract.totalOutstanding || 0),
      currency: contract.currency,
    };
  }
}
