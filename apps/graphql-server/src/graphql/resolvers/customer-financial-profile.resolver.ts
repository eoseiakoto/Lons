import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import {
  CustomerFinancialProfileService,
  CurrentTenant,
  Roles,
} from '@lons/entity-service';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';

import { CustomerFinancialProfileType } from '../types/customer-financial-profile.type';

/**
 * S17-9 / FR-CM-002.1 — GraphQL surface for the customer financial
 * profile. Read-only; `customer:read` permission required.
 *
 * The service handles caching internally (15 minute TTL backed by
 * Redis), so this resolver is intentionally a thin pass-through.
 */
@Resolver(() => CustomerFinancialProfileType)
export class CustomerFinancialProfileResolver {
  constructor(
    private financialProfileService: CustomerFinancialProfileService,
  ) {}

  @Query(() => CustomerFinancialProfileType)
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customerFinancialProfile(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<CustomerFinancialProfileType> {
    const profile = await this.financialProfileService.getProfile(
      tenantId,
      customerId,
    );
    return {
      customerId: profile.customerId,
      totalLoans: profile.totalLoans,
      activeContracts: profile.activeContracts,
      repaymentScore: profile.repaymentScore ?? undefined,
      averageLoanSize: profile.averageLoanSize,
      defaultRate: profile.defaultRate,
      defaultedContracts: profile.defaultedContracts,
      totalOutstandingBalance: profile.totalOutstandingBalance,
      latestWalletBalance: profile.latestWalletBalance ?? undefined,
      averageBalance30d: profile.averageBalance30d ?? undefined,
      transactionCount30d: profile.transactionCount30d ?? undefined,
      incomeConsistency: profile.incomeConsistency ?? undefined,
      lastUpdated: profile.lastUpdated,
    };
  }
}
