import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { maskNationalId } from '@lons/common';

/**
 * S17-3 / FR-DI-002.4 — Bridge from the integration-service credit
 * bureau adapter into the scoring pipeline.
 *
 * Why a token (not a direct import)?
 *
 * `@lons/integration-service` already depends on `@lons/process-engine`
 * (the bureau adapters import process-engine repayment events for
 * positive-data reporting). Importing the bureau service back here
 * would create a circular package dependency. Instead, the controller
 * wires the integration-service's `CreditBureauService` against the
 * {@link CREDIT_BUREAU_GATEWAY} token in `app.module.ts`.
 */

export interface ICreditBureauGateway {
  /**
   * Mirrors `CreditBureauService.queryReport` in integration-service.
   * Returns null when the bureau has no record for this national ID.
   */
  queryReport(
    nationalId: string,
    consent: boolean,
  ): Promise<{
    customerId: string;
    bureauScore: number;
    scoreRange: { min: number; max: number };
    activeLoans: number;
    totalOutstanding: string;
    defaultHistory: { count: number; totalAmount: string };
    enquiryCount: number;
    lastUpdated: Date;
    bureauType?: string;
    country?: string;
  } | null>;
}

export const CREDIT_BUREAU_GATEWAY = 'CREDIT_BUREAU_GATEWAY';

export interface CreditBureauFeatures {
  bureauScore: number;
  bureauScoreRange: { min: number; max: number };
  activeLoans: number;
  totalOutstanding: string;
  defaultCount: number;
  enquiryCount: number;
  bureauAvailable: true;
  bureauType?: string;
}

const BUREAU_TIMEOUT_MS = 10_000;

@Injectable()
export class CreditBureauFeatureExtractor {
  private readonly logger = new Logger('CreditBureauFeatureExtractor');

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(CREDIT_BUREAU_GATEWAY)
    private readonly bureau?: ICreditBureauGateway,
  ) {}

  /**
   * Pull a credit bureau report and return scoring features.
   *
   * Returns null in any of these cases (caller falls back to internal-
   * only scoring):
   *
   *  - no consent on file
   *  - no national ID on the customer record
   *  - bureau gateway not wired (controller didn't bind the provider)
   *  - bureau returns null (no record)
   *  - bureau request times out (>10s) or throws
   *
   * On success the bureau result is persisted to `customer_financial_data`
   * (source='credit_bureau') so historical scoring runs can audit it.
   */
  async extractFeatures(
    tenantId: string,
    customerId: string,
    nationalId: string | null,
    consent: boolean,
  ): Promise<CreditBureauFeatures | null> {
    if (!consent) {
      this.logger.debug(
        `Bureau skipped (no consent): customer=${customerId}`,
      );
      return null;
    }
    if (!nationalId) {
      this.logger.debug(
        `Bureau skipped (no national ID): customer=${customerId}`,
      );
      return null;
    }
    if (!this.bureau) {
      this.logger.warn(
        'Credit bureau gateway is not wired; scoring will proceed without bureau data',
      );
      return null;
    }

    try {
      const report = await Promise.race([
        this.bureau.queryReport(nationalId, consent),
        this.timeout(BUREAU_TIMEOUT_MS),
      ]);

      if (!report) {
        this.logger.log(
          `Bureau returned no record for ${maskNationalId(nationalId)}`,
        );
        return null;
      }

      // Persist for historical record.
      await this.persistBureauSnapshot(tenantId, customerId, report);

      return {
        bureauScore: report.bureauScore,
        bureauScoreRange: report.scoreRange,
        activeLoans: report.activeLoans,
        totalOutstanding: report.totalOutstanding,
        defaultCount: report.defaultHistory.count,
        enquiryCount: report.enquiryCount,
        bureauAvailable: true,
        bureauType: report.bureauType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Credit bureau unavailable for customer=${customerId} (id=${maskNationalId(nationalId)}): ${msg}`,
      );
      return null;
    }
  }

  /**
   * Persist the bureau result so subsequent scoring runs can read the
   * latest bureau score from `customer_financial_data` without going
   * back to the bureau (which costs money per query).
   */
  private async persistBureauSnapshot(
    tenantId: string,
    customerId: string,
    report: NonNullable<Awaited<ReturnType<ICreditBureauGateway['queryReport']>>>,
  ): Promise<void> {
    try {
      await this.prisma.customerFinancialData.create({
        data: {
          tenantId,
          customerId,
          source: 'credit_bureau',
          sourceProvider: report.bureauType ?? null,
          currency: 'N/A',
          rawData: report as unknown as Prisma.InputJsonValue,
          fetchedAt: new Date(),
        },
      });
    } catch (err) {
      // Persistence is best-effort — never fail scoring because of it.
      this.logger.error(
        `Failed to persist bureau snapshot for ${customerId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Credit bureau timeout (>${ms}ms)`)), ms),
    );
  }
}
