import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  IScreeningAdapter,
  IScreeningInput,
  IScreeningResult,
  IScreeningMatch,
  ScreeningMatchType,
} from './screening.interface';

/**
 * Deterministic mock screening adapter for development and testing.
 *
 * Behavior:
 *  - Name containing "SANCTIONS" (case-insensitive) -> MATCH with SANCTIONS type
 *  - Name containing "PEP"       -> POTENTIAL_MATCH with PEP type
 *  - Name containing "ADVERSE"   -> POTENTIAL_MATCH with ADVERSE_MEDIA type
 *  - All other names             -> CLEAR
 */
@Injectable()
export class MockScreeningAdapter implements IScreeningAdapter {
  private readonly logger = new Logger('MockScreeningAdapter');
  private readonly results = new Map<string, IScreeningResult>();

  async screenCustomer(input: IScreeningInput): Promise<IScreeningResult> {
    // P1-003: customer's full name is PII and never logged in cleartext.
    this.logger.log(`[MOCK] Screening customer ${input.customerId}`);

    const screeningId = `mock-scr-${randomUUID().slice(0, 12)}`;
    const upperName = input.fullName.toUpperCase();

    let result: IScreeningResult;

    if (upperName.includes('SANCTIONS')) {
      result = this.buildSanctionsMatch(input, screeningId);
    } else if (upperName.includes('PEP')) {
      result = this.buildPepMatch(input, screeningId);
    } else if (upperName.includes('ADVERSE')) {
      result = this.buildAdverseMediaMatch(input, screeningId);
    } else {
      result = this.buildClearResult(input, screeningId);
    }

    this.results.set(screeningId, result);
    return result;
  }

  async getScreeningStatus(screeningId: string): Promise<IScreeningResult | null> {
    return this.results.get(screeningId) ?? null;
  }

  getProviderName(): string {
    return 'mock';
  }

  private deterministicScore(name: string, seed: string): number {
    const hash = createHash('sha256').update(`${name}:${seed}`).digest('hex');
    return 60 + (parseInt(hash.slice(0, 4), 16) % 40); // 60-99
  }

  private buildSanctionsMatch(input: IScreeningInput, screeningId: string): IScreeningResult {
    const score = this.deterministicScore(input.fullName, 'sanctions');
    const match: IScreeningMatch = {
      matchId: `match-${randomUUID().slice(0, 8)}`,
      matchType: ScreeningMatchType.SANCTIONS,
      entityName: input.fullName,
      matchScore: score,
      source: 'OFAC SDN List',
      details: {
        listType: 'SDN',
        program: 'SDGT',
        country: input.country,
        remarks: 'Mock sanctions match for testing',
      },
    };

    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId,
      status: 'MATCH',
      riskLevel: 'CRITICAL',
      matches: [match],
      provider: 'mock',
      screenedAt: new Date(),
      rawResponse: { mock: true, trigger: 'SANCTIONS_NAME' },
    };
  }

  private buildPepMatch(input: IScreeningInput, screeningId: string): IScreeningResult {
    const score = this.deterministicScore(input.fullName, 'pep');
    const match: IScreeningMatch = {
      matchId: `match-${randomUUID().slice(0, 8)}`,
      matchType: ScreeningMatchType.PEP,
      entityName: input.fullName,
      matchScore: score,
      source: 'World PEP Database',
      details: {
        position: 'Government Official',
        country: input.country,
        level: 'National',
        remarks: 'Mock PEP match for testing',
      },
    };

    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId,
      status: 'POTENTIAL_MATCH',
      riskLevel: 'HIGH',
      matches: [match],
      provider: 'mock',
      screenedAt: new Date(),
      rawResponse: { mock: true, trigger: 'PEP_NAME' },
    };
  }

  private buildAdverseMediaMatch(input: IScreeningInput, screeningId: string): IScreeningResult {
    const score = this.deterministicScore(input.fullName, 'adverse');
    const match: IScreeningMatch = {
      matchId: `match-${randomUUID().slice(0, 8)}`,
      matchType: ScreeningMatchType.ADVERSE_MEDIA,
      entityName: input.fullName,
      matchScore: score,
      source: 'Global Adverse Media Archive',
      details: {
        mediaType: 'news_article',
        publishedDate: '2024-01-15',
        headline: 'Mock adverse media article for testing',
        country: input.country,
      },
    };

    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId,
      status: 'POTENTIAL_MATCH',
      riskLevel: 'MEDIUM',
      matches: [match],
      provider: 'mock',
      screenedAt: new Date(),
      rawResponse: { mock: true, trigger: 'ADVERSE_NAME' },
    };
  }

  private buildClearResult(input: IScreeningInput, screeningId: string): IScreeningResult {
    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId,
      status: 'CLEAR',
      riskLevel: 'LOW',
      matches: [],
      provider: 'mock',
      screenedAt: new Date(),
      rawResponse: { mock: true, trigger: 'CLEAR' },
    };
  }
}
