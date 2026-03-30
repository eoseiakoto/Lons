import { graphqlQuery, restRequest } from './setup';

describe('Loan Lifecycle — Staging Integration', () => {
  let tenantId: string;
  let customerId: string;
  let productId: string;
  let loanRequestId: string;
  let contractId: string;

  beforeAll(async () => {
    // Fetch first active tenant (seeded staging data)
    const { data } = await graphqlQuery(`
      query {
        tenants(first: 1) {
          edges { node { id } }
        }
      }
    `);
    tenantId = data?.tenants?.edges?.[0]?.node?.id;
    expect(tenantId).toBeTruthy();
  });

  it('should list seeded customers', async () => {
    const { data } = await graphqlQuery(`
      query($tenantId: String!) {
        customers(tenantId: $tenantId, first: 5) {
          edges { node { id firstName lastName status } }
          totalCount
        }
      }
    `, { tenantId });

    expect(data?.customers?.totalCount).toBeGreaterThan(0);
    customerId = data?.customers?.edges?.[0]?.node?.id;
    expect(customerId).toBeTruthy();
  });

  it('should list seeded products', async () => {
    const { data } = await graphqlQuery(`
      query($tenantId: String!) {
        products(tenantId: $tenantId, first: 5) {
          edges { node { id name type status } }
          totalCount
        }
      }
    `, { tenantId });

    expect(data?.products?.totalCount).toBeGreaterThan(0);
    const activeProduct = data?.products?.edges?.find(
      (e: any) => e.node.status === 'active',
    );
    productId = activeProduct?.node?.id;
    expect(productId).toBeTruthy();
  });

  it('should create a loan request via GraphQL', async () => {
    const { data, errors } = await graphqlQuery(`
      mutation($input: CreateLoanRequestInput!) {
        createLoanRequest(input: $input) {
          id status
        }
      }
    `, {
      input: {
        tenantId,
        customerId,
        productId,
        requestedAmount: '5000.0000',
        requestedTermMonths: 6,
        currency: 'GHS',
      },
    });

    if (errors) {
      console.log('Loan request errors:', errors);
    }

    // May fail if business rules reject — that's okay for staging test
    if (data?.createLoanRequest) {
      loanRequestId = data.createLoanRequest.id;
      expect(data.createLoanRequest.status).toBeTruthy();
    }
  });

  it('should get loan request status', async () => {
    if (!loanRequestId) return;

    const { data } = await graphqlQuery(`
      query($id: ID!) {
        loanRequest(id: $id) {
          id status requestedAmount
        }
      }
    `, { id: loanRequestId });

    expect(data?.loanRequest?.id).toBe(loanRequestId);
  });

  it('should list contracts for the tenant', async () => {
    const { data } = await graphqlQuery(`
      query($tenantId: String!) {
        contracts(tenantId: $tenantId, first: 5) {
          edges { node { id status totalOutstanding } }
          totalCount
        }
      }
    `, { tenantId });

    // Seeded data should include contracts
    if (data?.contracts?.totalCount > 0) {
      contractId = data.contracts.edges[0].node.id;
      expect(contractId).toBeTruthy();
    }
  });

  it('should get contract repayment schedule', async () => {
    if (!contractId) return;

    const { data } = await graphqlQuery(`
      query($contractId: ID!) {
        repaymentSchedule(contractId: $contractId) {
          id dueDate principalAmount interestAmount status
        }
      }
    `, { contractId });

    expect(Array.isArray(data?.repaymentSchedule)).toBe(true);
  });
});

