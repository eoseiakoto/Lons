// scripts/load-tests/graphql-mutations.js
// k6 load test for mutation performance across core GraphQL mutations.
// Target: p95 < 500ms, p99 < 1s.
//
// Run:
//   k6 run scripts/load-tests/graphql-mutations.js \
//     -e GQL_URL=http://localhost:3000/graphql \
//     -e TENANT_ID=<tenant-uuid> \
//     -e TEST_EMAIL=testuser@example.com \
//     -e TEST_PASSWORD=secret

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('failed_requests');
const mutationDuration = new Trend('mutation_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    failed_requests: ['rate<0.01'],
    mutation_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'testuser@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';

// Mutation pool -- each entry has a name, mutation string, and optional variables.
// In a real load test, variables would be generated dynamically from previous responses.
const MUTATIONS = [
  {
    name: 'createCustomer',
    mutation: `
      mutation CreateCustomer($input: ICreateCustomerInput!) {
        createCustomer(input: $input) {
          id
          fullName
          phoneNumber
          email
          status
          createdAt
        }
      }
    `,
    variablesGenerator: () => ({
      input: {
        fullName: `Test User ${Date.now()}`,
        phoneNumber: `+233${Math.floor(Math.random() * 10000000000)}`,
        email: `test-${Date.now()}@example.com`,
      },
    }),
  },
  {
    name: 'createLoanRequest',
    mutation: `
      mutation CreateLoanRequest($input: ICreateLoanRequestInput!) {
        createLoanRequest(input: $input) {
          id
          customerId
          productId
          requestedAmount
          currency
          status
          createdAt
        }
      }
    `,
    variablesGenerator: () => ({
      input: {
        customerId: 'cust-123', // Would be from setup or VU data store
        productId: 'prod-overdraft-001',
        requestedAmount: '500.00',
        currency: 'GHS',
      },
    }),
  },
  {
    name: 'acceptOffer',
    mutation: `
      mutation AcceptOffer($input: IAcceptOfferInput!) {
        acceptOffer(input: $input) {
          id
          status
          offerId
          acceptedAt
          contractId
        }
      }
    `,
    variablesGenerator: () => ({
      input: {
        offerId: 'offer-123', // Would be from setup or VU data store
        termsAccepted: true,
      },
    }),
  },
  {
    name: 'processRepayment',
    mutation: `
      mutation ProcessRepayment($input: IProcessRepaymentInput!) {
        processRepayment(input: $input) {
          id
          status
          contractId
          amountPaid
          allocations {
            principal
            interest
            fees
          }
          processingDate
        }
      }
    `,
    variablesGenerator: () => ({
      input: {
        contractId: 'contract-123', // Would be from setup or VU data store
        amount: '250.00',
        paymentMethod: 'WALLET',
      },
    }),
  },
];

function gqlRequest(token, mutation, variables) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return http.post(
    GQL_URL,
    JSON.stringify({ query: mutation, variables }),
    { headers },
  );
}

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

  // Pick a random mutation from the pool
  const entry = MUTATIONS[Math.floor(Math.random() * MUTATIONS.length)];
  const variables = entry.variablesGenerator();

  const start = Date.now();
  const res = gqlRequest(token, entry.mutation, variables);
  const elapsed = Date.now() - start;
  mutationDuration.add(elapsed);

  const ok = check(res, {
    [`${entry.name}: status 200`]: (r) => r.status === 200,
    [`${entry.name}: no errors`]: (r) => {
      const body = r.json();
      return !body.errors || body.errors.length === 0;
    },
    [`${entry.name}: has data`]: (r) => {
      const body = r.json();
      return body.data !== null && body.data !== undefined;
    },
    [`${entry.name}: response < 500ms`]: () => elapsed < 500,
  });

  failureRate.add(ok ? 0 : 1);

  sleep(0.2);
}
