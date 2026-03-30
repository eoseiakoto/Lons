/**
 * Regression: Full loan origination lifecycle
 *
 * 1. Create customer
 * 2. Create loan request
 * 3. Check loan request status
 * 4. Process (score + approve + generate offer)
 * 5. Accept offer
 * 6. Verify contract created
 * 7. Check disbursement
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

describe('Loan Lifecycle — Full Origination', () => {
  let seed: TestSeedData;
  let token: string;
  let loanRequestId: string;
  let contractId: string;

  beforeAll(async () => {
    seed = await seedTestData('loan-lifecycle');
    token = await authenticateAs('admin', seed.tenantId);
  });

  afterAll(async () => {
    await cleanup(['loan-lifecycle']);
    await disconnectPrisma();
  });

  // ── Step 1: Verify customer exists (seeded) ────────────────────────────

  it('should retrieve the seeded customer', async () => {
    const { data, errors } = await graphqlRequest(
      `query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          status
          kycLevel
        }
      }`,
      { id: seed.customerId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.customer).toBeDefined();
    expect(data.customer.id).toBe(seed.customerId);
    expect(data.customer.status).toBe('active');
    expect(data.customer.kycLevel).toBe('full');
  });

  // ── Step 2: Create loan request ─────────────────────────────────────────

  it('should create a loan request', async () => {
    const idempotencyKey = `regr-loan-lifecycle-${Date.now()}`;
    const { data, errors } = await graphqlRequest(
      `mutation CreateLR($input: CreateLoanRequestInput!, $key: String) {
        createLoanRequest(input: $input, idempotencyKey: $key) {
          id
          status
          requestedAmount
          currency
        }
      }`,
      {
        input: {
          customerId: seed.customerId,
          productId: seed.productId,
          requestedAmount: 500,
          requestedTenor: 30,
          currency: 'GHS',
          channel: 'api',
        },
        key: idempotencyKey,
      },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.createLoanRequest).toBeDefined();
    expect(data.createLoanRequest.status).toBe('pending');
    loanRequestId = data.createLoanRequest.id;
  });

  // ── Step 3: Check loan request status ───────────────────────────────────

  it('should return the loan request with pending status', async () => {
    const { data, errors } = await graphqlRequest(
      `query GetLR($id: ID!) {
        loanRequest(id: $id) {
          id
          status
        }
      }`,
      { id: loanRequestId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.loanRequest.id).toBe(loanRequestId);
    expect(data.loanRequest.status).toBe('pending');
  });

  // ── Step 4: Process loan request (score + approve + offer) ──────────────

  it('should process the loan request through scoring and approval', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation ProcessLR($loanRequestId: ID!) {
        processLoanRequest(loanRequestId: $loanRequestId) {
          id
          status
        }
      }`,
      { loanRequestId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.processLoanRequest).toBeDefined();
    // After full processing the status should be offer_generated or approved
    expect(['offer_generated', 'approved', 'scored']).toContain(data.processLoanRequest.status);
  });

  // ── Step 5: Accept offer ────────────────────────────────────────────────

  it('should accept the offer and create a contract', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation AcceptOffer($loanRequestId: ID!) {
        acceptOffer(loanRequestId: $loanRequestId) {
          id
          status
        }
      }`,
      { loanRequestId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.acceptOffer).toBeDefined();
    expect(['accepted', 'disbursed', 'active']).toContain(data.acceptOffer.status);
  });

  // ── Step 6: Verify contract created ─────────────────────────────────────

  it('should have created a contract linked to the customer', async () => {
    const { data, errors } = await graphqlRequest(
      `query Contracts($customerId: String) {
        contracts(customerId: $customerId) {
          edges {
            node {
              id
              status
            }
          }
          totalCount
        }
      }`,
      { customerId: seed.customerId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.contracts.totalCount).toBeGreaterThanOrEqual(1);

    const contract = data.contracts.edges[0].node;
    contractId = contract.id;
    expect(contract.status).toBeDefined();
  });

  // ── Step 7: Verify disbursement ─────────────────────────────────────────

  it('should have a contract with disbursement status or active', async () => {
    const { data, errors } = await graphqlRequest(
      `query Contract($id: ID!) {
        contract(id: $id) {
          id
          status
        }
      }`,
      { id: contractId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.contract).toBeDefined();
    // Contract should be active or disbursed depending on mock adapter speed
    expect(['active', 'disbursed', 'pending_disbursement']).toContain(data.contract.status);
  });

  // ── Step 8: Verify repayment schedule was generated ─────────────────────

  it('should have a repayment schedule for the contract', async () => {
    const { data, errors } = await graphqlRequest(
      `query Schedule($contractId: ID!) {
        repaymentSchedule(contractId: $contractId) {
          id
          dueDate
          principalAmount
          interestAmount
          totalAmount
          status
        }
      }`,
      { contractId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.repaymentSchedule).toBeDefined();
    expect(data.repaymentSchedule.length).toBeGreaterThanOrEqual(1);

    const firstEntry = data.repaymentSchedule[0];
    expect(firstEntry.dueDate).toBeDefined();
    expect(firstEntry.totalAmount).toBeDefined();
  });
});
