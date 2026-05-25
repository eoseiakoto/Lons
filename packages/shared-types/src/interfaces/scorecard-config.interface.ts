/**
 * Tenant-uploadable scoring configuration. Persisted as JSON in
 * `scorecard_configs.config` and consumed by the process-engine scoring
 * service. Lives in shared-types so the database package (seed) and the
 * process-engine can both depend on it without forming a cycle.
 */
export interface ScorecardConfig {
  version: string;
  scoreRange: { min: number; max: number };
  factors: ScorecardFactor[];
  riskTiers: { tier: string; minScore: number }[];
  limitBands: { minScore: number; maxScore: number; limitMultiplier: string }[];
}

export interface ScorecardFactor {
  name: string;
  weight: number;
  bands: { min: number; max: number | null; points: number }[];
}
