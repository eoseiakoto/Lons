import { Injectable, Logger } from '@nestjs/common';

import {
  ContractStatus,
  PrismaService,
  SubscriptionStatus,
} from '@lons/database';
import { ValidationError, compare } from '@lons/common';

export interface IMicroLoanValidationInput {
  customerId: string;
  productId: string;
  /** Decimal-as-string. */
  requestedAmount: string;
}

/**
 * Sprint 16 (S16-2) — micro-loan loan-request pre-validation gate.
 *
 * Runs BEFORE the generic loan-request pipeline proceeds to scoring.
 * Three checks, in order:
 *   1. Active subscription exists for (customer, product).
 *   2. Requested amount is within `availableLimit` on the subscription.
 *   3. Single-loan policy: outstanding active contract count is below
 *      `product.maxActiveLoans` (default 1).
 *
 * Throws `ValidationError` with a structured `code` on rejection so the
 * GraphQL exception filter can surface a stable error code to clients.
 * Mirrors the pattern from `BnplOriginationService` (Sprint 15 S15-9).
 *
 * Wired into `LoanRequestService.create()` for micro-loan products via
 * `MicroLoanModule` import in the loan-request module.
 */
@Injectable()
export class MicroLoanOriginationService {
  private readonly logger = new Logger(MicroLoanOriginationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateLoanRequest(
    tenantId: string,
    input: IMicroLoanValidationInput,
  ): Promise<void> {
    // 1) Active subscription required.
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        customerId: input.customerId,
        productId: input.productId,
        status: SubscriptionStatus.active,
      },
    });
    if (!subscription) {
      throw new ValidationError(
        'Customer does not have an active micro-loan subscription for this product',
        { code: 'MICRO_LOAN_NO_ACTIVE_SUBSCRIPTION' },
      );
    }

    // 2) Available limit check. `availableLimit` is the working
    // headroom (decreases on disbursement, increases on repayment).
    // Falls back to `creditLimit` for legacy subscriptions that
    // haven't yet been touched by the limit-tracking flows.
    const availableLimit = String(
      subscription.availableLimit ?? subscription.creditLimit ?? '0',
    );
    if (compare(input.requestedAmount, availableLimit) > 0) {
      throw new ValidationError(
        `Requested amount ${input.requestedAmount} exceeds available credit limit ${availableLimit}`,
        {
          code: 'MICRO_LOAN_INSUFFICIENT_CREDIT_LIMIT',
          requestedAmount: input.requestedAmount,
          availableLimit,
        },
      );
    }

    // 3) Single-loan policy. `product.maxActiveLoans` defaults to 1
    // (already on the schema with @default(1)). Allow override at
    // product level for products that permit multiple concurrent
    // micro-loans.
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId },
      select: { maxActiveLoans: true },
    });
    const maxActive = product?.maxActiveLoans ?? 1;

    const TERMINAL: ContractStatus[] = [
      ContractStatus.settled,
      ContractStatus.cancelled,
      ContractStatus.written_off,
    ];
    const activeContractCount = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId: input.customerId,
        productId: input.productId,
        status: { notIn: TERMINAL },
      },
    });

    if (activeContractCount >= maxActive) {
      throw new ValidationError(
        `Customer already has ${activeContractCount} active micro-loan contract(s); ` +
          `maximum allowed is ${maxActive}. Settle the existing loan before requesting a new one.`,
        {
          code: 'MICRO_LOAN_MAX_ACTIVE_LOANS_REACHED',
          activeContractCount,
          maxActive,
        },
      );
    }
  }
}
