import { Injectable, Optional } from '@nestjs/common';
import { PrismaService, Prisma, ScoringModelType, ScoringContext, ContractStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { calculateScore, ScoringInput } from './scorecard/scorecard-engine';
import { DEFAULT_SCORECARD } from './scorecard/default-scorecard';
import { ScorecardConfigService } from './scorecard/scorecard-config.service';
import { CreditBureauFeatureExtractor } from './credit-bureau-feature.extractor';
import {
  aggregateCustomFactors,
  normalizeBureauScore,
} from './feature-normalizer';

// Re-export the default scorecard so existing callers can keep importing
// it from `scoring.service` (back-compat).
export { DEFAULT_SCORECARD };

const KYC_NUMERIC: Record<string, number> = {
  none: 0,
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
};

/**
 * S17-3 confidence flag stored under `inputFeatures._metadata` so that
 * downstream analytics / underwriting can see at a glance which data
 * sources contributed to the score.
 */
type ConfidenceFlag = 'full' | 'partial_no_bureau' | 'partial_no_emi' | 'minimal';

interface ScoringMetadata {
  dataCompleteness: ConfidenceFlag;
  bureauAvailable: boolean;
  emiDataAge: number | null; // hours since last EMI snapshot
  scoredAt: string;
  /** Fraction (0-1) of scorecard features that had real data (not fallback). */
  dataCompletenessRatio: number;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    // S17-4 — optional so tests that construct ScoringService manually
    // still work; the production wiring always provides it.
    @Optional() private readonly scorecardConfigService?: ScorecardConfigService,
    @Optional() private readonly bureauExtractor?: CreditBureauFeatureExtractor,
    // S17 review fix — emit SCORING_COMPLETED so the entity-service
    // credit-summary cache invalidates on a fresh score.
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  async scoreCustomer(
    tenantId: string,
    customerId: string,
    productId: string,
    context: 'application' | 'review' | 'renewal' | 'monitoring',
    requestedAmount: string,
  ) {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, tenantId },
    });

    // ── 1. Internal features (always available) ──────────────────────
    const { features, emiDataAgeHours, emiPresent } = await this.gatherFeatures(
      tenantId,
      customerId,
      customer,
    );

    // ── 2. Credit-bureau features (best-effort) ──────────────────────
    let bureauPresent = false;
    if (this.bureauExtractor) {
      const consent = await this.hasCreditReportingConsent(tenantId, customerId);
      const bureauFeatures = await this.bureauExtractor.extractFeatures(
        tenantId,
        customerId,
        customer.nationalId,
        consent,
      );
      if (bureauFeatures) {
        bureauPresent = true;
        // Normalise to 0-100 before feeding into the scorecard band.
        features.credit_bureau_score = normalizeBureauScore(
          bureauFeatures.bureauScore,
          bureauFeatures.bureauScoreRange,
        );
      }
    }

    // ── 3. Resolve scorecard (product → tenant → hardcoded) ──────────
    const scorecard = this.scorecardConfigService
      ? await this.scorecardConfigService.getActiveScorecard(tenantId, productId)
      : DEFAULT_SCORECARD;

    // ── 4. Score ─────────────────────────────────────────────────────
    const result = calculateScore(scorecard, features, requestedAmount);

    // ── 5. Metadata (confidence flag) ────────────────────────────────
    const metadata: ScoringMetadata = {
      dataCompleteness: this.deriveConfidenceFlag(emiPresent, bureauPresent),
      bureauAvailable: bureauPresent,
      emiDataAge: emiDataAgeHours,
      scoredAt: new Date().toISOString(),
      dataCompletenessRatio: this.computeCompletenessRatio(features, emiPresent, bureauPresent),
    };
    const featuresWithMeta = { ...features, _metadata: metadata as unknown as ScoringInput[string] };

    const scoringResult = await this.prisma.scoringResult.create({
      data: {
        tenantId,
        modelType: ScoringModelType.rule_based,
        modelVersion: scorecard.version,
        score: Number(result.score),
        scoreRangeMin: scorecard.scoreRange.min,
        scoreRangeMax: scorecard.scoreRange.max,
        probabilityDefault: null,
        riskTier: result.riskTier as 'low' | 'medium' | 'high' | 'critical',
        recommendedLimit: Number(result.recommendedLimit),
        contributingFactors: result.contributingFactors as unknown as Prisma.InputJsonValue,
        inputFeatures: featuresWithMeta as unknown as Prisma.InputJsonValue,
        confidence: Number(result.confidence),
        context: context as ScoringContext,
        customer: { connect: { id: customerId } },
        product: { connect: { id: productId } },
      },
    });

    // S17 review fix — drop credit-summary cache so the next read
    // reflects the new score/risk tier rather than the prior TTL window.
    this.eventBus?.emitAndBuild(
      EventType.SCORING_COMPLETED,
      tenantId,
      { customerId, productId, scoringResultId: scoringResult.id, riskTier: result.riskTier },
    );

    return scoringResult;
  }

  /**
   * Pull internal + EMI + custom-factor features for a customer.
   *
   * - Internal: account age, KYC, payment history, existing debt
   * - EMI (S17-1): transaction_frequency, income_consistency, average_balance
   * - Custom factors (S17-5): aggregated 0-100 score
   *
   * Returns the features plus metadata about EMI freshness so the
   * caller can compute the confidence flag.
   */
  private async gatherFeatures(
    tenantId: string,
    customerId: string,
    customer: { createdAt: Date; kycLevel: string },
  ): Promise<{
    features: ScoringInput;
    emiDataAgeHours: number | null;
    emiPresent: boolean;
  }> {
    const accountAgeDays = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Payment history: % of on-time payments from past contracts
    const completedContracts = await this.prisma.contract.findMany({
      where: { tenantId, customerId, status: ContractStatus.settled },
      select: { id: true },
    });

    let paymentHistoryPct = 50; // Neutral for new customers
    if (completedContracts.length > 0) {
      const totalScheduleEntries = await this.prisma.repaymentScheduleEntry.count({
        where: { contractId: { in: completedContracts.map((c) => c.id) }, tenantId },
      });
      const onTimeEntries = await this.prisma.repaymentScheduleEntry.count({
        where: { contractId: { in: completedContracts.map((c) => c.id) }, tenantId, status: 'paid' },
      });
      paymentHistoryPct = totalScheduleEntries > 0 ? Math.round((onTimeEntries / totalScheduleEntries) * 100) : 50;
    }

    // Existing debt: count active contracts
    const activeContracts = await this.prisma.contract.count({
      where: { tenantId, customerId, status: { in: ['active', 'performing', 'due', 'overdue'] } },
    });
    const existingDebtRatio = Math.min(activeContracts * 25, 100); // Simple proxy

    // ── S17-1: Live EMI features (pulled from customer_financial_data) ──
    const latestEmi = await this.prisma.customerFinancialData.findFirst({
      where: { tenantId, customerId, source: 'emi' },
      orderBy: { fetchedAt: 'desc' },
    });

    let transactionFrequency = 15; // fallback for customers with no EMI data
    let incomeConsistency = 60; // fallback
    let averageBalance: number | null = null;
    let emiPresent = false;
    let emiDataAgeHours: number | null = null;

    if (latestEmi) {
      emiPresent = true;
      transactionFrequency = latestEmi.transactionCount30d ?? 15;
      incomeConsistency = latestEmi.incomeConsistency ?? 60;
      averageBalance = latestEmi.averageBalance30d
        ? Number(latestEmi.averageBalance30d)
        : null;
      emiDataAgeHours =
        (Date.now() - latestEmi.fetchedAt.getTime()) / (1000 * 60 * 60);
    }

    // ── S17-5: Credit bureau score (preferred from latest bureau pull,
    //    will be overwritten by live bureau extractor in scoreCustomer
    //    when consent is present and the bureau is reachable). ────────
    const latestBureau = await this.prisma.customerFinancialData.findFirst({
      where: { tenantId, customerId, source: 'credit_bureau' },
      orderBy: { fetchedAt: 'desc' },
    });
    let creditBureauScore: number | null = null;
    let customFactorScore: number | null = null;
    if (latestBureau?.rawData) {
      const raw = latestBureau.rawData as Record<string, unknown>;
      if (typeof raw.bureauScore === 'number') {
        const range = raw.scoreRange as { min: number; max: number } | undefined;
        creditBureauScore = range
          ? normalizeBureauScore(raw.bureauScore, range)
          : raw.bureauScore;
      }
    }
    if (latestEmi?.rawData) {
      const raw = latestEmi.rawData as Record<string, unknown>;
      if (raw.customFactors && typeof raw.customFactors === 'object') {
        customFactorScore = aggregateCustomFactors(
          raw.customFactors as Record<string, unknown>,
        );
      }
    }

    const features: ScoringInput = {
      account_age_days: accountAgeDays,
      kyc_level: KYC_NUMERIC[customer.kycLevel] ?? 0,
      payment_history_pct: paymentHistoryPct,
      transaction_frequency: transactionFrequency,
      existing_debt_ratio: existingDebtRatio,
      income_consistency: incomeConsistency,
      // S17-5 new factors. Null entries fall through to band-0 (10 pts)
      // when the scorecard weight is non-zero; with default weight=0
      // they never contribute, so back-compat is preserved.
      average_balance: averageBalance,
      credit_bureau_score: creditBureauScore,
      custom_factors: customFactorScore,
    };

    return { features, emiDataAgeHours, emiPresent };
  }

  private async hasCreditReportingConsent(
    tenantId: string,
    customerId: string,
  ): Promise<boolean> {
    const consent = await this.prisma.customerConsent.findFirst({
      where: {
        tenantId,
        customerId,
        consentType: 'credit_reporting',
        granted: true,
        revokedAt: null,
      },
    });
    return !!consent;
  }

  private deriveConfidenceFlag(
    emiPresent: boolean,
    bureauPresent: boolean,
  ): ConfidenceFlag {
    if (emiPresent && bureauPresent) return 'full';
    if (!emiPresent && bureauPresent) return 'partial_no_emi';
    if (emiPresent && !bureauPresent) return 'partial_no_bureau';
    return 'minimal';
  }

  /**
   * Fraction of scorecard features that had real data (not fallback).
   * Three "EMI/bureau-derived" features count toward completeness when
   * their source signal is present.
   */
  private computeCompletenessRatio(
    features: ScoringInput,
    emiPresent: boolean,
    bureauPresent: boolean,
  ): number {
    // Internal features (3) are always real once a customer exists.
    let real = 3; // account_age_days, kyc_level, payment_history_pct
    real += 1; // existing_debt_ratio is always real (derived from DB)
    if (emiPresent) {
      real += 2; // transaction_frequency, income_consistency
      if (features.average_balance !== null && features.average_balance !== undefined) real += 1;
      if (features.custom_factors !== null && features.custom_factors !== undefined) real += 1;
    }
    if (bureauPresent && features.credit_bureau_score !== null && features.credit_bureau_score !== undefined) {
      real += 1;
    }
    const total = 9; // 6 original + 3 new (S17-5)
    return Math.round((real / total) * 100) / 100;
  }
}
