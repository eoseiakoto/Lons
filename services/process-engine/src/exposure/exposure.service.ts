import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService, add, compare, subtract, multiply, divide, bankersRound } from '@lons/common';
import { EventType } from '@lons/event-contracts';

export interface ExposureBreakdown {
  microLoan: string;
  overdraft: string;
  bnpl: string;
  invoiceFactoring: string;
}

export interface ExposureResult {
  customerId: string;
  totalExposure: string;
  breakdown: ExposureBreakdown;
  activeContractCount: number;
}

export interface ExposureLimitCheck {
  allowed: boolean;
  currentExposure: string;
  requestedAmount: string;
  maxAllowed: string;
  headroom: string;
  reason?: 'TENANT_LIMIT_EXCEEDED' | 'PRODUCT_LIMIT_EXCEEDED' | 'CONTRACT_COUNT_EXCEEDED';
}

const PRODUCT_TYPE_MAP: Record<string, keyof ExposureBreakdown> = {
  micro_loan: 'microLoan',
  overdraft: 'overdraft',
  bnpl: 'bnpl',
  invoice_factoring: 'invoiceFactoring',
};

@Injectable()
export class ExposureService {
  private readonly logger = new Logger(ExposureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Calculate total credit exposure for a customer across all active products.
   */
  async calculateTotalExposure(
    tenantId: string,
    customerId: string,
  ): Promise<ExposureResult> {
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        customerId,
        tenantId,
        status: {
          in: ['active', 'performing', 'due', 'overdue', 'delinquent', 'cooling_off'],
        },
      },
      select: {
        id: true,
        totalOutstanding: true,
        productId: true,
      },
    });

    // Load product types for breakdown
    const productIds = [...new Set(activeContracts.map((c) => c.productId))];
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds }, tenantId },
          select: { id: true, type: true },
        })
      : [];
    const productTypeMap = new Map(products.map((p) => [p.id, p.type]));

    const breakdown: ExposureBreakdown = {
      microLoan: '0.0000',
      overdraft: '0.0000',
      bnpl: '0.0000',
      invoiceFactoring: '0.0000',
    };
    let totalExposure = '0.0000';

    for (const contract of activeContracts) {
      const outstanding = String(contract.totalOutstanding ?? 0);
      totalExposure = add(totalExposure, outstanding);

      const productType = productTypeMap.get(contract.productId);
      if (productType) {
        const breakdownKey = PRODUCT_TYPE_MAP[productType];
        if (breakdownKey) {
          breakdown[breakdownKey] = add(breakdown[breakdownKey], outstanding);
        }
      }
    }

    return {
      customerId,
      totalExposure,
      breakdown,
      activeContractCount: activeContracts.length,
    };
  }

  /**
   * Check if a new loan/credit would breach exposure limits.
   */
  async checkExposureLimit(
    tenantId: string,
    customerId: string,
    requestedAmount: string,
    productId: string,
  ): Promise<ExposureLimitCheck> {
    // Load tenant settings for exposure rules
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings as Record<string, any>) || {};
    const exposureRules = settings.exposureRules || {};
    const enableCrossProductCheck = exposureRules.enableCrossProductCheck !== false;

    if (!enableCrossProductCheck) {
      return {
        allowed: true,
        currentExposure: '0.0000',
        requestedAmount,
        maxAllowed: '0.0000',
        headroom: '0.0000',
      };
    }

    const maxCustomerExposure = exposureRules.maxCustomerExposure || '0';

    // If no limit is configured, allow
    if (!maxCustomerExposure || compare(maxCustomerExposure, '0') <= 0) {
      return {
        allowed: true,
        currentExposure: '0.0000',
        requestedAmount,
        maxAllowed: '0.0000',
        headroom: '0.0000',
      };
    }

    const exposure = await this.calculateTotalExposure(tenantId, customerId);
    const newTotal = add(exposure.totalExposure, requestedAmount);
    const headroom = subtract(maxCustomerExposure, exposure.totalExposure);

    const allowed = compare(newTotal, maxCustomerExposure) <= 0;

    // Emit events
    if (allowed) {
      // Check if approaching 80% of limit. Use Decimal arithmetic so the
      // threshold check is exact for large exposures.
      const warningThreshold = multiply(maxCustomerExposure, '0.8');
      if (compare(newTotal, warningThreshold) >= 0) {
        const utilizationPercent = bankersRound(multiply(divide(newTotal, maxCustomerExposure), '100'), 1);
        this.eventBus.emitAndBuild(
          EventType.EXPOSURE_LIMIT_WARNING,
          tenantId,
          {
            customerId,
            productId,
            currentExposure: exposure.totalExposure,
            requestedAmount,
            maxAllowed: maxCustomerExposure,
            utilizationPercent,
          },
        );
      }

      this.eventBus.emitAndBuild(
        EventType.EXPOSURE_LIMIT_CHECK_PASSED,
        tenantId,
        {
          customerId,
          productId,
          currentExposure: exposure.totalExposure,
          requestedAmount,
          maxAllowed: maxCustomerExposure,
        },
      );
    } else {
      this.eventBus.emitAndBuild(
        EventType.EXPOSURE_LIMIT_CHECK_FAILED,
        tenantId,
        {
          customerId,
          productId,
          currentExposure: exposure.totalExposure,
          requestedAmount,
          maxAllowed: maxCustomerExposure,
          exceededBy: subtract(newTotal, maxCustomerExposure),
        },
      );
    }

    return {
      allowed,
      currentExposure: exposure.totalExposure,
      requestedAmount,
      maxAllowed: maxCustomerExposure,
      headroom: compare(headroom, '0') >= 0 ? headroom : '0.0000',
      reason: allowed ? undefined : 'TENANT_LIMIT_EXCEEDED',
    };
  }
}
