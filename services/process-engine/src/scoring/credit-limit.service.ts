import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { add, bankersRound, multiply, subtract, compare, min } from '@lons/common';

export interface LimitBand {
  minScore: number;
  maxScore: number;
  limitMultiplier: string;
}

const DEFAULT_LIMIT_BANDS: LimitBand[] = [
  { minScore: 800, maxScore: 1000, limitMultiplier: '5.0000' },
  { minScore: 600, maxScore: 799, limitMultiplier: '3.0000' },
  { minScore: 400, maxScore: 599, limitMultiplier: '1.5000' },
  { minScore: 0, maxScore: 399, limitMultiplier: '0.0000' },
];

@Injectable()
export class CreditLimitService {
  private readonly logger = new Logger(CreditLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derive a credit limit from score using configurable bands per product.
   * Falls back to default bands if product has no custom configuration.
   */
  async deriveLimit(
    score: string,
    productId: string,
    tenantId: string,
    requestedAmount: string,
  ): Promise<string> {
    let bands = DEFAULT_LIMIT_BANDS;

    // Try to load product-specific limit bands
    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { eligibilityRules: true },
      });

      if (product?.eligibilityRules && typeof product.eligibilityRules === 'object') {
        const rules = product.eligibilityRules as Record<string, unknown>;
        if (Array.isArray(rules.limitBands) && rules.limitBands.length > 0) {
          bands = rules.limitBands as LimitBand[];
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to load product config for ${productId}, using default bands`);
    }

    const scoreNum = Number(score);
    for (const band of bands) {
      if (scoreNum >= band.minScore && scoreNum <= band.maxScore) {
        return bankersRound(multiply(requestedAmount, band.limitMultiplier), 4);
      }
    }

    return '0.0000';
  }

  /**
   * Calculate current total exposure: sum of active contract principal amounts.
   */
  async calculateExposureCap(
    customerId: string,
    tenantId: string,
  ): Promise<string> {
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        customerId,
        tenantId,
        status: {
          in: ['active', 'performing', 'due', 'overdue'],
        },
      },
      select: { principalAmount: true },
    });

    let exposure = '0.0000';
    for (const contract of activeContracts) {
      exposure = add(exposure, String(contract.principalAmount));
    }

    return exposure;
  }

  /**
   * Cap the recommended limit so that total exposure doesn't exceed maxExposure.
   * All amounts as Decimal strings.
   */
  applyExposureCap(
    recommendedLimit: string,
    currentExposure: string,
    maxExposure: string,
  ): string {
    const remainingCapacity = subtract(maxExposure, currentExposure);

    // If remaining capacity is zero or negative, return 0
    if (compare(remainingCapacity, '0.0000') <= 0) {
      return '0.0000';
    }

    // Return the minimum of recommended limit and remaining capacity
    return min(recommendedLimit, remainingCapacity);
  }
}
