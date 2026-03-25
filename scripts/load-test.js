import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const GQL_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

export default function () {
  // REST health check
  const healthRes = http.get(`${BASE_URL}/v1/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 200ms': (r) => r.timings.duration < 200,
  });

  // GraphQL query
  const gqlRes = http.post(GQL_URL, JSON.stringify({
    query: '{ __typename }',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(gqlRes, {
    'graphql status is 200': (r) => r.status === 200,
    'graphql response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
