import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import {
  ContractStatus,
  PrismaService,
  RepaymentScheduleStatus,
} from '@lons/database';

import { AutoDeductionJob } from './auto-deduction.job';

/**
 * Sprint 15 (S15-5) — retry pass for failed auto-deductions.
 *
 * Runs every 30 minutes. Picks up `RepaymentScheduleEntry` rows where
 * `nextDeductionRetryAt <= now` and re-runs the same wallet pull as
 * `AutoDeductionJob.attemptDeduction`. On success, the success path
 * clears `nextDeductionRetryAt` automatically. On failure, the main
 * job's retry-counter logic schedules the next retry or emits
 * `DEDUCTION_FAILED_PERMANENTLY` if max attempts are exhausted.
 */
@Injectable()
export class AutoDeductionRetryJob {
  private readonly logger = new Logger('AutoDeductionRetryJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoDeductionJob: AutoDeductionJob,
  ) {}

  // every 30 minutes — same cadence as the BNPL recovery retry pass.
  @Cron('0 */30 * * * *')
  async handleCron(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log('Starting auto-deduction retry pass...');

    const now = new Date();
    const todayUtc = new Date(now);
    todayUtc.setUTCHours(0, 0, 0, 0);

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalCollected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.runForTenant(tenant.id, now, todayUtc),
        );
        totalCollected += result.collected;
        totalFailed += result.failed;
      } catch (error) {
        this.logger.error(
          `Retry pass failed for tenant ${tenant.name}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    if (totalCollected > 0 || totalFailed > 0) {
      this.logger.log(
        `Auto-deduction retry complete in ${ms}ms — collected=${totalCollected} failed=${totalFailed}`,
      );
    }
  }

  async runForTenant(
    tenantId: string,
    now: Date,
    today: Date,
  ): Promise<{ attempted: number; collected: number; failed: number }> {
    const due = await this.prisma.repaymentScheduleEntry.findMany({
      where: {
        tenantId,
        status: {
          in: [
            RepaymentScheduleStatus.pending,
            RepaymentScheduleStatus.partial,
            RepaymentScheduleStatus.overdue,
          ],
        },
        nextDeductionRetryAt: { lte: now, not: null },
        // S16-FIX-3: a contract that transitioned to defaulted /
        // cancelled / settled / written_off between the initial failure
        // and this retry pass should NOT be hit again. Mirrors the
        // collectable-set filter on the primary AutoDeductionJob
        // (Sprint 15 FIX-10).
        contract: {
          status: {
            in: [
              ContractStatus.active,
              ContractStatus.performing,
              ContractStatus.due,
              ContractStatus.overdue,
              ContractStatus.delinquent,
            ],
          },
        },
      },
      include: {
        contract: {
          include: { product: true },
        },
      },
    });

    let collected = 0;
    let failed = 0;

    for (const entry of due) {
      try {
        const outcome = await this.autoDeductionJob.attemptDeduction(
          tenantId,
          entry,
          today,
        );
        if (outcome === 'collected') collected += 1;
        else if (outcome === 'failed') failed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Retry attempt threw for entry ${entry.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return { attempted: due.length, collected, failed };
  }
}
