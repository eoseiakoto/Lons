/**
 * Regression: Settlement calculation and reconciliation batch
 *
 * 1. Create contracts with completed repayments
 * 2. Calculate settlement
 * 3. Generate (approve) settlement
 * 4. Run reconciliation batch / query reconciliation runs
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

describe('Settlement & Reconciliation', () => {
  let seed: TestSeedData;
  let token: string;
  let contractId: string;
  let settlementRunId: string;

  /**
   * Originate a loan and fully repay it so there is revenue to settle.
   */
  async function originateAndRepay(): Promise<string> {
    const { data: lrData } = await graphqlRequest(
      `mutation CreateLR($input: CreateLoanRequestInput!, $key: String) {
        createLoanRequest(input: $input, idempotencyKey: $key) { id }
      }`,
      {
        input: {
          customerId: seed.customerId,
          productId: seed.productId,
          requestedAmount: 100,
          requestedTenor: 30,
          currency: 'GHS',
          channel: 'api',
        },
        key: `settle-recon-${Date.now()}`,
      },
      token,
    );
    const lrId = lrData.createLoanRequest.id;

    await graphqlRequest(
      `mutation Process($id: ID!) { processLoanRequest(loanRequestId: $id) { id status } }`,
      { id: lrId },
      token,
    );
    await graphqlRequest(
      `mutation Accept($id: ID!) { acceptOffer(loanRequestId: $id) { id status } }`,
      { id: lrId },
      token,
    );

    const { data: cData } = await graphqlRequest(
      `query Contracts($cid: String) {
        contracts(customerId: $cid) { edges { node { id } } }
      }`,
      { cid: seed.customerId },
      token,
    );
    const cid = cData.contracts.edges[0].node.id;

    // Fetch schedule and pay every entry
    const { data: sData } = await graphqlRequest(
      `query Schedule($cid: ID!) {
        repaymentSchedule(contractId: $cid) { id totalAmount }
      }`,
      { cid },
      token,
    );
    for (const entry of sData.repaymentSchedule) {
      const amt = parseFloat(entry.totalAmount);
      if (amt <= 0) continue;
      await graphqlRequest(
        `mutation Pay($cid: ID!, $amt: Float!, $cur: String!, $m: String!) {
          processRepayment(contractId: $cid, amount: $amt, currency: $cur, method: $m) { id }
        }`,
        { cid, amt, cur: 'GHS', m: 'wallet' },
        token,
      );
    }

    return cid;
  }

  beforeAll(async () => {
    seed = await seedTestData('settle-recon');
    token = await authenticateAs('admin', seed.tenantId);
    contractId = await originateAndRepay();
  });

  afterAll(async () => {
    await cleanup(['settle-recon']);
    await disconnectPrisma();
  });

  // ── Step 1: Verify repaid contract exists ───────────────────────────────

  it('should have a contract that received repayments', async () => {
    const { data, errors } = await graphqlRequest(
      `query Repayments($cid: ID!) {
        repayments(contractId: $cid) { totalCount }
      }`,
      { cid: contractId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.repayments.totalCount).toBeGreaterThanOrEqual(1);
  });

  // ── Step 2: Calculate settlement for the period ─────────────────────────

  it('should calculate a settlement run', async () => {
    const periodStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
    const periodEnd = new Date().toISOString();

    const { data, errors } = await graphqlRequest(
      `mutation CalcSettlement($start: String!, $end: String!) {
        calculateSettlement(periodStart: $start, periodEnd: $end) {
          id
          status
          totalRevenue
          lines {
            id
            partyType
            grossRevenue
            shareAmount
          }
        }
      }`,
      { start: periodStart, end: periodEnd },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.calculateSettlement).toBeDefined();
    expect(data.calculateSettlement.id).toBeDefined();
    settlementRunId = data.calculateSettlement.id;
    expect(data.calculateSettlement.status).toBeDefined();
  });

  // ── Step 3: Approve (generate) the settlement ──────────────────────────

  it('should approve the settlement run', async () => {
    const { data, errors } = await graphqlRequest(
      `mutation ApproveSettlement($runId: ID!) {
        approveSettlement(runId: $runId) {
          id
          status
          approvedBy
          approvedAt
        }
      }`,
      { runId: settlementRunId },
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.approveSettlement).toBeDefined();
    expect(['approved', 'completed']).toContain(data.approveSettlement.status);
    expect(data.approveSettlement.approvedAt).toBeDefined();
  });

  // ── Step 4: Query settlement runs list ──────────────────────────────────

  it('should list settlement runs for the tenant', async () => {
    const { data, errors } = await graphqlRequest(
      `query Settlements {
        settlementRuns {
          edges {
            node {
              id
              status
              totalRevenue
            }
          }
          totalCount
        }
      }`,
      {},
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.settlementRuns.totalCount).toBeGreaterThanOrEqual(1);
  });

  // ── Step 5: Query reconciliation runs ───────────────────────────────────

  it('should query reconciliation runs without error', async () => {
    const { data, errors } = await graphqlRequest(
      `query ReconRuns {
        reconciliationRuns {
          edges {
            node {
              id
              runDate
              status
              matchRate
              totalTxns
              matchedTxns
              exceptionCount
            }
          }
        }
      }`,
      {},
      token,
    );

    expect(errors).toBeUndefined();
    expect(data.reconciliationRuns).toBeDefined();
    expect(data.reconciliationRuns.edges).toBeDefined();
  });
});
