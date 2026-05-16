import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  ContractStatus,
  PrismaService,
  RepaymentScheduleStatus,
} from '@lons/database';
import {
  EventBusService,
  WALLET_COLLECTION_ADAPTER,
  add,
  compare,
  isPositive,
  subtract,
  type IWalletCollectionAdapter,
} from '@lons/common';
import { AuditService } from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 15 (S15-4) — generic auto-deduction scheduler for installment
 * loans NOT in the BNPL path.
 *
 * Targets `RepaymentScheduleEntry` rows for Micro-Loan and Overdraft
 * installment products where `product.repaymentMethod = 'auto_deduction'`.
 * BNPL keeps its own `BnplAutoCollectJob` because its post-collection
 * side effects (merchant settlement triggers, acceleration) differ.
 *
 * Daily at 06:00 UTC. Per-tenant fan-out with per-installment idempotency
 * via the (entry, today) compound key in `lastDeductionAttemptAt`.
 *
 * Retry mechanism (S15-5) lives in `AutoDeductionRetryJob` running every
 * 30 minutes. This main job sets `nextDeductionRetryAt` on failure; the
 * retry job picks them up when due.
 */
@Injectable()
export class AutoDeductionJob {
  private readonly logger = new Logger('AutoDeductionJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
    @Optional()
    @Inject(WALLET_COLLECTION_ADAPTER)
    private readonly collectionAdapter?: IWalletCollectionAdapter,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async handleCron(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log('Starting daily generic auto-deduction pass...');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalAttempted = 0;
    let totalCollected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.runForTenant(tenant.id, today),
        );

        if (result.attempted > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: attempted=${result.attempted} collected=${result.collected} failed=${result.failed}`,
          );
          await this.auditService.log({
            tenantId: tenant.id,
            actorType: 'system',
            action: 'execute.autoDeduction',
            resourceType: 'tenant',
            resourceId: tenant.id,
            metadata: {
              job: 'auto-deduction',
              runDate: today.toISOString(),
              attempted: result.attempted,
              collected: result.collected,
              failed: result.failed,
            },
          });
        }

        totalAttempted += result.attempted;
        totalCollected += result.collected;
        totalFailed += result.failed;
      } catch (error) {
        this.logger.error(
          `Auto-deduction failed for tenant ${tenant.name}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Generic auto-deduction complete in ${ms}ms — attempted=${totalAttempted} collected=${totalCollected} failed=${totalFailed}`,
    );
  }

  /**
   * Per-tenant inner loop. Public so the retry job and tests can drive
   * it without going through the cron entry point.
   */
  async runForTenant(
    tenantId: string,
    today: Date,
  ): Promise<{ attempted: number; collected: number; failed: number }> {
    if (!this.collectionAdapter) {
      this.logger.warn(
        'No WALLET_COLLECTION_ADAPTER registered — auto-deduction is a no-op',
      );
      return { attempted: 0, collected: 0, failed: 0 };
    }

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // Pull every due / partial / pending entry where:
    //   - dueDate <= today
    //   - status is not yet `paid`
    //   - the contract's product is configured for auto-deduction
    //   - FIX-10: the parent contract is still in a collectable status —
    //     terminal/recovery states (cancelled, settled, written_off,
    //     default_status, cooling_off) should not see new wallet pulls
    //   - we haven't already attempted today (idempotency)
    const due = await this.prisma.repaymentScheduleEntry.findMany({
      where: {
        tenantId,
        dueDate: { lt: tomorrow },
        status: {
          in: [
            RepaymentScheduleStatus.pending,
            RepaymentScheduleStatus.partial,
            RepaymentScheduleStatus.overdue,
          ],
        },
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
          product: { repaymentMethod: 'auto_deduction' },
        },
        OR: [
          { lastDeductionAttemptAt: null },
          { lastDeductionAttemptAt: { lt: today } },
        ],
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
        const outcome = await this.attemptDeduction(tenantId, entry, today);
        if (outcome === 'collected') collected += 1;
        else if (outcome === 'failed') failed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `attemptDeduction threw for entry ${entry.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return { attempted: due.length, collected, failed };
  }

  /**
   * One installment, one attempt. Wallet resolution → adapter call →
   * Repayment record + schedule update (success) OR retry counter
   * increment (failure). Returns the outcome category for the
   * scheduler's audit summary.
   */
  async attemptDeduction(
    tenantId: string,
    entry: {
      id: string;
      contractId: string;
      totalAmount: { toString(): string };
      paidAmount: { toString(): string };
      deductionAttemptCount: number;
      contract: {
        customerId: string;
        currency: string;
        product: { autoDeductionRetryConfig?: unknown; bnplConfig?: unknown };
      };
    },
    today: Date,
  ): Promise<'collected' | 'failed' | 'skipped'> {
    if (!this.collectionAdapter) return 'skipped';

    const owed = subtract(String(entry.totalAmount), String(entry.paidAmount));
    if (!isPositive(owed)) return 'skipped';

    // Wallet lookup — primary wallet for the customer.
    const wallet = await this.prisma.walletAccountMapping.findFirst({
      where: {
        tenantId,
        customerId: entry.contract.customerId,
        isPrimary: true,
      },
    });
    if (!wallet) {
      this.logger.warn(
        `No primary wallet mapping for customer ${entry.contract.customerId.slice(0, 8)}…; skipping`,
      );
      return 'skipped';
    }

    const reference = `auto-deduct:${entry.id}:${today.toISOString().slice(0, 10)}`;
    const adapterResult = await this.collectionAdapter.collect({
      walletId: wallet.walletId,
      amount: owed,
      reference,
    });
    const now = new Date();

    if (!adapterResult.success) {
      await this.recordFailure(tenantId, entry, now, adapterResult.reason);
      return 'failed';
    }

    // Success path: create Repayment + update schedule.
    await this.prisma.$transaction(async (tx) => {
      const newPaidAmount = add(String(entry.paidAmount), owed);
      const fullyPaid =
        compare(newPaidAmount, String(entry.totalAmount)) >= 0;

      await tx.repaymentScheduleEntry.update({
        where: { id: entry.id },
        data: {
          paidAmount: newPaidAmount,
          paidAt: fullyPaid ? now : null,
          status: fullyPaid
            ? RepaymentScheduleStatus.paid
            : RepaymentScheduleStatus.partial,
          lastDeductionAttemptAt: now,
          nextDeductionRetryAt: null,
        },
      });

      await tx.repayment.create({
        data: {
          tenantId,
          contractId: entry.contractId,
          customerId: entry.contract.customerId,
          amount: owed,
          currency: entry.contract.currency,
          method: 'auto_deduction',
          source: 'wallet',
          externalRef: adapterResult.walletRef,
          status: 'completed',
          completedAt: now,
        },
      });
    });

    this.eventBus.emitAndBuild(EventType.REPAYMENT_RECEIVED, tenantId, {
      contractId: entry.contractId,
      scheduleEntryId: entry.id,
      amount: owed,
      currency: entry.contract.currency,
      method: 'auto_deduction',
      walletRef: adapterResult.walletRef,
    });

    return 'collected';
  }

  /**
   * Failure bookkeeping. Increments attempt counter; if we're under the
   * configured max retries, sets `nextDeductionRetryAt` from the
   * configured intervals. If exhausted, emits
   * `DEDUCTION_FAILED_PERMANENTLY` (consumed by the aging/overdue flow).
   */
  private async recordFailure(
    tenantId: string,
    entry: {
      id: string;
      contractId: string;
      deductionAttemptCount: number;
      totalAmount: { toString(): string };
      paidAmount: { toString(): string };
      contract: {
        customerId: string;
        currency: string;
        product: { bnplConfig?: unknown };
      };
    },
    now: Date,
    reason: string,
  ): Promise<void> {
    const attemptCount = entry.deductionAttemptCount + 1;
    const retryConfig = this.resolveRetryConfig(entry.contract.product);

    let nextRetry: Date | null;
    if (attemptCount > retryConfig.maxRetries) {
      // Exhausted — surface to the aging flow.
      nextRetry = null;
      const owed = subtract(
        String(entry.totalAmount),
        String(entry.paidAmount),
      );
      this.eventBus.emitAndBuild(
        EventType.DEDUCTION_FAILED_PERMANENTLY,
        tenantId,
        {
          contractId: entry.contractId,
          scheduleEntryId: entry.id,
          customerId: entry.contract.customerId,
          amount: owed,
          currency: entry.contract.currency,
          attempts: attemptCount,
          lastFailureReason: reason,
        },
      );
    } else {
      const idx = Math.min(
        attemptCount - 1,
        retryConfig.retryIntervalsHours.length - 1,
      );
      const hours = retryConfig.retryIntervalsHours[idx];
      nextRetry = new Date(now.getTime() + hours * 60 * 60 * 1000);
    }

    await this.prisma.repaymentScheduleEntry.update({
      where: { id: entry.id },
      data: {
        lastDeductionAttemptAt: now,
        deductionAttemptCount: attemptCount,
        nextDeductionRetryAt: nextRetry,
      },
    });
  }

  /**
   * Retry config lives on the product's `bnplConfig.autoDeductionRetry`
   * (poor naming — `bnplConfig` is reused for non-BNPL installment
   * products because they share the same JSON column structurally).
   * Defaults: 3 retries at 2h / 6h / 24h.
   */
  private resolveRetryConfig(product: {
    bnplConfig?: unknown;
  }): { maxRetries: number; retryIntervalsHours: number[] } {
    const config =
      (product.bnplConfig as Record<string, unknown> | null | undefined) ??
      null;
    const raw = config?.autoDeductionRetry as
      | { maxRetries?: number; retryIntervalsHours?: number[] }
      | undefined;
    if (!raw) return { maxRetries: 3, retryIntervalsHours: [2, 6, 24] };
    const maxRetries =
      typeof raw.maxRetries === 'number' && raw.maxRetries > 0
        ? raw.maxRetries
        : 3;
    const intervals =
      Array.isArray(raw.retryIntervalsHours) &&
      raw.retryIntervalsHours.every((n) => typeof n === 'number' && n > 0)
        ? raw.retryIntervalsHours
        : [2, 6, 24];
    return { maxRetries, retryIntervalsHours: intervals };
  }
}
