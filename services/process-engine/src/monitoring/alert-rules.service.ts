import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { AlertSeverity, AdaptiveActionType } from '@lons/shared-types';
import { RiskIndicator } from './monitoring.service';

export interface TriggeredAlert {
  alertRuleId: string;
  ruleName: string;
  severity: AlertSeverity;
  conditionType: string;
  actionType?: AdaptiveActionType;
  actionConfig?: Record<string, unknown>;
}

export interface CreateAlertRuleInput {
  name: string;
  description?: string;
  productId?: string;
  riskTier?: string;
  conditionType: string;
  conditionConfig: Record<string, unknown>;
  severity?: AlertSeverity;
  actionType?: AdaptiveActionType;
  actionConfig?: Record<string, unknown>;
}

export interface UpdateAlertRuleInput {
  name?: string;
  description?: string;
  productId?: string;
  riskTier?: string;
  conditionType?: string;
  conditionConfig?: Record<string, unknown>;
  severity?: AlertSeverity;
  actionType?: AdaptiveActionType;
  actionConfig?: Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger('AlertRulesService');

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: CreateAlertRuleInput) {
    return (this.prisma as any).alertRule.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        productId: data.productId,
        riskTier: data.riskTier,
        conditionType: data.conditionType,
        conditionConfig: data.conditionConfig as any,
        severity: data.severity || AlertSeverity.warning,
        actionType: data.actionType,
        actionConfig: data.actionConfig as any,
      },
    });
  }

  async update(id: string, tenantId: string, data: UpdateAlertRuleInput) {
    // Ensure tenant isolation
    const existing = await (this.prisma as any).alertRule.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`AlertRule ${id} not found for tenant`);
    }

    return (this.prisma as any).alertRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.productId !== undefined && { productId: data.productId }),
        ...(data.riskTier !== undefined && { riskTier: data.riskTier }),
        ...(data.conditionType !== undefined && { conditionType: data.conditionType }),
        ...(data.conditionConfig !== undefined && { conditionConfig: data.conditionConfig as any }),
        ...(data.severity !== undefined && { severity: data.severity }),
        ...(data.actionType !== undefined && { actionType: data.actionType }),
        ...(data.actionConfig !== undefined && { actionConfig: data.actionConfig as any }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await (this.prisma as any).alertRule.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`AlertRule ${id} not found for tenant`);
    }

    return (this.prisma as any).alertRule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async findByTenant(tenantId: string, productId?: string) {
    return (this.prisma as any).alertRule.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(productId && { productId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, tenantId: string) {
    return (this.prisma as any).alertRule.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async evaluateRules(
    tenantId: string,
    contractId: string,
    riskIndicator: RiskIndicator,
  ): Promise<TriggeredAlert[]> {
    // Get contract to determine productId for rule matching
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { productId: true },
    });

    const rules = await (this.prisma as any).alertRule.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { productId: null },
          { productId: contract?.productId },
        ],
      },
    });

    const triggered: TriggeredAlert[] = [];

    for (const rule of rules) {
      const config = rule.conditionConfig as Record<string, unknown>;
      let matched = false;

      switch (rule.conditionType) {
        case 'score_threshold':
          matched = this.evaluateScoreThreshold(riskIndicator, config);
          break;
        case 'dpd_threshold':
          matched = this.evaluateDpdThreshold(riskIndicator, config);
          break;
        case 'risk_level_change':
          matched = this.evaluateRiskLevelChange(riskIndicator, config);
          break;
        case 'wallet_balance_threshold':
          matched = this.evaluateWalletBalanceThreshold(riskIndicator, config);
          break;
        case 'income_deposit_stopped':
          matched = this.evaluateIncomeDepositStopped(riskIndicator, config);
          break;
        case 'spending_pattern_change':
          matched = this.evaluateSpendingPatternChange(riskIndicator, config);
          break;
        default:
          this.logger.warn(`Unknown condition type: ${rule.conditionType}`);
      }

      if (matched) {
        triggered.push({
          alertRuleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          conditionType: rule.conditionType,
          actionType: rule.actionType ?? undefined,
          actionConfig: rule.actionConfig as Record<string, unknown> | undefined,
        });
      }
    }

    return triggered;
  }

  private evaluateScoreThreshold(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    const threshold = Number(config.threshold ?? 50);
    const operator = (config.operator as string) ?? 'gte';
    if (operator === 'gte') return risk.score >= threshold;
    if (operator === 'gt') return risk.score > threshold;
    if (operator === 'lte') return risk.score <= threshold;
    if (operator === 'lt') return risk.score < threshold;
    return risk.score >= threshold;
  }

  private evaluateDpdThreshold(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    const threshold = Number(config.threshold ?? 30);
    // Check if DPD factor is present
    const dpdFactor = risk.factors.find((f) => f.includes('days past due'));
    if (!dpdFactor) return false;
    const dpdMatch = dpdFactor.match(/(\d+)\s+days past due/);
    if (!dpdMatch) return false;
    return parseInt(dpdMatch[1], 10) >= threshold;
  }

  private evaluateRiskLevelChange(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    const targetLevel = config.targetLevel as string;
    if (targetLevel) {
      return risk.riskLevel === targetLevel;
    }
    // If no target specified, trigger for high or critical
    return risk.riskLevel === 'high' || risk.riskLevel === 'critical';
  }

  private evaluateWalletBalanceThreshold(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    // Check if wallet balance factor is present in risk indicators
    const walletFactor = risk.factors.find((f) =>
      f.toLowerCase().includes('wallet balance'),
    );
    if (!walletFactor) return false;
    // If wallet balance factor exists, it means the balance is concerning
    return true;
  }

  private evaluateIncomeDepositStopped(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    const factor = risk.factors.find((f) =>
      f.toLowerCase().includes('income deposit'),
    );
    return !!factor;
  }

  private evaluateSpendingPatternChange(
    risk: RiskIndicator,
    config: Record<string, unknown>,
  ): boolean {
    const factor = risk.factors.find((f) =>
      f.toLowerCase().includes('spending pattern'),
    );
    return !!factor;
  }
}
