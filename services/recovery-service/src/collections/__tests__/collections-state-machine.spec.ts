import { CollectionsStateMachine, DEFAULT_TRANSITIONS } from '../collections-state-machine';
import { ValidationError } from '@lons/common';

/**
 * S19-5 — state-machine policy lock tests. The transition map is
 * runtime-configurable per tenant, so a regression in
 * DEFAULT_TRANSITIONS would silently change the fallback behaviour
 * for any tenant without a custom config. These tests pin the
 * default lifecycle + the validation behaviour of the transition()
 * helper.
 *
 * The state machine is deliberately wired up with thin jest mocks —
 * we're testing the validation logic + event emission, not the
 * Prisma transaction itself (that's covered by the integration
 * spec).
 */

const CASE_ID = 'case-1';
const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';

function makeSM(initialStatus: any, tenantConfig?: any) {
  const updatedCase: any = {
    id: CASE_ID,
    tenantId: TENANT_ID,
    contractId: 'contract-1',
    customerId: 'customer-1',
    status: initialStatus,
    escalationLevel: 0,
  };
  const tx = {
    collectionsCase: {
      update: jest.fn().mockImplementation(({ data }) => ({
        ...updatedCase,
        status: data.status ?? updatedCase.status,
        previousStatus: data.previousStatus ?? null,
        escalationLevel:
          data.escalationLevel?.increment !== undefined
            ? updatedCase.escalationLevel + data.escalationLevel.increment
            : updatedCase.escalationLevel,
        ptpDate: 'ptpDate' in data ? data.ptpDate : updatedCase.ptpDate ?? null,
        ptpAmount: 'ptpAmount' in data ? data.ptpAmount : null,
      })),
    },
    collectionsCaseTransition: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    collectionsCase: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...updatedCase }),
    },
    collectionsWorkflowConfig: {
      findUnique: jest.fn().mockResolvedValue(tenantConfig ?? null),
    },
    $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
  };
  const eventBus: any = { emitAndBuild: jest.fn() };
  const sm = new CollectionsStateMachine(prisma, eventBus);
  return { sm, prisma, eventBus, tx };
}

describe('DEFAULT_TRANSITIONS', () => {
  it('includes every CollectionsStatus value as a key', () => {
    const expectedStates = [
      'new', 'contacted', 'promise_to_pay', 'broken_ptp', 'escalated',
      'legal', 'write_off_pending', 'written_off', 'recovered', 'closed',
    ];
    for (const s of expectedStates) {
      expect(DEFAULT_TRANSITIONS).toHaveProperty(s);
    }
  });

  it('terminal states (closed) have no outgoing transitions', () => {
    expect(DEFAULT_TRANSITIONS.closed).toEqual([]);
  });

  it('written_off + recovered can only transition to closed (terminal-ish)', () => {
    expect(DEFAULT_TRANSITIONS.written_off).toEqual(['closed']);
    expect(DEFAULT_TRANSITIONS.recovered).toEqual(['closed']);
  });

  it('every non-closed state can reach closed (no dead-ends)', () => {
    for (const [state, targets] of Object.entries(DEFAULT_TRANSITIONS)) {
      if (state === 'closed') continue;
      expect(targets).toContain('closed');
    }
  });
});

describe('CollectionsStateMachine.transition', () => {
  it('admits a valid transition (new → contacted)', async () => {
    const { sm } = makeSM('new');
    const result = await sm.transition(TENANT_ID, CASE_ID, 'contacted', ACTOR_ID, 'user');
    expect(result.status).toBe('contacted');
    expect(result.previousStatus).toBe('new');
  });

  it('rejects an invalid transition (new → recovered) with ValidationError', async () => {
    const { sm } = makeSM('new');
    await expect(
      sm.transition(TENANT_ID, CASE_ID, 'recovered', ACTOR_ID, 'user'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('writes a transition row with from + to + actor metadata', async () => {
    const { sm, tx } = makeSM('contacted');
    await sm.transition(TENANT_ID, CASE_ID, 'escalated', ACTOR_ID, 'user', 'no contact');
    expect(tx.collectionsCaseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: CASE_ID,
        fromStatus: 'contacted',
        toStatus: 'escalated',
        actorId: ACTOR_ID,
        actorType: 'user',
        reason: 'no contact',
      }),
    });
  });

  it('emits COLLECTIONS_CASE_TRANSITIONED on success', async () => {
    const { sm, eventBus } = makeSM('contacted');
    await sm.transition(TENANT_ID, CASE_ID, 'escalated', ACTOR_ID, 'user');
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'collections.case.transitioned',
      TENANT_ID,
      expect.objectContaining({ fromStatus: 'contacted', toStatus: 'escalated' }),
    );
  });

  it('emits COLLECTIONS_CASE_CLOSED in addition when closing', async () => {
    const { sm, eventBus } = makeSM('recovered');
    await sm.transition(TENANT_ID, CASE_ID, 'closed', ACTOR_ID, 'user', 'fully repaid');
    const events = (eventBus.emitAndBuild as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(events).toContain('collections.case.closed');
  });

  it('increments escalationLevel on escalated transitions', async () => {
    const { sm } = makeSM('contacted');
    const result = await sm.transition(TENANT_ID, CASE_ID, 'escalated', ACTOR_ID, 'user');
    expect(result.escalationLevel).toBe(1);
  });

  it('honours a tenant-specific transition override', async () => {
    // Override that DISALLOWS new → contacted (only allows new → closed).
    const { sm } = makeSM('new', { transitions: { new: ['closed'] } });
    await expect(
      sm.transition(TENANT_ID, CASE_ID, 'contacted', ACTOR_ID, 'user'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('clears PTP fields when leaving promise_to_pay state', async () => {
    const { sm, tx } = makeSM('promise_to_pay');
    await sm.transition(TENANT_ID, CASE_ID, 'broken_ptp', ACTOR_ID, 'scheduler');
    const updateCall = (tx.collectionsCase.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.ptpDate).toBeNull();
    expect(updateCall.data.ptpAmount).toBeNull();
  });
});