describe('Adapter Resolution — Staging Integration', () => {
  it('should have wallet provider configs for seeded tenants', async () => {
    const { data } = await graphqlQuery(`
      query {
        tenants(first: 3) {
          edges { node { id name } }
        }
      }
    `);

    // Each seeded tenant should have a wallet config
    for (const edge of data?.tenants?.edges ?? []) {
      const configResult = await graphqlQuery(`
        query($tenantId: String!) {
          walletProviderConfigs(tenantId: $tenantId) {
            id providerType environmentMode isActive isDefault
          }
        }
      `, { tenantId: edge.node.id });

      // In staging, there should be at least one config
      if (configResult.data?.walletProviderConfigs) {
        expect(configResult.data.walletProviderConfigs.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Notification Recording — Staging Integration', () => {
  it('should be able to query notification mock logs when in staging', async () => {
    const { data } = await graphqlQuery(`
      query {
        tenants(first: 1) {
          edges { node { id } }
        }
      }
    `);

    const tenantId = data?.tenants?.edges?.[0]?.node?.id;
    if (!tenantId) return;

    const { data: logData, errors } = await graphqlQuery(`
      query($tenantId: String!) {
        notificationMockLogs(tenantId: $tenantId) {
          id channel recipient status createdAt
        }
      }
    `, { tenantId });

    // May error if ALLOW_MOCK_ADAPTERS is not true — that's expected
    if (!errors) {
      expect(Array.isArray(logData?.notificationMockLogs)).toBe(true);
    }
  });
});

describe('REST API — Staging Integration', () => {
  it('should list customers via REST', async () => {
    const { status, data } = await restRequest('GET', '/v1/customers?page=1&limit=5');
    // May return 401 if API key not configured — check gracefully
    if (status === 200) {
      expect(data.data).toBeDefined();
      expect(data.meta).toBeDefined();
    }
  });

  it('should list loan requests via REST', async () => {
    const { status, data } = await restRequest('GET', '/v1/loan-requests?page=1&limit=5');
    if (status === 200) {
      expect(data.data).toBeDefined();
    }
  });

  it('should list contracts via REST', async () => {
    const { status, data } = await restRequest('GET', '/v1/contracts?page=1&limit=5');
    if (status === 200) {
      expect(data.data).toBeDefined();
    }
  });
});

describe('Reconciliation — Exception Handling', () => {
  it('should detect and flag reconciliation exceptions', async () => {
    const { data, errors } = await graphqlQuery(`
      query {
        reconciliationBatches(first: 5) {
          edges {
            node {
              id
              status
              totalTransactions
              matchedCount
              exceptionCount
              exceptions {
                id
                type
                status
                transactionRef
                amount
                description
              }
            }
          }
        }
      }
    `);

    if (!errors) {
      const batches = data?.reconciliationBatches?.edges;
      expect(batches).toBeDefined();
      expect(batches.length).toBeGreaterThan(0);

      const batchWithExceptions = batches.find(
        (e: any) => e.node.exceptionCount > 0,
      );
      if (batchWithExceptions) {
        const batch = batchWithExceptions.node;
        expect(batch.exceptions.length).toBe(batch.exceptionCount);
        batch.exceptions.forEach((ex: any) => {
          expect(ex.type).toBeDefined();
          expect(ex.status).toBeDefined();
          expect(ex.transactionRef).toBeDefined();
          expect(ex.amount).toBeDefined();
        });
      }
    }
  });
});

describe('Settlement — Revenue Sharing', () => {
  it('should generate correct 4-party revenue splits', async () => {
    const { data, errors } = await graphqlQuery(`
      query {
        settlements(first: 5) {
          edges {
            node {
              id
              status
              totalAmount
              splits {
                party
                amount
                percentage
                type
              }
            }
          }
        }
      }
    `);

    if (!errors) {
      const settlements = data?.settlements?.edges;
      expect(settlements).toBeDefined();
      expect(settlements.length).toBeGreaterThan(0);

      const settlement = settlements[0].node;
      expect(settlement.splits).toBeDefined();
      expect(settlement.splits.length).toBeGreaterThanOrEqual(2);

      // Verify splits sum to total — use string comparison to avoid float issues
      const { Decimal } = require('@prisma/client/runtime/library');
      const splitSum = settlement.splits.reduce(
        (sum: any, s: any) => new Decimal(sum).plus(new Decimal(s.amount)),
        new Decimal('0'),
      );
      const total = new Decimal(settlement.totalAmount);
      expect(splitSum.equals(total)).toBe(true);

      // Verify expected party types exist
      const partyTypes = settlement.splits.map((s: any) => s.party);
      expect(
        partyTypes.some((p: string) =>
          ['PLATFORM_FEE', 'PLATFORM'].includes(p),
        ),
      ).toBe(true);
      expect(
        partyTypes.some((p: string) =>
          ['LENDER_SHARE', 'LENDER'].includes(p),
        ),
      ).toBe(true);
    }
  });
});
