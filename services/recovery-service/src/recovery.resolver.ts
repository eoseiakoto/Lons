import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { RecoveryStrategyType } from '@lons/shared-types';

import { StrategyRecommenderService } from './strategy-recommender.service';
import { OutcomeTrackerService } from './outcome-tracker.service';
import { PredictiveRiskService } from './predictive-risk.service';
import { RestructuringService } from './restructuring.service';

import {
  RecoveryStrategyItemType,
  DefaultRiskAssessmentType,
} from './dto/recovery-strategy.dto';
import { RestructuringInput, RestructuringResultType } from './dto/restructuring.dto';
import { RecoveryOutcomeType } from './dto/outcome.dto';

@Resolver()
export class RecoveryResolver {
  constructor(
    private strategyRecommender: StrategyRecommenderService,
    private outcomeTracker: OutcomeTrackerService,
    private predictiveRisk: PredictiveRiskService,
    private restructuringService: RestructuringService,
  ) {}

  @Query(() => [RecoveryStrategyItemType])
  @Roles('collections:read')
  async recoveryStrategies(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<any[]> {
    return this.strategyRecommender.recommend(tenantId, contractId);
  }

  @Query(() => [RecoveryOutcomeType])
  @Roles('collections:read')
  async recoveryOutcomes(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<any[]> {
    const outcomes = await this.outcomeTracker.getOutcomes(tenantId, contractId);
    return outcomes.map((o: any) => ({
      ...o,
      amountRecovered: o.amountRecovered ? String(o.amountRecovered) : undefined,
    }));
  }

  @Query(() => DefaultRiskAssessmentType)
  @Roles('collections:read')
  async defaultRiskAssessment(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<any> {
    return this.predictiveRisk.predictDefaultRisk(tenantId, contractId);
  }

  @Mutation(() => RecoveryOutcomeType)
  @Roles('collections:write')
  async applyRecoveryStrategy(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('strategyType') strategyType: string,
    @Args('params', { nullable: true }) params: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<any> {
    const outcome = await this.outcomeTracker.recordOutcome(tenantId, contractId, {
      strategyType: strategyType as RecoveryStrategyType,
      strategyParams: params ? JSON.parse(params) : undefined,
    });
    return {
      ...outcome,
      amountRecovered: outcome.amountRecovered ? String(outcome.amountRecovered) : undefined,
    };
  }

  @Mutation(() => RecoveryOutcomeType)
  @Roles('collections:write')
  async recordRecoveryOutcome(
    @Args('outcomeId', { type: () => ID }) outcomeId: string,
    @Args('status') status: string,
    @Args('amountRecovered', { nullable: true }) amountRecovered: string,
    @Args('notes', { nullable: true }) notes: string,
  ): Promise<any> {
    const outcome = await this.outcomeTracker.updateOutcome(outcomeId, {
      status: status as any,
      amountRecovered,
      notes,
    });
    return {
      ...outcome,
      amountRecovered: outcome.amountRecovered ? String(outcome.amountRecovered) : undefined,
    };
  }

  @Mutation(() => RestructuringResultType)
  @Roles('collections:write')
  async restructureLoan(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('params') params: RestructuringInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<any> {
    return this.restructuringService.restructureLoan(tenantId, contractId, {
      newTenorDays: params.newTenorDays,
      newInstallmentAmount: params.newInstallmentAmount,
      newInterestRate: params.newInterestRate,
      penaltyWaiver: params.penaltyWaiver,
      paymentHolidayDays: params.paymentHolidayDays,
      reason: params.reason,
    });
  }
}
