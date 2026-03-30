// scripts/load-tests/graphql-queries.js
// k6 load test for read query performance across core GraphQL queries.
// Target: p95 < 200ms, p99 < 500ms.
//
// Run:
//   k6 run scripts/load-tests/graphql-queries.js \
//     -e GQL_URL=http://localhost:3000/graphql \
//     -e TENANT_ID=<tenant-uuid> \
//     -e TEST_EMAIL=testuser@example.com \
//     -e TEST_PASSWORD=secret

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('failed_requests');
const queryDuration = new Trend('query_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    failed_requests: ['rate<0.01'],
    query_duration: ['p(95)<200', 'p(99)<500'],
  },
};

const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'testuser@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';

// Query pool -- each entry has a name, query string, and optional variables.
const QUERIES = [
  {
    name: 'customers',
    query: `
      query ListCustomers($first: Int, $after: String) {
        customers(first: $first, after: $after) {
          edges {
            node {
              id
              fullName
              phoneNumber
              status
              createdAt
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    variables: { first: 20 },
  },
  {
    name: 'contracts',
    query: `
      query ListContracts($first: Int, $after: String) {
        contracts(first: $first, after: $after) {
          edges {
            node {
              id
              status
              principalAmount
              currency
              startDate
              maturityDate
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    variables: { first: 20 },
  },
  {
    name: 'loanRequests',
    query: `
      query ListLoanRequests($first: Int, $after: String) {
        loanRequests(first: $first, after: $after) {
          edges {
            node {
              id
              status
              requestedAmount
              currency
              createdAt
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    variables: { first: 20 },
  },
  {
    name: 'products',
    query: `
      query ListProducts($first: Int, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              name
              productType
              status
              minAmount
              maxAmount
              currency
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    variables: { first: 20 },
  },
];

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

  // Pick a random query from the pool
  const entry = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  const start = Date.now();
  const res = gqlRequest(token, entry.query, entry.variables);
  const elapsed = Date.now() - start;
  queryDuration.add(elapsed);

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
    [`${entry.name}: response < 200ms`]: () => elapsed < 200,
  });

  failureRate.add(ok ? 0 : 1);

  sleep(0.2);
}
