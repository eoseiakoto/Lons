// scripts/load-tests/repayment-processing.js
// k6 load test for repayment processing throughput.
// Target: 500 transactions per minute sustained.
//
// Run:
//   k6 run scripts/load-tests/repayment-processing.js \
//     -e GQL_URL=http://localhost:3000/graphql \
//     -e TENANT_ID=<tenant-uuid> \
//     -e TEST_EMAIL=testuser@example.com \
//     -e TEST_PASSWORD=secret \
//     -e CONTRACT_ID=<contract-uuid>

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const failureRate = new Rate('failed_requests');
const processedPayments = new Counter('processed_payments');
const paymentDuration = new Trend('payment_duration', true);

export const options = {
  scenarios: {
    repayment_throughput: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],             // p95 < 500ms
    failed_requests: ['rate<0.01'],               // < 1% failure
    payment_duration: ['p(95)<500'],
  },
};

const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'testuser@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';
const CONTRACT_ID = __ENV.CONTRACT_ID || 'test-contract-id';

function gqlRequest(token, query, variables) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return http.post(
    GQL_URL,
    JSON.stringify({ query, variables }),
    { headers },
  );
}

// Authenticate once during setup and share the token across VUs.
export function setup() {
  const mutation = `
    mutation Login($email: String!, $password: String!) {
      login(input: { email: $email, password: $password }) {
        accessToken
      }
    }
  `;
  const res = gqlRequest(null, mutation, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  const body = res.json();
  if (body && body.data && body.data.login) {
    return { token: body.data.login.accessToken };
  }
  console.error('Setup authentication failed. Tests will run without a valid token.');
  return { token: null };
}

export default function (data) {
  const token = data.token;

  const mutation = `
    mutation ProcessPayment($input: ProcessPaymentInput!) {
      processPayment(input: $input) {
        id
        status
        allocatedAmount
        remainingBalance
      }
    }
  `;

  // Generate amounts between 10 and 500 for realistic variation
  const amount = (Math.random() * 490 + 10).toFixed(4);

  const variables = {
    input: {
      contractId: CONTRACT_ID,
      amount: amount,
      currency: 'GHS',
      paymentMethod: 'WALLET',
      externalReference: `k6-repay-${__VU}-${__ITER}-${Date.now()}`,
      idempotencyKey: `k6-repay-${__VU}-${__ITER}-${Date.now()}`,
    },
  };

  const start = Date.now();
  const res = gqlRequest(token, mutation, variables);
  const elapsed = Date.now() - start;
  paymentDuration.add(elapsed);

  const ok = check(res, {
    'payment status 200': (r) => r.status === 200,
    'no GraphQL errors': (r) => {
      const body = r.json();
      return !body.errors || body.errors.length === 0;
    },
    'payment processed': (r) => {
      const body = r.json();
      return body.data && body.data.processPayment && body.data.processPayment.id;
    },
    'response time < 500ms': () => elapsed < 500,
  });

  if (ok) {
    processedPayments.add(1);
    failureRate.add(0);
  } else {
    failureRate.add(1);
  }
}
