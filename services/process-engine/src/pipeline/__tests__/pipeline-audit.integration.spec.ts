import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';

import { PipelineStepLoggerService } from '../pipeline-step-logger.service';
import {
  PipelineStep,
  PIPELINE_STEP_CONFIGS,
} from '../pipeline-step-registry';

/**
 * F-S18-7-1 — Pipeline Audit Trail integration spec.
 *
 * Exercises `PipelineStepLoggerService` end-to-end against an in-memory
 * Prisma mock (same hand-rolled pattern used by
 * `services/process-engine/src/__tests__/process-engine.integration.spec.ts`).
 *
 * We deliberately do NOT spin up a real database — RLS is enforced at the
 * Postgres level in production; here we only verify that the service
 * passes the tenant scope through into the `where` clause so the DB
 * policy has something to match against.
 */

// ---------------------------------------------------------------------------
// In-memory store + Prisma mock
// ---------------------------------------------------------------------------

interface StoredStepLog {
  id: string;
  tenantId: string;
  loanRequestId: string;
  stepName: string;
  stepOrder: number;
  outcome: string;
  inputs: unknown;
  outputs: unknown;
  errorMessage: string | null;
  errorCode: string | null;
  durationMs: number;
  triggeredBy: string | null;
  startedAt: Date;
  completedAt: Date;
}

let stepLogs: Map<string, StoredStepLog>;
let idCounter: number;

function nextId(): string {
  return `log-${++idCounter}`;
}

function resetStore(): void {
  idCounter = 0;
  stepLogs = new Map();
}

function matchesWhere(row: StoredStepLog, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if ((row as unknown as Record<string, unknown>)[key] !== val) return false;
  }
  return true;
}

