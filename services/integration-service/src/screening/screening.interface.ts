/**
 * AML/Sanctions Screening Adapter Interface
 *
 * Defines the contract for screening providers (ComplyAdvantage, mock, etc.)
 * used to check customers against sanctions lists, PEP databases, and
 * adverse media sources.
 */

export enum ScreeningMatchType {
  SANCTIONS = 'SANCTIONS',
  PEP = 'PEP',
  ADVERSE_MEDIA = 'ADVERSE_MEDIA',
  WATCHLIST = 'WATCHLIST',
}

export interface IScreeningInput {
  customerId: string;
  tenantId: string;
  fullName: string;
  dateOfBirth?: string;
  nationalId?: string;
  country: string;
  additionalNames?: string[];
}

export interface IScreeningMatch {
  matchId: string;
  matchType: ScreeningMatchType;
  entityName: string;
  /** Confidence score from 0 (no match) to 100 (exact match) */
  matchScore: number;
  source: string;
  details?: Record<string, unknown>;
}

export interface IScreeningResult {
  customerId: string;
  tenantId: string;
  screeningId: string;
  status: 'CLEAR' | 'MATCH' | 'POTENTIAL_MATCH' | 'ERROR';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  matches: IScreeningMatch[];
  provider: string;
  screenedAt: Date;
  rawResponse?: Record<string, unknown>;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewDecision?: string;
  customer?: {
    id: string;
    fullName?: string | null;
    phonePrimary?: string | null;
    externalId?: string | null;
    country?: string | null;
    kycLevel?: string | null;
    status?: string | null;
  };
}

export interface IScreeningAdapter {
  /**
   * Screen a customer against sanctions lists, PEP databases, and adverse media.
   */
  screenCustomer(input: IScreeningInput): Promise<IScreeningResult>;

  /**
   * Retrieve the status of a previously initiated screening by its external ID.
   */
  getScreeningStatus(screeningId: string): Promise<IScreeningResult | null>;

  /**
   * Return the name of this screening provider (e.g. "mock", "complyadvantage").
   */
  getProviderName(): string;
}

export const SCREENING_ADAPTER = 'SCREENING_ADAPTER';
