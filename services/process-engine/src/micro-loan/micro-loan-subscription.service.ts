import { Injectable, Logger } from '@nestjs/common';

import {
  ContractStatus,
  PrismaService,
  ProductType,
  Subscription,
  SubscriptionStatus,
} from '@lons/database';
import { EventBusService, NotFoundError, ValidationError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 16 (S16-1) — micro-loan subscription deactivation.
 *
 * FR-ML-002.3: customers may deactivate ONLY when no loans are
 * outstanding. The generic SubscriptionService.deactivate() doesn't
 * check this — it just flips the row. This service is the micro-loan
 * specialisation that gates deactivation behind a contract-status
 * check.
 *
 * "Outstanding" = any contract not in (`settled`, `cancelled`,
 * `written_off`). That includes `performing`, `due`, `overdue`,
 * `delinquent`, `default_status`, `cooling_off`. We don't deactivate
 * subscriptions for customers in default either — the operator must
 * resolve the default first.
 */
@Injectable()
export class MicroLoanSubscriptionService {
  private readonly logger = new Logger(MicroLoanSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Deactivate a micro-loan subscription. Throws ValidationError when
   * the customer has outstanding loans; throws NotFoundError if the
   * subscription doesn't exist. Returns the updated row on success.
   *
   * Caller (resolver) is responsible for permission checks; this
   * service trusts the upstream gate.
   */
  async deactivate(
    tenantId: string,
    subscriptionId: string,
    operatorId?: string,
  ): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      include: { product: { select: { type: true } } },
    });
    if (!subscription) {
      throw new NotFoundError('Subscription', subscriptionId);
    }
    if (subscription.product.type !== ProductType.micro_loan) {
      throw new ValidationError(
        'MicroLoanSubscriptionService only handles micro-loan subscriptions',
      );
    }
    if (subscription.status !== SubscriptionStatus.active) {
      throw new ValidationError(
        `Subscription is not active (status: ${subscription.status})`,
      );
    }

    // FR-ML-002.3: outstanding-balance gate. Terminal contract statuses
    // (settled, cancelled, written_off) are not "outstanding"; everything
    // else is.
    const TERMINAL: ContractStatus[] = [
      ContractStatus.settled,
      ContractStatus.cancelled,
      ContractStatus.written_off,
    ];
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        customerId: subscription.customerId,
        productId: subscription.productId,
        status: { notIn: TERMINAL },
      },
      select: { id: true, totalOutstanding: true, status: true },
    });

    if (activeContracts.length > 0) {
      throw new ValidationError(
        `Cannot deactivate micro-loan subscription: customer has ${activeContracts.length} ` +
          `outstanding contract(s). Settle or cancel them first.`,
        {
          activeContractIds: activeContracts.map((c) => c.id),
          activeContractStatuses: activeContracts.map((c) => c.status),
        },
      );
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.deactivated,
        deactivatedAt: new Date(),
      },
    });

    this.eventBus.emitAndBuild(EventType.SUBSCRIPTION_DEACTIVATED, tenantId, {
      subscriptionId,
      customerId: subscription.customerId,
      productId: subscription.productId,
      deactivatedBy: operatorId ?? 'customer',
    });

    return updated;
  }
}
