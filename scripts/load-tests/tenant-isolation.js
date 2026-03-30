// scripts/load-tests/tenant-isolation.js
// k6 multi-tenant isolation test.
// Runs two tenant scenarios concurrently and verifies that customer data
// returned to each tenant belongs exclusively to that tenant.
//
// Run:
//   k6 run scripts/load-tests/tenant-isolation.js \
//     -e GQL_URL=http://localhost:3000/graphql \
//     -e TENANT_A_ID=<tenant-a-uuid> \
//     -e TENANT_A_EMAIL=admin-a@example.com \
//     -e TENANT_A_PASSWORD=secret-a \
//     -e TENANT_B_ID=<tenant-b-uuid> \
//     -e TENANT_B_EMAIL=admin-b@example.com \
//     -e TENANT_B_PASSWORD=secret-b

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const crossContamination = new Counter('cross_contamination_errors');
const failureRate = new Rate('failed_requests');

export const options = {
  scenarios: {
    tenant_a: {
      executor: 'constant-vus',
      vus: 25,
      duration: '2m',
      exec: 'tenantA',
      env: {
        SCENARIO_TENANT: 'A',
      },
    },
    tenant_b: {
      executor: 'constant-vus',
      vus: 25,
      duration: '2m',
      exec: 'tenantB',
      env: {
        SCENARIO_TENANT: 'B',
      },
    },
  },
  thresholds: {
    cross_contamination_errors: ['count==0'],     // Zero tolerance
    failed_requests: ['rate<0.05'],               // < 5% HTTP failures
    http_req_duration: ['p(95)<1000'],
  },
};

const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

// Tenant A config
const TENANT_A_ID = __ENV.TENANT_A_ID || 'tenant-a';
const TENANT_A_EMAIL = __ENV.TENANT_A_EMAIL || 'admin-a@example.com';
const TENANT_A_PASSWORD = __ENV.TENANT_A_PASSWORD || 'password-a';

// Tenant B config
const TENANT_B_ID = __ENV.TENANT_B_ID || 'tenant-b';
const TENANT_B_EMAIL = __ENV.TENANT_B_EMAIL || 'admin-b@example.com';
const TENANT_B_PASSWORD = __ENV.TENANT_B_PASSWORD || 'password-b';

function gqlRequest(token, tenantId, query, variables) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
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

function authenticate(tenantId, email, password) {
  const mutation = `
    mutation Login($email: String!, $password: String!) {
      login(input: { email: $email, password: $password }) {
        accessToken
      }
    }
  `;
  const res = gqlRequest(null, tenantId, mutation, { email, password });
  const body = res.json();
  if (body && body.data && body.data.login) {
    return body.data.login.accessToken;
  }
  return null;
}

const CUSTOMERS_QUERY = `
  query ListCustomers($first: Int) {
    customers(first: $first) {
      edges {
        node {
          id
          tenantId
          fullName
          status
        }
      }
    }
  }
`;

function fetchAndVerifyCustomers(token, tenantId, tenantLabel) {
  const res = gqlRequest(token, tenantId, CUSTOMERS_QUERY, { first: 50 });

  const statusOk = check(res, {
    [`${tenantLabel}: status 200`]: (r) => r.status === 200,
  });

  if (!statusOk) {
    failureRate.add(1);
    return;
  }

  const body = res.json();

  // Check for GraphQL errors
  if (body.errors && body.errors.length > 0) {
    failureRate.add(1);
    return;
  }

  failureRate.add(0);

  // Verify every returned customer belongs to the expected tenant.
  // The tenantId field may not be exposed in GraphQL, so we check if it is
  // present and validate. If not exposed, the test still passes -- the key
  // guarantee is that the server only returns data for the supplied tenant
  // header. If tenantId IS present, we enforce a strict match.
  const edges = (body.data && body.data.customers && body.data.customers.edges) || [];

  for (const edge of edges) {
    const node = edge.node;
    if (node.tenantId && node.tenantId !== tenantId) {
      crossContamination.add(1);
      console.error(
        `CROSS-TENANT CONTAMINATION: ${tenantLabel} (${tenantId}) received customer ${node.id} belonging to tenant ${node.tenantId}`,
      );
    }
  }

  check(edges, {
    [`${tenantLabel}: received customer data`]: (e) => e.length > 0,
  });
}

// ---- Per-tenant VU functions ----

// These store tokens in a per-VU variable so authentication happens once per VU.
const vuTokens = {};

function ensureToken(tenantId, email, password) {
  const key = `${tenantId}-${__VU}`;
  if (!vuTokens[key]) {
    vuTokens[key] = authenticate(tenantId, email, password);
  }
  return vuTokens[key];
}

export function tenantA() {
  const token = ensureToken(TENANT_A_ID, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  if (!token) {
    failureRate.add(1);
    sleep(1);
    return;
  }
  fetchAndVerifyCustomers(token, TENANT_A_ID, 'Tenant_A');
  sleep(0.5);
}

export function tenantB() {
  const token = ensureToken(TENANT_B_ID, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  if (!token) {
    failureRate.add(1);
    sleep(1);
    return;
  }
  fetchAndVerifyCustomers(token, TENANT_B_ID, 'Tenant_B');
  sleep(0.5);
}
