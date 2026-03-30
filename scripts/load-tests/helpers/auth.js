// ---------------------------------------------------------------------------
// Shared authentication helper for k6 load tests
// ---------------------------------------------------------------------------

import http from 'k6/http';
import { check } from 'k6';

const TOKEN_CACHE = {};

/**
 * Get or create a JWT token for the given tenant.
 * Tokens are cached per VU to avoid re-authentication on every request.
 *
 * @param {string} baseUrl - REST API base URL
 * @param {string} tenantId - Tenant identifier
 * @param {string} username - Username (default: generated)
 * @param {string} password - Password (default: test-password)
 * @returns {string} JWT access token
 */
export function getAuthToken(baseUrl, tenantId, username, password) {
  // Cache key per VU per tenant
  const cacheKey = `${__VU}-${tenantId}`;

  if (TOKEN_CACHE[cacheKey]) {
    return TOKEN_CACHE[cacheKey];
  }

  const loginPayload = JSON.stringify({
    username: username || `test-user-${tenantId}-${__VU}`,
    password: password || 'test-password-123',
    tenantId: tenantId,
  });

  const loginRes = http.post(`${baseUrl}/v1/auth/login`, loginPayload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
    },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    TOKEN_CACHE[cacheKey] = body.accessToken;
    return body.accessToken;
  }

  throw new Error(`Failed to authenticate: ${loginRes.status}`);
}

/**
 * Get default headers with JWT token and tenant context.
 *
 * @param {string} token - JWT access token
 * @param {string} tenantId - Tenant identifier
 * @returns {object} HTTP headers object
 */
export function getAuthHeaders(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  };
}

/**
 * Get GraphQL headers with JWT token and tenant context.
 *
 * @param {string} token - JWT access token
 * @param {string} tenantId - Tenant identifier
 * @returns {object} HTTP headers object
 */
export function getGraphQLHeaders(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  };
}

/**
 * Clear the auth token cache (useful for test reset).
 */
export function clearAuthCache() {
  Object.keys(TOKEN_CACHE).forEach((key) => delete TOKEN_CACHE[key]);
}
