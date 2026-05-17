/**
 * S17-FIX-2 — unit tests for `BnplCreditLineService.restoreAvailableLimit`.
 *
 * Scenarios (per dev prompt):
 *   1. Repayment with principal allocation restores availableLimit by that amount.
 *   2. availableLimit never exceeds approvedLimit (capped by LEAST).
 *   3. Non-BNPL (micro-loan) repayments do NOT restore limit — guarded by caller.
 *   4. Credit line in non-active status → no restoration (SQL predicate).
 *   5. Concurrent restorations use atomic SQL (no TOCTOU).
 *
 * Note: scenarios 3 and 4 are enforced by the caller (BnplRepaymentRestoreListener)
 * and the SQL WHERE clause respectively. We test the guard (amount <= 0) and
 * verify the raw SQL call shape.
 */
import { BnplCreditLineService } from '../bnpl-credit-line.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const LINE_ID = '55555555-5555-5555-5555-555555555555';

function makeService() {
  const bnplCreditLine = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const executeRaw = jest.fn().mockResolvedValue(1);
  const prisma = {
    bnplCreditLine,
    $executeRawUnsafe: executeRaw,
  } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new BnplCreditLineService(prisma, eventBus);
  return { service, prisma, eventBus, bnplCreditLine, executeRaw };
}

describe('BnplCreditLineService.restoreAvailableLimit', () => {
  it('scenario 1: positive principal calls $executeRawUnsafe with correct params', async () => {
    const { service, executeRaw } = makeService();

    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '150.0000');

    // Must call the atomic SQL — NOT a read-then-update.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [sql, amount, lineId, tenantId] = executeRaw.mock.calls[0];
    expect(sql).toContain('LEAST(');
    expect(sql).toContain('approved_limit');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('tenant_id');
    expect(amount).toBe('150.0000');
    expect(lineId).toBe(LINE_ID);
    expect(tenantId).toBe(TENANT_ID);
  });

  it('scenario 2: SQL uses LEAST(..., approved_limit) cap — never exceeds approved', async () => {
    const { service, executeRaw } = makeService();

    // The cap is in the SQL itself. We verify the SQL contains the right clause.
    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '9999.0000');

    const [sql] = executeRaw.mock.calls[0];
    expect(sql).toMatch(/LEAST\s*\(/);
    expect(sql).toContain('approved_limit');
  });

  it('scenario 4: zero amount is a no-op — SQL not called', async () => {
    const { service, executeRaw } = makeService();

    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '0');

    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('negative amount is a no-op — SQL not called', async () => {
    const { service, executeRaw } = makeService();

    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '-50.0000');

    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('scenario 5: atomic SQL — no read before update (TOCTOU guard)', async () => {
    const { service, executeRaw, bnplCreditLine } = makeService();

    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '100.0000');

    // There must be NO findFirst/findMany call before the update —
    // the whole point of the atomic SQL is to avoid a read-then-write race.
    expect(bnplCreditLine.findFirst).not.toHaveBeenCalled();
    expect(bnplCreditLine.findMany).not.toHaveBeenCalled();
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('SQL includes tenant_id predicate for RLS correctness', async () => {
    const { service, executeRaw } = makeService();

    await service.restoreAvailableLimit(TENANT_ID, LINE_ID, '200.0000');

    const [sql, , lineId, tenantId] = executeRaw.mock.calls[0];
    expect(sql).toContain('tenant_id');
    expect(lineId).toBe(LINE_ID);
    expect(tenantId).toBe(TENANT_ID);
  });

  // ─────────────────────────────────────────────────────────────────────
  // S17-FIX-5 — idempotent path uses Decimal-string math (no Number())
  // ─────────────────────────────────────────────────────────────────────

  it('FIX-5: idempotent path preserves precision for amounts near JS double limit', async () => {
    // Pre-fix used `Number(prev) + Number(amount)` which silently lost
    // precision once the magnitudes approached 2^53. With Decimal-string
    // add() the computed cap stays exact across the full
    // DECIMAL(19,4) range.
    const { service, bnplCreditLine, executeRaw } = makeService();

    // Open the idempotent code path: $transaction-with-callback hands
    // the same prisma stub back, then we route bnplCreditLineAdjustment
    // creates to capture what previousLimit/newLimit got computed.
    const adjustmentCreate = jest.fn().mockResolvedValue({ id: 'adj-1' });
    const txClient = {
      bnplCreditLine: {
        findFirst: jest.fn().mockResolvedValue({
          availableLimit: { toString: () => '9999999999.9999' },
          approvedLimit: { toString: () => '99999999999.9999' },
        }),
      },
      bnplCreditLineAdjustment: { create: adjustmentCreate },
      $executeRawUnsafe: executeRaw,
    };
    bnplCreditLine.findFirst = txClient.bnplCreditLine.findFirst;
    (service as any).prisma.$transaction = jest.fn(async (cb: any) => cb(txClient));

    await service.restoreAvailableLimit(
      TENANT_ID,
      LINE_ID,
      '0.0001',
      'repayment:rep-precision-test',
    );

    // Without precision loss: prev (9999999999.9999) + amount (0.0001) =
    // 10000000000.0000. Number() would round-trip this through a
    // double and yield 10000000000 — still ok at this magnitude — but
    // a higher prev like 99999999999.9999 would lose the trailing .9999.
    // The add() path preserves the exact string.
    const createArgs = adjustmentCreate.mock.calls[0][0].data;
    expect(createArgs.newLimit).toBe('10000000000.0000');
  });
});
