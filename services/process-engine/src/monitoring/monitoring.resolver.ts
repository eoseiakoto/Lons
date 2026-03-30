import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { encodeCursor } from '@lons/common';
import { PrismaService } from '@lons/database';
import { AlertSeverity, AlertStatus, AdaptiveActionType } from '@lons/shared-types';

import { MonitoringService } from './monitoring.service';
import { AlertRulesService } from './alert-rules.service';
import { AlertService } from './alert.service';
import { AdaptiveActionsService } from './adaptive-actions.service';

import { AlertRuleType, CreateAlertRuleInput, UpdateAlertRuleInput } from './dto/alert-rule.dto';
import { BorrowerRiskProfileType, ContractRiskType } from './dto/risk-profile.dto';
import { MonitoringAlertConnection, MonitoringAlertEdge } from './dto/alert.dto';

@Resolver()
export class MonitoringResolver {
  constructor(
    private prisma: PrismaService,
    private monitoringService: MonitoringService,
    private alertRulesService: AlertRulesService,
    private alertService: AlertService,
    private adaptiveActionsService: AdaptiveActionsService,
  ) {}

  @Query(() => BorrowerRiskProfileType)
  @Roles('monitoring:read')
  async borrowerRiskProfile(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<BorrowerRiskProfileType> {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        customerId,
        status: { in: ['active', 'overdue', 'delinquent'] },
      },
      select: { id: true },
    });

    const contractRisks: ContractRiskType[] = [];
    let totalScore = 0;

    for (const contract of contracts) {
      const risk = await this.monitoringService.assessContractRisk(tenantId, contract.id);
      contractRisks.push({
        contractId: risk.contractId,
        riskLevel: risk.riskLevel,
        score: risk.score,
        factors: risk.factors,
      });
      totalScore += risk.score;
    }

    const avgScore = contracts.length > 0 ? Math.round(totalScore / contracts.length) : 0;
    let overallRiskLevel: string;
    if (avgScore >= 75) overallRiskLevel = 'critical';
    else if (avgScore >= 50) overallRiskLevel = 'high';
    else if (avgScore >= 25) overallRiskLevel = 'medium';
    else overallRiskLevel = 'low';

    return {
      customerId,
      contracts: contractRisks,
      overallRiskLevel,
      overallRiskScore: avgScore,
      activeContractCount: contracts.length,
    };
  }

  @Query(() => MonitoringAlertConnection)
  @Roles('monitoring:read')
  async monitoringAlerts(
    @CurrentTenant() tenantId: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('severity', { nullable: true }) severity?: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<MonitoringAlertConnection> {
    const result = await this.alertService.getAlerts(
      tenantId,
      {
        status: status as AlertStatus | undefined,
        severity: severity as AlertSeverity | undefined,
      },
      { first, after },
    );

    const edges: MonitoringAlertEdge[] = result.items.map((item: any) => ({
      node: {
        ...item,
        factors: item.factors,
        ruleName: item.alertRule?.name,
      },
      cursor: encodeCursor(item.id),
    }));

    return {
      edges,
      totalCount: result.totalCount,
      hasNextPage: result.hasNextPage,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
    };
  }

  @Query(() => [AlertRuleType])
  @Roles('monitoring:read')
  async alertRules(
    @CurrentTenant() tenantId: string,
    @Args('productId', { type: () => ID, nullable: true }) productId?: string,
  ): Promise<AlertRuleType[]> {
    const rules = await this.alertRulesService.findByTenant(tenantId, productId);
    return rules as any;
  }

  @Mutation(() => AlertRuleType)
  @Roles('monitoring:write')
  async createAlertRule(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateAlertRuleInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<AlertRuleType> {
    // Idempotency: check for duplicate by name within tenant
    if (idempotencyKey) {
      const existing = await this.alertRulesService.findByTenant(tenantId);
      const duplicate = existing.find((r: any) => r.name === input.name);
      if (duplicate) return duplicate as any;
    }

    const rule = await this.alertRulesService.create(tenantId, {
      name: input.name,
      description: input.description,
      productId: input.productId,
      riskTier: input.riskTier,
      conditionType: input.conditionType,
      conditionConfig: input.conditionConfig,
      severity: input.severity as AlertSeverity | undefined,
      actionType: input.actionType as AdaptiveActionType | undefined,
      actionConfig: input.actionConfig,
    });

    return rule as any;
  }

  @Mutation(() => AlertRuleType)
  @Roles('monitoring:write')
  async updateAlertRule(
    @Args('id', { type: () => ID }) id: string,
    @CurrentTenant() tenantId: string,
    @Args('input') input: UpdateAlertRuleInput,
  ): Promise<AlertRuleType> {
    const rule = await this.alertRulesService.update(id, tenantId, {
      name: input.name,
      description: input.description,
      productId: input.productId,
      riskTier: input.riskTier,
      conditionType: input.conditionType,
      conditionConfig: input.conditionConfig,
      severity: input.severity as AlertSeverity | undefined,
      actionType: input.actionType as AdaptiveActionType | undefined,
      actionConfig: input.actionConfig,
      isActive: input.isActive,
    });

    return rule as any;
  }

  @Mutation(() => AlertRuleType)
  @Roles('monitoring:write')
  async deleteAlertRule(
    @Args('id', { type: () => ID }) id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<AlertRuleType> {
    const rule = await this.alertRulesService.softDelete(id, tenantId);
    return rule as any;
  }

  @Mutation(() => Boolean)
  @Roles('monitoring:write')
  async acknowledgeMonitoringAlert(
    @Args('alertId', { type: () => ID }) alertId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<boolean> {
    await this.alertService.acknowledgeAlert(alertId, tenantId, user.userId);
    return true;
  }
}
