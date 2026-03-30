// scripts/load-tests/loan-application.js
// k6 load test for the full loan application flow.
//
// Run:
//   k6 run scripts/load-tests/loan-application.js \
//     -e GQL_URL=http://localhost:3000/graphql \
//     -e TENANT_ID=<tenant-uuid> \
//     -e TEST_EMAIL=testuser@example.com \
//     -e TEST_PASSWORD=secret \
//     -e CUSTOMER_ID=<customer-uuid> \
//     -e PRODUCT_ID=<product-uuid>

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('failed_requests');
const loanRequestDuration = new Trend('loan_request_duration', true);

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'],           // p95 < 10s
    failed_requests: ['rate<0.01'],               // < 1% failure
    loan_request_duration: ['p(95)<10000'],
  },
};

const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'testuser@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';
const CUSTOMER_ID = __ENV.CUSTOMER_ID || 'test-customer-id';
const PRODUCT_ID = __ENV.PRODUCT_ID || 'test-product-id';

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

function authenticate() {
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
    return body.data.login.accessToken;
  }
  return null;
}

export default function () {
  let token = null;

  group('1. Authenticate', () => {
    token = authenticate();
    check(token, {
      'obtained auth token': (t) => t !== null && t !== undefined,
    });
    if (!token) {
      failureRate.add(1);
      return;
    }
  });

  if (!token) {
    sleep(1);
    return;
  }

  let loanRequestId = null;

  group('2. Create loan request', () => {
    const mutation = `
      mutation CreateLoanRequest($input: CreateLoanRequestInput!) {
        createLoanRequest(input: $input) {
          id
          status
        }
      }
    `;
    const variables = {
      input: {
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        requestedAmount: '5000.00',
        currency: 'GHS',
        purpose: 'Load test loan application',
        idempotencyKey: `k6-loan-${__VU}-${__ITER}-${Date.now()}`,
      },
    };

    const start = Date.now();
    const res = gqlRequest(token, mutation, variables);
    loanRequestDuration.add(Date.now() - start);

    const ok = check(res, {
      'create loan status 200': (r) => r.status === 200,
      'no GraphQL errors': (r) => {
        const body = r.json();
        return !body.errors || body.errors.length === 0;
      },
      'loan request id returned': (r) => {
        const body = r.json();
        return body.data && body.data.createLoanRequest && body.data.createLoanRequest.id;
      },
    });

    if (ok) {
      const body = res.json();
      loanRequestId = body.data.createLoanRequest.id;
      failureRate.add(0);
    } else {
      failureRate.add(1);
    }
  });

  group('3. Check loan request result', () => {
    if (!loanRequestId) {
      failureRate.add(1);
      return;
    }

    // Brief pause for async processing
    sleep(0.5);

    const query = `
      query GetLoanRequest($id: ID!) {
        loanRequest(id: $id) {
          id
          status
          scoringResult {
            score
            decision
          }
        }
      }
    `;

    const res = gqlRequest(token, query, { id: loanRequestId });
    const ok = check(res, {
      'fetch loan request status 200': (r) => r.status === 200,
      'loan request found': (r) => {
        const body = r.json();
        return body.data && body.data.loanRequest && body.data.loanRequest.id === loanRequestId;
      },
    });

    failureRate.add(ok ? 0 : 1);
  });

  sleep(1);
}
