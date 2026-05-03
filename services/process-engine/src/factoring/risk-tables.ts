/**
 * Static risk-factor lookup tables for Debtor risk assessment (spec §2.3).
 *
 * v1.0 implementation: rule-based, hard-coded factors. The values
 * represent the +/- contribution applied to the neutral base score (50)
 * when computing `internalRiskScore`. Negative values increase risk,
 * positive values reduce it.
 *
 * Phase 5 will replace these with configurable / data-driven factors
 * (per-tenant overrides, ML-derived scores). The shape of the lookup
 * (string key → signed Decimal-string contribution) is intentionally
 * stable so callers don't need to change.
 */

/** Industry sector → risk-factor contribution (Decimal string). */
export const INDUSTRY_RISK_FACTORS: Readonly<Record<string, string>> = Object.freeze({
  // Lower-risk industries (stable cashflows)
  utilities: '5',
  telecom: '4',
  healthcare: '3',
  government: '5',
  // Neutral
  manufacturing: '0',
  retail: '0',
  agriculture: '0',
  // Higher-risk industries (volatile cashflows / high dispute rates)
  construction: '-5',
  hospitality: '-3',
  mining: '-4',
  cryptocurrency: '-10',
});

/** ISO-3 country code → risk-factor contribution (Decimal string). */
export const COUNTRY_RISK_FACTORS: Readonly<Record<string, string>> = Object.freeze({
  GHA: '0',
  KEN: '0',
  NGA: '-2',
  ZAF: '2',
  RWA: '1',
  TZA: '0',
  UGA: '-1',
  CIV: '-1',
  SEN: '0',
});

/** Default contribution for unknown industry/country. */
export const DEFAULT_FACTOR = '0';

export function lookupIndustryFactor(sector: string | null | undefined): string {
  if (!sector) return DEFAULT_FACTOR;
  return INDUSTRY_RISK_FACTORS[sector.toLowerCase()] ?? DEFAULT_FACTOR;
}

export function lookupCountryFactor(country: string | null | undefined): string {
  if (!country) return DEFAULT_FACTOR;
  return COUNTRY_RISK_FACTORS[country.toUpperCase()] ?? DEFAULT_FACTOR;
}