function sortRows(rows: StoredStepLog[], orderBy: unknown): StoredStepLog[] {
  const orderByArr = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const ob of orderByArr) {
      for (const [field, dir] of Object.entries(ob as Record<string, string>)) {
        const aVal = (a as unknown as Record<string, unknown>)[field] as
          | string
          | number
          | Date;
        const bVal = (b as unknown as Record<string, unknown>)[field] as
          | string
          | number
          | Date;
        if (aVal < bVal) return dir === 'asc' ? -1 : 1;
        if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function makePrismaMock() {
  return {
    pipelineStepLog: {
      create: jest.fn(async (args: { data: Omit<StoredStepLog, 'id'> }) => {
        const id = nextId();
        const row: StoredStepLog = { id, ...args.data } as StoredStepLog;
        stepLogs.set(id, row);
        return { id };
      }),
      findMany: jest.fn(
        async (args: {
          where?: Record<string, unknown>;
          orderBy?: unknown;
        }) => {
          let rows = [...stepLogs.values()].filter((r) =>
            matchesWhere(r, args?.where),
          );
          if (args?.orderBy) rows = sortRows(rows, args.orderBy);
          return rows;
        },
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

describe('Pipeline Audit Trail (integration)', () => {
  let service: PipelineStepLoggerService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const loanRequestId = '22222222-2222-2222-2222-222222222222';

  // Canonical step order — read from the registry so that adding a step
  // to PipelineStep doesn't silently break this test.
  const STEP_SEQUENCE: PipelineStep[] = [
    PipelineStep.PRE_QUALIFICATION,
    PipelineStep.SCORING,
    PipelineStep.APPROVAL,
    PipelineStep.OFFER_GENERATION,
    PipelineStep.CONTRACT_CREATION,
    PipelineStep.DISBURSEMENT,
  ];

  beforeEach(async () => {
    resetStore();
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStepLoggerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PipelineStepLoggerService);
  });

  it('full pipeline run creates step_log rows for each step', async () => {
    // Run all six canonical steps in order, each via executeAndLog. Each
    // step receives a non-null inputs object and a fast-resolving
    // success fn so we exercise the success branch.
    for (const step of STEP_SEQUENCE) {
      const config = PIPELINE_STEP_CONFIGS[step];
      await service.executeAndLog(
        tenantA,
        loanRequestId,
        step,
        config.order,
        { step, customerId: 'cust-1' },
        async () => ({ ok: true, step }),
      );
    }

    // Six creates — one per step.
    expect(prisma.pipelineStepLog.create).toHaveBeenCalledTimes(
      STEP_SEQUENCE.length,
    );

    // Each create call carries the expected per-step shape.
    for (let i = 0; i < STEP_SEQUENCE.length; i++) {
      const step = STEP_SEQUENCE[i];
      const config = PIPELINE_STEP_CONFIGS[step];
      const createArgs = prisma.pipelineStepLog.create.mock.calls[i][0];
      expect(createArgs.data.tenantId).toBe(tenantA);
      expect(createArgs.data.loanRequestId).toBe(loanRequestId);
      expect(createArgs.data.stepName).toBe(step);
      expect(createArgs.data.stepOrder).toBe(config.order);
      expect(createArgs.data.outcome).toBe('success');
      expect(createArgs.data.durationMs).toBeGreaterThanOrEqual(0);
      // Inputs must be non-null and carry our supplied step identifier.
      expect(createArgs.data.inputs).not.toBeNull();
      expect(createArgs.data.inputs).toEqual(
        expect.objectContaining({ step, customerId: 'cust-1' }),
      );
    }

    // Rows are persisted in stepOrder. Pull them back through the
    // service and verify ordering is monotonically increasing.
    const persisted = await service.getStepsForLoanRequest(
      tenantA,
      loanRequestId,
    );
    expect(persisted).toHaveLength(STEP_SEQUENCE.length);
    for (let i = 0; i < persisted.length; i++) {
      expect(persisted[i].stepName).toBe(STEP_SEQUENCE[i]);
      expect(persisted[i].stepOrder).toBe(
        PIPELINE_STEP_CONFIGS[STEP_SEQUENCE[i]].order,
      );
      if (i > 0) {
        expect(persisted[i].stepOrder).toBeGreaterThan(
          persisted[i - 1].stepOrder,
        );
      }
    }
  });

  it('failed step records error details in pipeline_step_logs', async () => {
    const thrown = Object.assign(new Error('scoring service unavailable'), {
      code: 'SCORING_SERVICE_UNAVAILABLE',
    });

    await expect(
      service.executeAndLog(
        tenantA,
        loanRequestId,
        PipelineStep.SCORING,
        PIPELINE_STEP_CONFIGS[PipelineStep.SCORING].order,
        { customerId: 'cust-1' },
        async () => {
          throw thrown;
        },
      ),
    ).rejects.toThrow('scoring service unavailable');

    expect(prisma.pipelineStepLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.pipelineStepLog.create.mock.calls[0][0];
    expect(createArgs.data.outcome).toBe('error');
    expect(createArgs.data.errorMessage).toBe('scoring service unavailable');
    expect(createArgs.data.errorCode).toBe('SCORING_SERVICE_UNAVAILABLE');
    expect(createArgs.data.stepName).toBe(PipelineStep.SCORING);
    expect(createArgs.data.durationMs).toBeGreaterThanOrEqual(0);

    // And the persisted row is queryable.
    const rows = await service.getStepsForLoanRequest(tenantA, loanRequestId);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('error');
    expect(rows[0].errorCode).toBe('SCORING_SERVICE_UNAVAILABLE');
  });

  it('pipeline_step_logs respects RLS — tenant A cannot see tenant B logs', async () => {
    // Write a row for tenantA.
    await service.executeAndLog(
      tenantA,
      loanRequestId,
      PipelineStep.PRE_QUALIFICATION,
      PIPELINE_STEP_CONFIGS[PipelineStep.PRE_QUALIFICATION].order,
      { customerId: 'cust-a' },
      async () => ({ ok: true }),
    );

    // Write a row for tenantB on the same loanRequestId — in production
    // these would live in tenant-scoped schemas; in the in-memory mock
    // we deliberately collide the ids to prove the filter discriminates
    // on tenantId.
    await service.executeAndLog(
      tenantB,
      loanRequestId,
      PipelineStep.PRE_QUALIFICATION,
      PIPELINE_STEP_CONFIGS[PipelineStep.PRE_QUALIFICATION].order,
      { customerId: 'cust-b' },
      async () => ({ ok: true }),
    );

    // Total rows persisted: 2.
    expect(stepLogs.size).toBe(2);

    // tenantA query returns ONLY tenantA's row.
    const aRows = await service.getStepsForLoanRequest(tenantA, loanRequestId);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].tenantId).toBe(tenantA);
    expect(aRows.every((r) => r.tenantId === tenantA)).toBe(true);

    // tenantB query returns ONLY tenantB's row.
    const bRows = await service.getStepsForLoanRequest(tenantB, loanRequestId);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].tenantId).toBe(tenantB);

    // The service must have passed tenantId into the where clause so
    // that the production RLS policy has something to match against.
    expect(prisma.pipelineStepLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: tenantA, loanRequestId },
      }),
    );
    expect(prisma.pipelineStepLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: tenantB, loanRequestId },
      }),
    );
  });
});
