import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, InstallmentStatus } from '@lons/database';
import { AuditService } from '@lons/entity-service';
import { BnplInstallmentService } from '@lons/process-engine';

/**
 * Daily BNPL auto-collection scheduler (Sprint 12 G2 / FR-BN-003).
 *
 * Runs every morning at 06:00 (after the 02:00 overdue-marking pass in
 * `BnplInstallmentJob` has had a chance to settle the prior-day state).
 * For each tenant, finds installments that are due *today or earlier*,
 * still in a collectable status, and:
 *
 *   - haven't already been attempted today (idempotency via
 *     `lastCollectionAttemptAt`); and
 *   - are on a product where `bnplConfig.autoCollectOnDueDate === true`; and
 *   - haven't crossed `bnplConfig.collectionRetryMaxAttempts` (default 3).
 *
 * The actual collection — wallet pull, status update, event emission,
 * retry-counter accounting — lives in `BnplInstallmentService.collectInstallment`.
 * This job is just the daily fan-out + orchestration.
 *
 * Idempotency
 * ───────────
 * Re-running this job on the same UTC day is a safe no-op:
 *
 *   - The query filters on `lastCollectionAttemptAt < startOfToday()`
 *     (or null) so anything we already touched today is skipped.
 *   - We pass an `idempotencyKey` of `installmentId|YYYY-MM-DD` to the
 *     service for traceability. That key is also stable across re-runs,
 *     so any downstream replay-detection has something to dedupe on.
 */
@Injectable()
export class BnplAutoCollectJob {
  private readonly logger = new Logger('BnplAutoCollectJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly installmentService: BnplInstallmentService,
    // Security Hardening (SEC-7): system-actor audit entries for batch
    // collection runs.
    private readonly auditService: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async handleCron(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log('Starting daily BNPL auto-collection pass...');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // Tenants are looked up under platform-admin context so RLS admits
    // the rows; per-tenant work re-enters tenant context (matches the
    // pattern in `BnplInstallmentJob`).
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalCollected = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.runForTenant(tenant.id, today, tomorrow),
        );

        if (result.attempted > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: attempted=${result.attempted}, collected=${result.collected}, failed=${result.failed}, skipped=${result.skipped}`,
          );
          // SEC-7: any auto-collection batch with attempts is auditable.
          // We log per-tenant batch summary; per-installment outcomes are
          // emitted by `BnplInstallmentService.collectInstallment`.
          await this.auditService.log({
            tenantId: tenant.id,
            actorType: 'system',
            action: 'execute.bnplAutoCollect',
            resourceType: 'tenant',
            resourceId: tenant.id,
            metadata: {
              job: 'bnpl-auto-collect',
              runDate: today.toISOString(),
              attempted: result.attempted,
              collected: result.collected,
              failed: result.failed,
              skipped: result.skipped,
            },
          });
        }

        totalCollected += result.collected;
        totalFailed += result.failed;
        totalSkipped += result.skipped;
      } catch (error) {
        this.logger.error(
          `BNPL auto-collection failed for tenant ${tenant.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `BNPL auto-collection complete in ${ms}ms — collected=${totalCollected}, failed=${totalFailed}, skipped=${totalSkipped}`,
    );
  }

  /**
   * Per-tenant inner loop. Extracted so the test can drive it directly
   * without going through the cron entry point.
   */
  async runForTenant(
    tenantId: string,
    today: Date,
    tomorrow: Date,
  ): Promise<{ attempted: number; collected: number; failed: number; skipped: number }> {
    // Find every installment that's due today or earlier and still in a
    // collectable status, that we haven't already touched today.
    const dueInstallments = await this.prisma.installmentSchedule.findMany({
      where: {
        tenantId,
        status: {
          in: [InstallmentStatus.pending, InstallmentStatus.due, InstallmentStatus.overdue],
        },
        dueDate: { lt: tomorrow },
        OR: [
          { lastCollectionAttemptAt: null },
          { lastCollectionAttemptAt: { lt: today } },
        ],
      },
      select: { id: true, dueDate: true },
    });

    let collected = 0;
    let failed = 0;
    let skipped = 0;

    for (const inst of dueInstallments) {
      // Date-stamp the idempotency key with today's UTC date so a
      // re-run on the same day is a safe replay; a re-run tomorrow
      // gets a new key (which is correct — it's a new attempt).
      const isoDate = today.toISOString().slice(0, 10);
      const idempotencyKey = `bnpl-auto-collect:${inst.id}:${isoDate}`;

      try {
        const result = await this.installmentService.collectInstallment(
          tenantId,
          inst.id,
          idempotencyKey,
        );
        if (result.status === 'collected') collected += 1;
        else if (result.status === 'failed') failed += 1;
        else skipped += 1;
      } catch (error) {
        // A throw here means a programming bug (missing adapter, DB
        // failure, etc) — log but continue so one bad installment
        // doesn't stall the entire tenant batch.
        failed += 1;
        this.logger.error(
          `collectInstallment threw for ${inst.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return {
      attempted: dueInstallments.length,
      collected,
      failed,
      skipped,
    };
  }
}
