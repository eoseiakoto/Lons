import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { ScreeningService } from '@lons/integration-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import { ScreeningResultType } from '../types/screening.type';

@Resolver(() => ScreeningResultType)
export class ScreeningResolver {
  constructor(private readonly screeningService: ScreeningService) {}

  @Mutation(() => ScreeningResultType)
  @Roles('customer:read')
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CUSTOMER)
  async screenCustomer(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<ScreeningResultType> {
    const result = await this.screeningService.screenCustomer(tenantId, customerId);
    return this.mapToType(result);
  }

  @Query(() => [ScreeningResultType])
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customerScreenings(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first: number,
  ): Promise<ScreeningResultType[]> {
    const results = await this.screeningService.getScreeningHistory(
      tenantId,
      customerId,
      first,
    );
    return results.map((r) => this.mapToType(r));
  }

  @Query(() => [ScreeningResultType])
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async screeningsForReview(
    @CurrentTenant() tenantId: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 }) first: number,
  ): Promise<ScreeningResultType[]> {
    const results = await this.screeningService.getScreeningsForReview(
      tenantId,
      first,
    );
    return results.map((r) => this.mapToType(r));
  }

  @Query(() => ScreeningResultType, { nullable: true })
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async screeningById(
    @CurrentTenant() tenantId: string,
    @Args('screeningId', { type: () => ID }) screeningId: string,
  ): Promise<ScreeningResultType | null> {
    const result = await this.screeningService.getScreeningById(tenantId, screeningId);
    if (!result) return null;
    return this.mapToType(result);
  }

  @Mutation(() => ScreeningResultType)
  @Roles('customer:update')
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  async submitScreeningReview(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('screeningId', { type: () => ID }) screeningId: string,
    @Args('decision') decision: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<ScreeningResultType> {
    const result = await this.screeningService.submitReview(
      tenantId,
      screeningId,
      decision,
      user.userId,
      reason,
    );
    return this.mapToType(result);
  }

  private mapToType(result: any): ScreeningResultType {
    return {
      screeningId: result.screeningId,
      customerId: result.customerId,
      tenantId: result.tenantId,
      status: result.status,
      riskLevel: result.riskLevel,
      matches: (result.matches ?? []).map((m: any) => ({
        matchId: m.matchId ?? '',
        matchType: m.matchType ?? 'WATCHLIST',
        entityName: m.entityName ?? '',
        matchScore: m.matchScore ?? 0,
        source: m.source ?? '',
        details: m.details,
      })),
      provider: result.provider,
      screenedAt: result.screenedAt,
      rawResponse: result.rawResponse,
      reviewedBy: result.reviewedBy,
      reviewedAt: result.reviewedAt,
      reviewDecision: result.reviewDecision,
      customer: result.customer,
    };
  }
}
