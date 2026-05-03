import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  BnplTransactionStatus,
  CustomerStatus,
  ProductType,
  ProductStatus,
  MerchantStatus,
  KycLevel,
  SettlementType,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  isPositive,
  compare,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { generateInstallmentSchedule } from './installment-generator';
import { MerchantSettlementService } from './merchant-settlement.service';

const KYC_LEVEL_ORDER: Record<string, number> = {
  none: 0,
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
};

export interface InitiateBnplPurchaseInput {
  merchantCode: string;
  customerId: string;
  /** Decimal string. */
  purchaseAmount: string;
  currency: string;
  numberOfInstallments: number;
  /** Merchant's order identifier. Unique per merchant. */
  purchaseRef: string;
  merchantRef?: string;
  items?: Array<{ name: string; amount: string }>;
  /** Required by SPEC §17.2 — repeated calls with the same key are idempotent. */
  idempotencyKey: string;
}

export interface InitiateBnplPurchaseResult {
  transactionId: string;
  status: BnplTransactionStatus;
  totalRepayable: string;
  installments: Array<{
    installmentNumber: number;
    amount: string;
    dueDate: string;
  }>;
}

/**
 * BNPL purchase-triggered origination (Sprint 11 Track B / B4).
 *
 * Flow per SPEC FR-BN-001 / FR-BN-002:
 *   1. Validate merchant (active) and customer (active, KYC-eligible).
 *   2. Idempotency check on `(tenantId, idempotencyKey)`.
 *   3. Pre-qualify: KYC level meets product minimum, no existing
 *      defaulted/cancelled BNPL on the same merchant for this customer.
 *   4. Generate installment schedule from product config.
 *   5. Create the BnplTransaction (status: approved) + InstallmentSchedule
 *      rows in a single transaction.
 *   6. For IMMEDIATE merchants, create the settlement row inline. T+1
 *      merchants get picked up by the daily batch.
 *   7. Emit `bnpl.purchase.approved`.
 *
 * The wallet adapter for merchant settlement dispatch is NOT called here
 * — the settlement service exposes `settleNow` which the integration
 * service or scheduler invokes. The origination flow is synchronous and
 * fast (sub-2s per FR-BN-001.3) so we don't block on a wallet round-trip.
 */
@Injectable()
export class BnplOriginationService {
  private readonly logger = new Logger('BnplOriginationService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly settlementService: MerchantSettlementService,
  ) {}

