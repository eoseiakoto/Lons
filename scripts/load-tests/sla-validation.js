// ---------------------------------------------------------------------------
// SLA Validation Suite
//
// Combined test that runs all scenarios and validates against SLAs from
// Docs/12-non-functional.md.
//
// Run:
//   k6 run scripts/load-tests/sla-validation.js \
//     -e ENVIRONMENT=dev \
//     -e PROFILE=load
// ---------------------------------------------------------------------------

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { getEnvironment, SLA_THRESHOLDS, PRODUCT_MIX } from './config.js';
import { getAuthToken, getAuthHeaders, getGraphQLHeaders } from './helpers/auth.js';
import {
  generateGhanaianCustomer,
  generateLoanRequest,
} from './helpers/data-generators.js';

const env = getEnvironment();

// Aggregate metrics
const overdraftP95 = new Trend('overdraft_p95');
const microloanP95 = new Trend('microloan_p95');
const bnplP95 = new Trend('bnpl_p95');
const factoringP95 = new Trend('factoring_p95');
const graphqlP95 = new Trend('graphql_p95');
const repaymentP95 = new Trend('repayment_p95');

const errorRate = new Rate('overall_error_rate');
const successCount = new Counter('successful_operations');
const failureCount = new Counter('failed_operations');

export const options = {
  stages: [
    // Warm-up
    { duration: '2m', target: 100 },
    // Sustained load
    { duration: '5m', target: 500 },
    // Spike to peak capacity
    { duration: '1m', target: 2000 },
    { duration: '1m', target: 5000 },
    // Sustained at peak
    { duration: '3m', target: 5000 },
    // Cool-down
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // Application pipeline
    'overdraft_p95': [`p(95)<${SLA_THRESHOLDS.overdraft_p95}`],
    'microloan_p95': [`p(95)<${SLA_THRESHOLDS.microloan_p95}`],
    'bnpl_p95': [`p(95)<${SLA_THRESHOLDS.bnpl_p95}`],
    'factoring_p95': [`p(95)<${SLA_THRESHOLDS.factoring_p95}`],
    // Read queries
    'graphql_p95': [`p(95)<${SLA_THRESHOLDS.graphql_p95}`],
    // Repayment processing
    'repayment_p95': [`p(95)<${SLA_THRESHOLDS.repayment_p95}`],
    // Error rate
    'overall_error_rate': [`rate<${SLA_THRESHOLDS.error_rate}`],
  },
};

function selectProductType() {
  const rand = Math.random();
  if (rand < PRODUCT_MIX.overdraft) return 'overdraft';
  if (rand < PRODUCT_MIX.overdraft + PRODUCT_MIX.microloan) return 'microloan';
  if (rand < PRODUCT_MIX.overdraft + PRODUCT_MIX.microloan + PRODUCT_MIX.bnpl) return 'bnpl';
  return 'factoring';
}

function getMetricTrend(productType) {
  const trends = {
    overdraft: overdraftP95,
    microloan: microloanP95,
    bnpl: bnplP95,
    factoring: factoringP95,
  };
  return trends[productType] || microloanP95;
}

export default function () {
  const tenantId = `tenant-${(__VU % 100) + 1}`.padStart(8, '0');
  const productType = selectProductType();
  const trend = getMetricTrend(productType);

  let success = false;
  const startTime = new Date();

  try {
    const token = getAuthToken(env.rest_url, tenantId);
    const headers = getAuthHeaders(token, tenantId);

    // Loan application flow (simplified for SLA validation)
    group(`${productType} Application`, () => {
      const request = generateLoanRequest(productType);
      const payload = JSON.stringify(request);
      const res = http.post(`${env.rest_url}/v1/loan-requests`, payload, { headers });

      success = check(res, {
        'application created': (r) => r.status === 201 || r.status === 200,
      });

      if (success) {
        successCount.add(1);
      } else {
        failureCount.add(1);
        errorRate.add(1);
      }
    });

    if (success) {
      const duration = new Date() - startTime;
      trend.add(duration);
    }

    sleep(0.5);

    // GraphQL query performance
    group('GraphQL Query', () => {
      const gqlStart = new Date();
      const query = JSON.stringify({
        query: `{ customers(first: 25) { edges { node { id firstName } } } }`,
      });

      const gqlRes = http.post(env.gql_url, query, {
        headers: getGraphQLHeaders(token, tenantId),
      });

      const gqlSuccess = check(gqlRes, {
        'graphql 200': (r) => r.status === 200,
      });

      const gqlDuration = new Date() - gqlStart;
      graphqlP95.add(gqlDuration);

      if (!gqlSuccess) {
        errorRate.add(1);
      }
    });

    sleep(0.3);

    // Simulated repayment transaction
    group('Repayment Processing', () => {
      const repayStart = new Date();
      const repayPayload = JSON.stringify({
        amount: '1000.00',
        currency: 'GHS',
        method: 'wallet',
      });

      const repayRes = http.post(`${env.rest_url}/v1/repayments`, repayPayload, { headers });

      const repaySuccess = check(repayRes, {
        'repayment processed': (r) => r.status === 200 || r.status === 201 || r.status === 202,
      });

      const repayDuration = new Date() - repayStart;
      repaymentP95.add(repayDuration);

      if (!repaySuccess) {
        errorRate.add(1);
      }
    });
  } catch (e) {
    failureCount.add(1);
    errorRate.add(1);
    console.error(`VU ${__VU} error: ${e.message}`);
  }

  sleep(1);
}
