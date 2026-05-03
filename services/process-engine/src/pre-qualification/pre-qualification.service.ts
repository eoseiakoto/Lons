import { Injectable } from '@nestjs/common';
import { PrismaService, ContractStatus } from '@lons/database';

import { RuleEvaluationContext, RuleResult } from './rules/rule.interface';
import { getRule } from './rules/rule-factory';
import { ExposureService } from '../exposure/exposure.service';

export interface PreQualificationResult {
  qualified: boolean;
  failedRules: { code: string; message: string }[];
  exposureCheck?: { allowed: boolean; currentExposure: string; maxAllowed: string; headroom: string };
}

interface EligibilityRuleConfig {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class PreQualificationService {
  constructor(
    private prisma: PrismaService,
    private exposureService: ExposureService,
  ) {}

  async evaluate(tenantId: string, customerId: string, productId: string, requestedAmount?: string): Promise<PreQualificationResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      return { qualified: false, failedRules: [{ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' }] };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) {
      return { qualified: false, failedRules: [{ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }] };
    }

    // Count active defaults
    const activeDefaultCount = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId,
        status: { in: [ContractStatus.default_status, ContractStatus.written_off] },
      },
    });

    const context: RuleEvaluationContext = {
      customer: {
        id: customer.id,
        status: customer.status,
        kycLevel: customer.kycLevel,
        country: customer.country,
        dateOfBirth: customer.dateOfBirth,
        createdAt: customer.createdAt,
      },
      product: {
        id: product.id,
        type: product.type,
        eligibilityRules: product.eligibilityRules,
      },
      tenantId,
      activeDefaultCount,
    };

    const eligibilityRules = product.eligibilityRules as { rules?: EligibilityRuleConfig[] } | null;
    const ruleConfigs = eligibilityRules?.rules || [];

    const failedRules: { code: string; message: string }[] = [];

    for (const ruleConfig of ruleConfigs) {
      const rule = getRule(ruleConfig.type);
      if (!rule) continue;

      const result: RuleResult = rule.evaluate(context, ruleConfig);
      if (!result.passed) {
        failedRules.push({
          code: result.failureCode || ruleConfig.type,
          message: result.failureMessage || `Rule ${ruleConfig.type} failed`,
        });
      }
    }

    // Cross-product exposure check
    let exposureCheck: PreQualificationResult['exposureCheck'];
    if (requestedAmount) {
      const check = await this.exposureService.checkExposureLimit(
        tenantId,
        customerId,
        requestedAmount,
        productId,
      );
      exposureCheck = {
        allowed: check.allowed,
        currentExposure: check.currentExposure,
        maxAllowed: check.maxAllowed,
        headroom: check.headroom,
      };
      if (!check.allowed) {
        failedRules.push({
          code: 'EXPOSURE_LIMIT_EXCEEDED',
          message: check.reason === 'TENANT_LIMIT_EXCEEDED'
            ? `Total exposure would exceed tenant limit of ${check.maxAllowed}`
            : `Exposure limit exceeded`,
        });
      }
    }

    return { qualified: failedRules.length === 0, failedRules, exposureCheck };
  }
}
