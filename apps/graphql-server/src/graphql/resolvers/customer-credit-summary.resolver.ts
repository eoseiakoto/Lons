import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import {
  CustomerCreditSummaryService,
  CurrentTenant,
  Roles,
} from '@lons/entity-service';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';

import { CustomerCreditSummaryType } from '../types/customer-credit-summary.type';

/**
 * S17-10 / FR-CM-003.1 — GraphQL surface for the customer credit
 * summary. Read-only; `customer:read` permission required.
 *
 * Cache is internal (5 minute TTL); the resolver itself is a pass-
 * through. The shorter TTL (vs the financial profile's 15 minutes) is
 * deliberate: credit summary appears in the contract approval flow,
 * where stale headroom data has a direct business cost.
 */
@Resolver(() => CustomerCreditSummaryType)
export class CustomerCreditSummaryResolver {
  constructor(
    private creditSummaryService: CustomerCreditSummaryService,
  ) {}

  @Query(() => CustomerCreditSummaryType)
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customerCreditSummary(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<CustomerCreditSummaryType> {
    const summary = await this.creditSummaryService.getSummary(
      tenantId,
      customerId,
    );
    return {
      customerId: summary.customerId,
      currentScore: summary.currentScore ?? undefined,
      scoreModelVersion: summary.scoreModelVersion ?? undefined,
      riskTier: summary.riskTier ?? undefined,
      totalCreditLimit: summary.totalCreditLimit,
      totalExposure: summary.totalExposure,
      totalUtilizedCredit: summary.totalUtilizedCredit,
      totalAvailableCredit: summary.totalAvailableCredit,
      activeContracts: summary.activeContracts,
      overdueContracts: summary.overdueContracts,
      worstDelinquency: summary.worstDelinquency,
      totalOutstandingBalance: summary.totalOutstandingBalance,
      lastScoreDate: summary.lastScoreDate ?? undefined,
    };
  }
}
