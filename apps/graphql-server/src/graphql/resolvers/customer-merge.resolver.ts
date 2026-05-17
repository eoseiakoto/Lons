import { Resolver, Mutation, Args, ID } from '@nestjs/graphql';
import {
  CustomerMergeService,
  CurrentTenant,
  CurrentUser,
  Roles,
} from '@lons/entity-service';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';

import {
  CustomerMergeResultType,
  CustomerMergeReparentedType,
} from '../types/customer-merge.type';

/**
 * Schema-level keys for the reparented table counts. Kept here (rather
 * than inferred from `CustomerMergeReparentedType`) because the service
 * returns a Record<string, number> — we explicitly translate to a
 * named-field object so missing keys default to 0 instead of crashing
 * the resolver.
 */
const REPARENTED_KEYS: Array<keyof CustomerMergeReparentedType> = [
  'subscription',
  'loanRequest',
  'scoringResult',
  'contract',
  'disbursement',
  'repayment',
  'notification',
  'screeningResult',
  'creditLine',
  'customerConsent',
  'walletAccountMapping',
  'bnplTransaction',
  'bnplCreditLine',
  'microLoanCreditLimitChange',
  'customerFinancialData',
];

function toReparentedType(
  counts: Record<string, number>,
): CustomerMergeReparentedType {
  const out: Record<string, number> = {};
  for (const key of REPARENTED_KEYS) {
    out[key as string] = counts[key as string] ?? 0;
  }
  return out as unknown as CustomerMergeReparentedType;
}

/**
 * S17-8 / FR-CM-001.3 — GraphQL surface for the customer merge
 * operation. Admin-only (customer:update permission).
 *
 * The mutation is idempotent — call it twice with the same
 * `idempotencyKey` and the second call returns the prior result with
 * `idempotentReplay: true`. Without an idempotency key the operation
 * is still safe to repeat, but each call re-runs the underlying
 * updateMany batch (no-ops on the second call since the source has no
 * children left to re-parent).
 */
@Resolver(() => CustomerMergeResultType)
export class CustomerMergeResolver {
  constructor(private customerMergeService: CustomerMergeService) {}

  @Mutation(() => CustomerMergeResultType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  @Roles('customer:update')
  async mergeCustomers(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { sub: string },
    @Args('sourceCustomerId', { type: () => ID }) sourceCustomerId: string,
    @Args('targetCustomerId', { type: () => ID }) targetCustomerId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<CustomerMergeResultType> {
    const result = await this.customerMergeService.mergeCustomers(
      tenantId,
      sourceCustomerId,
      targetCustomerId,
      user.sub,
      idempotencyKey,
    );
    return {
      targetCustomerId: result.targetCustomerId,
      sourceCustomerId: result.sourceCustomerId,
      reparented: toReparentedType(result.reparented),
      idempotentReplay: result.idempotentReplay,
      mergedAt: new Date(result.mergedAt),
    };
  }
}
