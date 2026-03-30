/**
 * Regression: Authentication flows
 *
 * 1. Login with valid credentials
 * 2. Login with invalid credentials (verify rejection)
 * 3. Refresh token
 * 4. Change password (weak password rejected, strong password accepted)
 * 5. Verify token expiry handling
 */
import {
  graphqlRequest,
  seedTestData,
  cleanup,
  disconnectPrisma,
  TestSeedData,
} from './setup';

describe('Auth Flows', () => {
  let seed: TestSeedData;
  let accessToken: string;
  let refreshTokenValue: string;

  beforeAll(async () => {
    seed = await seedTestData('auth-flows');
  });

  afterAll(async () => {
    await cleanup(['auth-flows']);
    await disconnectPrisma();
  });

  // ── Step 1: Login with valid credentials ────────────────────────────────

  it('should login with valid tenant user credentials', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation Login($tenantId: String!, $email: String!, $password: String!) {
        loginTenantUser(tenantId: $tenantId, email: $email, password: $password) {
          accessToken
          refreshToken
        }
      }`,
      {
        tenantId: seed.tenantId,
        email: 'admin@lons-test.io',
        password: 'Test!Passw0rd#Regr',
      },
    );

    expect(errors).toBeUndefined();
    expect(data.loginTenantUser).toBeDefined();
    expect(data.loginTenantUser.accessToken).toBeTruthy();
    expect(data.loginTenantUser.refreshToken).toBeTruthy();

    accessToken = data.loginTenantUser.accessToken;
    refreshTokenValue = data.loginTenantUser.refreshToken;
  });

  // ── Step 2: Login with invalid credentials ──────────────────────────────

  it('should reject login with wrong password', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation Login($tenantId: String!, $email: String!, $password: String!) {
        loginTenantUser(tenantId: $tenantId, email: $email, password: $password) {
          accessToken
          refreshToken
        }
      }`,
      {
        tenantId: seed.tenantId,
        email: 'admin@lons-test.io',
        password: 'wr0ngP@ssword!',
      },
    );

    // Should receive an error
    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
  });

  it('should reject login with non-existent email', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation Login($tenantId: String!, $email: String!, $password: String!) {
        loginTenantUser(tenantId: $tenantId, email: $email, password: $password) {
          accessToken
          refreshToken
        }
      }`,
      {
        tenantId: seed.tenantId,
        email: 'nonexistent@lons-test.io',
        password: 'Test!Passw0rd#Regr',
      },
    );

    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
  });

  // ── Step 3: Refresh token ───────────────────────────────────────────────

  it('should refresh tokens using a valid refresh token', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation Refresh($refreshToken: String!) {
        refreshToken(refreshToken: $refreshToken) {
          accessToken
          refreshToken
        }
      }`,
      { refreshToken: refreshTokenValue },
    );

    expect(errors).toBeUndefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.refreshToken.accessToken).toBeTruthy();
    expect(data.refreshToken.refreshToken).toBeTruthy();

    // Use new tokens for subsequent tests
    accessToken = data.refreshToken.accessToken;
    refreshTokenValue = data.refreshToken.refreshToken;
  });

  it('should reject refresh with an invalid refresh token', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation Refresh($refreshToken: String!) {
        refreshToken(refreshToken: $refreshToken) {
          accessToken
          refreshToken
        }
      }`,
      { refreshToken: 'invalid-refresh-token-value' },
    );

    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
  });

  // ── Step 4: Change password ─────────────────────────────────────────────

  it('should reject a weak new password', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation ChangePass($currentPassword: String!, $newPassword: String!) {
        changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
      }`,
      {
        currentPassword: 'Test!Passw0rd#Regr',
        newPassword: '123', // Too weak
      },
      accessToken,
    );

    // Should be rejected by validation
    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThan(0);
  });

  it('should accept a strong new password', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation ChangePass($currentPassword: String!, $newPassword: String!) {
        changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
      }`,
      {
        currentPassword: 'Test!Passw0rd#Regr',
        newPassword: 'N3wStr0ng!P@ss#2026',
      },
      accessToken,
    );

    expect(errors).toBeUndefined();
    expect(data.changePassword).toBe(true);

    // Change it back so the seed user remains usable
    await graphqlRequest(
      `mutation ChangePass($currentPassword: String!, $newPassword: String!) {
        changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
      }`,
      {
        currentPassword: 'N3wStr0ng!P@ss#2026',
        newPassword: 'Test!Passw0rd#Regr',
      },
      accessToken,
    );
  });

  // ── Step 5: Token expiry handling ───────────────────────────────────────

  it('should reject requests with an expired / invalid token', async () => {
    const expiredToken =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIxMjM0NTY3ODkwIiwidGVuYW50SWQiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.' +
      'invalid-signature';

    const { data, errors } = await graphqlRequest(
      `query Customers { customers { totalCount } }`,
      {},
      expiredToken,
    );

    // The server should reject this with an authentication error
    const rejected =
      (errors && errors.length > 0) ||
      !data?.customers;
    expect(rejected).toBe(true);
  });

  it('should reject requests with no token on protected queries', async () => {
    const { data, errors } = await graphqlRequest(
      `query Customers { customers { totalCount } }`,
      {},
      // No token provided
    );

    const rejected =
      (errors && errors.length > 0) ||
      !data?.customers;
    expect(rejected).toBe(true);
  });
});
