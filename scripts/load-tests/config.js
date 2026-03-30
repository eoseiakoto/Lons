// ---------------------------------------------------------------------------
// Shared load test configuration and constants
// ---------------------------------------------------------------------------

export const ENVIRONMENTS = {
  dev: {
    gql_url: 'http://localhost:3000/graphql',
    rest_url: 'http://localhost:3001',
    scoring_url: 'http://localhost:8000',
    admin_url: 'http://localhost:3100',
  },
  staging: {
    gql_url: 'https://api-staging.lons.io/graphql',
    rest_url: 'https://api-staging.lons.io/v1',
    scoring_url: 'https://scoring-staging.lons.io',
    admin_url: 'https://admin-staging.lons.io',
  },
  preprod: {
    gql_url: 'https://api-preprod.lons.io/graphql',
    rest_url: 'https://api-preprod.lons.io/v1',
    scoring_url: 'https://scoring-preprod.lons.io',
    admin_url: 'https://admin-preprod.lons.io',
  },
  prod: {
    gql_url: 'https://api.lons.io/graphql',
    rest_url: 'https://api.lons.io/v1',
    scoring_url: 'https://scoring.lons.io',
    admin_url: 'https://admin.lons.io',
  },
};

export const SLA_THRESHOLDS = {
  // From Docs/12-non-functional.md
  overdraft_p95: 5000, // 5s in milliseconds
  microloan_p95: 5000,
  bnpl_p95: 8000, // DE-estimated internal benchmark — pending business confirmation
  factoring_p95: 10000, // DE-estimated internal benchmark — pending business confirmation
  graphql_p95: 200,
  graphql_p99: 500,
  graphql_mutations_p95: 500, // GraphQL mutations: <500ms p95
  scoring_p95: 3000,
  repayment_p95: 2000,
  reconciliation_duration: 900000, // 15 minutes in milliseconds
  error_rate: 0.001, // 0.1%
  concurrent_users: 5000,
  // Additional SLAs from Docs/12-non-functional.md §1.1
  prequal_p95: 1000, // Pre-qualification check: <1s p95
  rest_api_p95: 200, // REST API endpoints: <200ms p95
  admin_portal_p95: 2000, // O&M Portal page load: <2s p95
  report_generation_p95: 10000, // Report generation: <10s p95
};

export const PRODUCT_MIX = {
  // Distribution weights for product types
  overdraft: 0.40,
  microloan: 0.30,
  bnpl: 0.20,
  factoring: 0.10,
};

export const CONCURRENCY_PROFILES = {
  smoke: {
    description: 'Quick 1-minute sanity check',
    stages: [
      { duration: '30s', target: 5 },
      { duration: '30s', target: 0 },
    ],
  },
  load: {
    description: 'Sustained load test',
    stages: [
      { duration: '2m', target: 50 },
      { duration: '3m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  stress: {
    description: 'Ramp to breaking point',
    stages: [
      { duration: '1m', target: 100 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 1000 },
      { duration: '1m', target: 2000 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: {
    description: 'Long-running sustained load',
    stages: [
      { duration: '5m', target: 100 },
      { duration: '30m', target: 100 },
      { duration: '5m', target: 0 },
    ],
  },
  spike: {
    description: 'Sudden traffic spike',
    stages: [
      { duration: '1m', target: 100 },
      { duration: '30s', target: 5000 },
      { duration: '30s', target: 100 },
      { duration: '1m', target: 0 },
    ],
  },
};

export function getEnvironment() {
  const env = __ENV.ENVIRONMENT || 'dev';
  return ENVIRONMENTS[env] || ENVIRONMENTS.dev;
}

export function getConcurrencyProfile() {
  const profile = __ENV.PROFILE || 'load';
  return CONCURRENCY_PROFILES[profile] || CONCURRENCY_PROFILES.load;
}
