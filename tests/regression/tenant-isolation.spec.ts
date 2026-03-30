/**
 * Regression: Tenant data isolation
 *
 * 1. Create two tenants (A and B) with their own data
 * 2. As tenant A, query customers -- verify no tenant B data
 * 3. As tenant B, query contracts -- verify no tenant A data
 * 4. Attempt cross-tenant access -- verify rejection
 */
import {
  prisma,
  graphqlRequest,
  authenticateAs,
  seedTestData,
  cleanup,
  disconnectPrisma,
  TestSeedData,
} from './setup';

describe('Tenant Isolation', () => {
  let seedA: TestSeedData;
  let seedB: TestSeedData;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    seedA = await seedTestData('tenant-a');
    seedB = await seedTestData('tenant-b');
    tokenA = await authenticateAs('admin', seedA.tenantId);
    tokenB = await authenticateAs('admin', seedB.tenantId);
  });

  afterAll(async () => {
    await cleanup(['tenant-a', 'tenant-b']);
    await disconnectPrisma();
  });

  // ── Step 1: Verify both tenants have their own customers ────────────────

  it('should have distinct customers per tenant', async () => {
    const { data: dataA } = await graphqlRequest(
      `query Customers { customers { edges { node { id } } totalCount } }`,
      {},
      tokenA,
    );

    const { data: dataB } = await graphqlRequest(
      `query Customers { customers { edges { node { id } } totalCount } }`,
      {},
      tokenB,
    );

    expect(dataA.customers.totalCount).toBeGreaterThanOrEqual(1);
    expect(dataB.customers.totalCount).toBeGreaterThanOrEqual(1);

    const idsA = dataA.customers.edges.map((e: any) => e.node.id);
    const idsB = dataB.customers.edges.map((e: any) => e.node.id);

    // No overlap between the two sets
    const overlap = idsA.filter((id: string) => idsB.includes(id));
    expect(overlap.length).toBe(0);
  });

  // ── Step 2: Tenant A cannot see tenant B's customer ─────────────────────

  it('should not return tenant B customer when querying as tenant A', async () => {
    const { data, errors } = await graphqlRequest(
      `query Customer($id: ID!) {
        customer(id: $id) { id }
      }`,
      { id: seedB.customerId },
      tokenA,
    );

    // Depending on implementation, this should either return null or an error
    const customerMissing =
      (errors && errors.length > 0) || !data.customer || data.customer === null;
    expect(customerMissing).toBe(true);
  });

  // ── Step 3: Tenant B cannot see tenant A's products ─────────────────────

  it('should not return tenant A products when querying as tenant B', async () => {
    const { data, errors } = await graphqlRequest(
      `query Product($id: ID!) {
        product(id: $id) { id }
      }`,
      { id: seedA.productId },
      tokenB,
    );

    const productMissing =
      (errors && errors.length > 0) || !data.product || data.product === null;
    expect(productMissing).toBe(true);
  });

  // ── Step 4: Tenant A contracts list has no tenant B data ────────────────

  it('should return only tenant A contracts for tenant A token', async () => {
    const { data, errors } = await graphqlRequest(
      `query Contracts {
        contracts {
          edges { node { id } }
          totalCount
        }
      }`,
      {},
      tokenA,
    );

    expect(errors).toBeUndefined();
    // Even if zero contracts, no tenant-B IDs should appear
    if (data.contracts.totalCount > 0) {
      // Cross-check: none of these contract IDs belong to tenant B
      for (const edge of data.contracts.edges) {
        const contractRow = await (prisma as any).contract.findUnique({
          where: { id: edge.node.id },
          select: { tenantId: true },
        });
        if (contractRow) {
          expect(contractRow.tenantId).toBe(seedA.tenantId);
        }
      }
    }
  });

  // ── Step 5: Tenant B contracts list has no tenant A data ────────────────

  it('should return only tenant B contracts for tenant B token', async () => {
    const { data, errors } = await graphqlRequest(
      `query Contracts {
        contracts {
          edges { node { id } }
          totalCount
        }
      }`,
      {},
      tokenB,
    );

    expect(errors).toBeUndefined();
    if (data.contracts.totalCount > 0) {
      for (const edge of data.contracts.edges) {
        const contractRow = await (prisma as any).contract.findUnique({
          where: { id: edge.node.id },
          select: { tenantId: true },
        });
        if (contractRow) {
          expect(contractRow.tenantId).toBe(seedB.tenantId);
        }
      }
    }
  });

  // ── Step 6: Cross-tenant loan request creation is rejected ──────────────

  it('should reject creating a loan request with another tenant customer', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation CreateLR($input: CreateLoanRequestInput!, $key: String) {
        createLoanRequest(input: $input, idempotencyKey: $key) { id status }
      }`,
      {
        input: {
          customerId: seedB.customerId, // Tenant B customer
          productId: seedA.productId, // Tenant A product
          requestedAmount: 100,
          currency: 'GHS',
          channel: 'api',
        },
        key: `cross-tenant-${Date.now()}`,
      },
      tokenA, // Authenticated as tenant A
    );

    // This should fail — either via a GraphQL error or by returning null
    const failed = (errors && errors.length > 0) || !data?.createLoanRequest;
    expect(failed).toBe(true);
  });
});
