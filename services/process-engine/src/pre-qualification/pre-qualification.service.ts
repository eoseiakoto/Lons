import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, ContractStatus } from '@lons/database';

import { RuleEvaluationContext, RuleResult } from './rules/rule.interface';
import { getRule } from './rules/rule-factory';
import { ExposureService } from '../exposure/exposure.service';

export interface PreQualificationResult {
  qualified: boolean;
  failedRules: { code: string; message: string }[];
  /** S17-6 — rules that could not be evaluated (e.g. no EMI data yet). */
  skippedRules?: { type: string; reason: string }[];
  /** S17-6 — set true when the customer has no EMI snapshot at all. */
  emiDataMissing?: boolean;
  exposureCheck?: { allowed: boolean; currentExposure: string; maxAllowed: string; headroom: string };
}

interface EligibilityRuleConfig {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class PreQualificationService {
  private readonly logger = new Logger('PreQualificationService');

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

    // S17-6 — pre-fetch the most recent EMI snapshot so EMI-driven rules
    // can read it synchronously. Absent snapshot ⇒ rules skip rather
    // than auto-reject (FR-PQ-001.2 graceful-handling requirement).
    const latestEmi = await this.prisma.customerFinancialData.findFirst({
      where: { tenantId, customerId, source: 'emi' },
      orderBy: { fetchedAt: 'desc' },
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
      financialData: latestEmi
        ? {
            transactionCount30d: latestEmi.transactionCount30d,
            transactionCount90d: latestEmi.transactionCount90d,
            averageBalance30d: latestEmi.averageBalance30d
              ? latestEmi.averageBalance30d.toString()
              : null,
            averageBalance90d: latestEmi.averageBalance90d
              ? latestEmi.averageBalance90d.toString()
              : null,
            fetchedAt: latestEmi.fetchedAt,
          }
        : null,
    };

    const eligibilityRules = product.eligibilityRules as { rules?: EligibilityRuleConfig[] } | null;
    const ruleConfigs = eligibilityRules?.rules || [];

    const failedRules: { code: string; message: string }[] = [];
    const skippedRules: { type: string; reason: string }[] = [];

    for (const ruleConfig of ruleConfigs) {
      const rule = getRule(ruleConfig.type);
      if (!rule) continue;

      const result: RuleResult = rule.evaluate(context, ruleConfig);
      if (result.skipped) {
        const reason = result.skipReason || 'rule skipped';
        skippedRules.push({ type: ruleConfig.type, reason });
        this.logger.warn(
          `Pre-qualification rule ${ruleConfig.type} skipped for customer=${customerId}: ${reason}`,
        );
        continue;
      }
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

    return {
      qualified: failedRules.length === 0,
      failedRules,
      skippedRules: skippedRules.length > 0 ? skippedRules : undefined,
      emiDataMissing: !latestEmi,
      exposureCheck,
    };
  }
}