  async initiate(
    tenantId: string,
    input: InitiateBnplPurchaseInput,
  ): Promise<InitiateBnplPurchaseResult> {
    if (!isPositive(input.purchaseAmount)) {
      throw new ValidationError(`purchaseAmount must be positive (got ${input.purchaseAmount})`);
    }
    if (input.numberOfInstallments < 1) {
      throw new ValidationError(
        `numberOfInstallments must be >= 1 (got ${input.numberOfInstallments})`,
      );
    }

    // 1) Idempotency — return the prior result if the same key has already
    // committed a transaction in this tenant.
    const existing = await this.prisma.bnplTransaction.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
    });
    if (existing) {
      this.logger.log(
        `Idempotency hit: returning existing transaction ${existing.id} for key ${input.idempotencyKey}`,
      );
      return {
        transactionId: existing.id,
        status: existing.status,
        totalRepayable: String(existing.totalRepayable),
        installments: existing.installments.map((i) => ({
          installmentNumber: i.installmentNumber,
          amount: String(i.amount),
          dueDate: i.dueDate.toISOString(),
        })),
      };
    }

    // 2) Merchant lookup + status check.
    const merchant = await this.prisma.merchant.findFirst({
      where: { tenantId, code: input.merchantCode, deletedAt: null },
    });
    if (!merchant) throw new NotFoundError('Merchant', input.merchantCode);
    if (merchant.status !== MerchantStatus.active) {
      throw new ValidationError(`Merchant ${input.merchantCode} is ${merchant.status}, not active`);
    }

    // 3) Customer lookup + status check.
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer', input.customerId);
    if (customer.status !== CustomerStatus.active) {
      throw new ValidationError(`Customer is not active (status: ${customer.status})`);
    }

    // 4) Product lookup — must be a BNPL product, active, with a lender.
    const product = await this.requireBnplProduct(tenantId);

    // 5) KYC gate (SPEC §5.1 / §FR-BN-001 mirrors overdraft).
    const eligibilityRules =
      (product.eligibilityRules as Record<string, unknown> | null) ?? {};
    const minKycLevel = (eligibilityRules.minKycLevel as string | undefined) ?? KycLevel.none;
    const customerKycLevel = customer.kycLevel ?? KycLevel.none;
    if ((KYC_LEVEL_ORDER[customerKycLevel] ?? 0) < (KYC_LEVEL_ORDER[minKycLevel] ?? 0)) {
      this.declineEvent(tenantId, input, merchant.id, 'kyc_below_minimum');
      throw new ValidationError(
        `Customer KYC level '${customerKycLevel}' is below product minimum '${minKycLevel}'`,
      );
    }

    // 5b) FIX 3: Default / acceleration gate. Reject any new BNPL purchase
    // when the customer has an existing transaction in `defaulted` or
    // `accelerated` status, anywhere in the tenant. SPEC §FR-BN-001 —
    // a customer who has already defaulted shouldn't take on more BNPL
    // debt until the prior obligation is resolved.
    const existingDefault = await this.prisma.bnplTransaction.findFirst({
      where: {
        tenantId,
        customerId: input.customerId,
        status: {
          in: [BnplTransactionStatus.defaulted, BnplTransactionStatus.accelerated],
        },
        deletedAt: null,
      },
      select: { id: true, status: true, merchantId: true },
    });
    if (existingDefault) {
      this.declineEvent(tenantId, input, merchant.id, 'existing_default');
      throw new ValidationError(
        `Customer has an existing ${existingDefault.status} BNPL transaction (${existingDefault.id.slice(0, 8)}…) — cannot approve new purchases until resolved`,
      );
    }

    // 5c) FIX 4: Scoring gate — placeholder until Sprint 12 wires in the
    // scoring service. Logging the bypass makes the gap visible in
    // production logs so we can monitor approvals that should have been
    // scored.
    // TODO (Sprint 12+): Wire in scoring service call. When ready:
    //   const scoreResult = await this.scoringService.evaluate(tenantId, {
    //     customerId: input.customerId,
    //     productId: product.id,
    //     amount: input.purchaseAmount,
    //     currency: input.currency,
    //   });
    //   if (scoreResult.decision === 'reject') {
    //     this.declineEvent(tenantId, input, merchant.id, 'scoring_rejected');
    //     throw new ValidationError(`Scoring rejected: ${scoreResult.reason}`);
    //   }
    this.logger.warn(
      `BNPL scoring bypass: no scoring service call for customer ${input.customerId.slice(0, 8)}… — Sprint 12+ will wire this in`,
    );

    // 6) Per-product bounds.
    if (product.minAmount && compare(input.purchaseAmount, String(product.minAmount)) < 0) {
      this.declineEvent(tenantId, input, merchant.id, 'amount_below_min');
      throw new ValidationError(
        `purchaseAmount ${input.purchaseAmount} is below product minimum ${product.minAmount}`,
      );
    }
    if (product.maxAmount && compare(input.purchaseAmount, String(product.maxAmount)) > 0) {
      this.declineEvent(tenantId, input, merchant.id, 'amount_above_max');
      throw new ValidationError(
        `purchaseAmount ${input.purchaseAmount} exceeds product maximum ${product.maxAmount}`,
      );
    }

    // 7) Schedule generation.
    // Sprint 12 G5: reads from dedicated `product.bnplConfig` (migration
    // 20260503000000_add_bnpl_config back-filled from overdraftConfig for
    // existing BNPL products). Falls back to overdraftConfig for any product
    // not yet migrated, then empty object.
    const bnplConfig =
      (product.bnplConfig as Record<string, unknown> | null) ??
      (product.overdraftConfig as Record<string, unknown> | null) ??
      {};
    const interestRate = product.interestRate ? String(product.interestRate) : '0';
    const firstInstallmentDeferralDays = Number(
      (bnplConfig.firstInstallmentDeferralDays as number | undefined) ?? 0,
    );
    const installmentIntervalDays = Number(
      (bnplConfig.installmentIntervalDays as number | undefined) ?? 30,
    );
    const zeroInterestDays = bnplConfig.zeroInterestDays as number | undefined;

    const schedule = generateInstallmentSchedule({
      purchaseAmount: input.purchaseAmount,
      numberOfInstallments: input.numberOfInstallments,
      interestRate,
      firstInstallmentDeferralDays,
      installmentIntervalDays,
      zeroInterestDays,
      asOf: new Date(),
    });

    // 8) Create the transaction + installments atomically.
    const tx = await this.prisma.$transaction(async (txp) => {
      const created = await txp.bnplTransaction.create({
        data: {
          tenantId,
          customerId: input.customerId,
          merchantId: merchant.id,
          productId: product.id,
          lenderId: product.lenderId!,
          currency: input.currency,
          purchaseAmount: input.purchaseAmount,
          totalRepayable: schedule.totalRepayable,
          numberOfInstallments: input.numberOfInstallments,
          status: BnplTransactionStatus.approved,
          purchaseRef: input.purchaseRef,
          merchantRef: input.merchantRef,
          interestRate,
          idempotencyKey: input.idempotencyKey,
          metadata: input.items ? ({ items: input.items } as Prisma.InputJsonValue) : undefined,
        },
      });

      await txp.installmentSchedule.createMany({
        data: schedule.installments.map((i) => ({
          tenantId,
          transactionId: created.id,
          installmentNumber: i.installmentNumber,
          amount: i.amount,
          principalPortion: i.principalPortion,
          interestPortion: i.interestPortion,
          feePortion: i.feePortion,
          dueDate: i.dueDate,
        })),
      });

      return created;
    });

    // 9) Settlement — IMMEDIATE creates the row inline; T+1 is batched.
    if (merchant.settlementType === SettlementType.IMMEDIATE) {
      try {
        await this.settlementService.createImmediateSettlement(tenantId, tx.id);
      } catch (e) {
        // Settlement-row creation failure shouldn't roll back the
        // approved transaction — the customer is approved either way.
        // Log loudly so ops can re-run settlement out-of-band.
        this.logger.error(
          `IMMEDIATE settlement creation failed for ${tx.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    // 10) Emit approval event.
    this.eventBus.emitAndBuild(EventType.BNPL_PURCHASE_APPROVED, tenantId, {
      transactionId: tx.id,
      merchantId: merchant.id,
      customerId: input.customerId,
      purchaseAmount: input.purchaseAmount,
      totalRepayable: schedule.totalRepayable,
      currency: input.currency,
      numberOfInstallments: input.numberOfInstallments,
      interestRate,
      purchaseRef: input.purchaseRef,
      firstInstallmentDueDate: schedule.installments[0].dueDate.toISOString(),
    });

    this.logger.log(
      `Approved BNPL ${tx.id} for customer ${input.customerId.slice(0, 8)}…  amount=${input.purchaseAmount} ${input.currency} x${input.numberOfInstallments}`,
    );

    return {
      transactionId: tx.id,
      status: BnplTransactionStatus.approved,
      totalRepayable: schedule.totalRepayable,
      installments: schedule.installments.map((i) => ({
        installmentNumber: i.installmentNumber,
        amount: i.amount,
        dueDate: i.dueDate.toISOString(),
      })),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  private async requireBnplProduct(tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        type: ProductType.bnpl,
        status: ProductStatus.active,
        deletedAt: null,
      },
    });
    if (!product) {
      throw new ValidationError(
        `No active BNPL product found for tenant — onboard a BNPL product before originating purchases`,
      );
    }
    if (!product.lenderId) {
      throw new ValidationError(`BNPL product ${product.code} has no funding lender`);
    }
    return product;
  }

  private declineEvent(
    tenantId: string,
    input: InitiateBnplPurchaseInput,
    merchantId: string,
    reason: string,
  ): void {
    this.eventBus.emitAndBuild(EventType.BNPL_PURCHASE_DECLINED, tenantId, {
      merchantId,
      customerId: input.customerId,
      purchaseAmount: input.purchaseAmount,
      currency: input.currency,
      purchaseRef: input.purchaseRef,
      reason,
    });
  }
}
