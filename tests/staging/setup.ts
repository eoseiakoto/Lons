// Staging integration test setup
// These tests run against a live staging environment

export const STAGING_BASE_URL = process.env.STAGING_BASE_URL ?? 'http://localhost:3000';
export const REST_BASE_URL = process.env.REST_BASE_URL ?? 'http://localhost:3001';
export const API_KEY = process.env.TEST_API_KEY ?? 'test-api-key';
export const API_SECRET = process.env.TEST_API_SECRET ?? 'test-api-secret';

export async function graphqlQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`${STAGING_BASE_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function restRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const res = await fetch(`${REST_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-API-Secret': API_SECRET,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    data: await res.json(),
  };
}
