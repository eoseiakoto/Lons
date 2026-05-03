import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  IScreeningAdapter,
  IScreeningInput,
  IScreeningResult,
  IScreeningMatch,
  ScreeningMatchType,
} from './screening.interface';
import { CircuitBreaker } from '../resilience/circuit-breaker';

/**
 * ComplyAdvantage screening adapter.
 *
 * Integrates with the ComplyAdvantage Search API to screen customers against
 * global sanctions lists, PEP databases, and adverse media sources.
 *
 * NOTE: This is a structural stub. HTTP calls use a pluggable httpPost function
 * so the adapter can be tested without real API keys. In production the default
 * httpPost uses fetch(). In tests or when no API key is configured, it falls
 * back to returning empty results.
 */

interface ComplyAdvantageSearchResponse {
  code: number;
  status: string;
  content: {
    data: {
      id: number;
      ref: string;
      searcher_id: number;
      assignee_id: number;
      filters: Record<string, unknown>;
      match_status: string;
      risk_level: string;
      search_term: string;
      total_hits: number;
      created_at: string;
      updated_at: string;
      hits: ComplyAdvantageHit[];
    };
  };
}

interface ComplyAdvantageHit {
  doc: {
    aka: Array<{ name: string }>;
    entity_type: string;
    fields: Array<{
      name: string;
      source: string;
      value: string;
      tag?: string;
    }>;
    id: string;
    last_updated_utc: string;
    name: string;
    sources: string[];
    types: string[];
  };
  match_types: string[];
  score: number;
}

export type HttpPostFn = (url: string, body: unknown, headers: Record<string, string>) => Promise<unknown>;

@Injectable()
export class ComplyAdvantageAdapter implements IScreeningAdapter {
  private readonly logger = new Logger('ComplyAdvantageAdapter');
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.complyadvantage.com';
  private readonly fuzziness: number;
  private readonly timeoutMs = 10_000;
  private readonly httpPost: HttpPostFn;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly configService: ConfigService,
    httpPost?: HttpPostFn,
  ) {
    this.apiKey = this.configService.get<string>('COMPLYADVANTAGE_API_KEY', '');
    this.fuzziness = parseFloat(this.configService.get<string>('SCREENING_FUZZINESS', '0.6'));

    // Allow injection of a custom HTTP function for testing
    this.httpPost = httpPost ?? this.defaultHttpPost.bind(this);

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 1,
    });
  }

  async screenCustomer(input: IScreeningInput): Promise<IScreeningResult> {
    if (!this.apiKey) {
      this.logger.warn('No ComplyAdvantage API key configured; returning CLEAR stub result');
      return this.buildStubClearResult(input);
    }

    const searchPayload = {
      search_term: input.fullName,
      fuzziness: this.fuzziness,
      filters: {
        country_codes: [input.country],
        ...(input.dateOfBirth ? { birth_year: new Date(input.dateOfBirth).getFullYear() } : {}),
        types: ['sanction', 'pep', 'adverse-media', 'warning'],
      },
      share_url: 1,
    };

    try {
      const response = (await this.circuitBreaker.execute(() =>
        this.httpPost(
          `${this.baseUrl}/searches`,
          searchPayload,
          {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        ),
      )) as ComplyAdvantageSearchResponse;

      return this.mapResponse(input, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ComplyAdvantage screening failed: ${message}`);

      return {
        customerId: input.customerId,
        tenantId: input.tenantId,
        screeningId: `ca-err-${randomUUID().slice(0, 8)}`,
        status: 'ERROR',
        riskLevel: 'HIGH',
        matches: [],
        provider: 'complyadvantage',
        screenedAt: new Date(),
        rawResponse: { error: message },
      };
    }
  }

  async getScreeningStatus(screeningId: string): Promise<IScreeningResult | null> {
    if (!this.apiKey) {
      this.logger.warn('No API key configured for status lookup');
      return null;
    }

    try {
      const response = (await this.circuitBreaker.execute(() =>
        this.httpPost(
          `${this.baseUrl}/searches/${screeningId}`,
          null,
          {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        ),
      )) as ComplyAdvantageSearchResponse;

      return this.mapResponse(
        {
          customerId: '',
          tenantId: '',
          fullName: response.content.data.search_term,
          country: '',
        },
        response,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get screening status: ${message}`);
      return null;
    }
  }

  getProviderName(): string {
    return 'complyadvantage';
  }

  private mapResponse(
    input: IScreeningInput,
    response: ComplyAdvantageSearchResponse,
  ): IScreeningResult {
    const data = response.content.data;
    const matches = this.mapHitsToMatches(data.hits ?? []);
    const hasExactMatch = matches.some((m) => m.matchScore >= 90);
    const hasPotentialMatch = matches.length > 0;

    let status: IScreeningResult['status'];
    let riskLevel: IScreeningResult['riskLevel'];

    if (hasExactMatch) {
      status = 'MATCH';
      riskLevel = 'CRITICAL';
    } else if (hasPotentialMatch) {
      status = 'POTENTIAL_MATCH';
      riskLevel = matches.some((m) =>
        m.matchType === ScreeningMatchType.SANCTIONS,
      )
        ? 'HIGH'
        : 'MEDIUM';
    } else {
      status = 'CLEAR';
      riskLevel = 'LOW';
    }

    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId: String(data.id || data.ref),
      status,
      riskLevel,
      matches,
      provider: 'complyadvantage',
      screenedAt: new Date(data.created_at || Date.now()),
      rawResponse: response as unknown as Record<string, unknown>,
    };
  }

  private mapHitsToMatches(hits: ComplyAdvantageHit[]): IScreeningMatch[] {
    return hits.map((hit) => {
      const matchType = this.resolveMatchType(hit.doc.types);

      return {
        matchId: String(hit.doc.id),
        matchType,
        entityName: hit.doc.name,
        matchScore: Math.round(hit.score * 100),
        source: (hit.doc.sources ?? []).join(', ') || 'ComplyAdvantage',
        details: {
          entityType: hit.doc.entity_type,
          types: hit.doc.types,
          matchTypes: hit.match_types,
          aliases: hit.doc.aka?.map((a) => a.name) ?? [],
          lastUpdated: hit.doc.last_updated_utc,
        },
      };
    });
  }

  private resolveMatchType(types: string[]): ScreeningMatchType {
    const joined = (types ?? []).join(',').toLowerCase();

    if (joined.includes('sanction')) return ScreeningMatchType.SANCTIONS;
    if (joined.includes('pep')) return ScreeningMatchType.PEP;
    if (joined.includes('adverse') || joined.includes('media')) return ScreeningMatchType.ADVERSE_MEDIA;
    return ScreeningMatchType.WATCHLIST;
  }

  private buildStubClearResult(input: IScreeningInput): IScreeningResult {
    return {
      customerId: input.customerId,
      tenantId: input.tenantId,
      screeningId: `ca-stub-${randomUUID().slice(0, 8)}`,
      status: 'CLEAR',
      riskLevel: 'LOW',
      matches: [],
      provider: 'complyadvantage',
      screenedAt: new Date(),
      rawResponse: { stub: true, reason: 'no_api_key' },
    };
  }

  private async defaultHttpPost(
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: body === null ? 'GET' : 'POST',
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`ComplyAdvantage API returned ${response.status}: ${text}`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
