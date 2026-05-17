import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import {
  PrismaService,
  RepaymentScheduleStatus,
} from '@lons/database';
import { NotificationService } from '@lons/notification-service';

interface IReminderEntry {
  daysBefore: number;
  channel: string;
  templateKey: string;
}

interface IReminderConfig {
  enabled: boolean;
  schedule: IReminderEntry[];
}

// S17-FIX-4: post-overdue reminder config
interface IOverdueReminderConfig {
  /**
   * Days-past-due offsets at which to send escalating overdue reminders.
   * Defaults to [1, 3, 7] when absent from product notificationConfig.
   */
  overdueSchedule: number[];
}

/**
 * Sprint 16 (S16-10) — generic payment reminder scheduler for all
 * installment-based loan products (micro-loan, BNPL, factoring).
 *
 * Daily cron at 06:00 UTC (same window as auto-deduction). For each
 * active tenant:
 *   1. Find upcoming `RepaymentScheduleEntry` rows due within the next
 *      `MAX_REMINDER_DAYS` (default 7).
 *   2. For each, compute `daysUntilDue` and match it against the
 *      product's `notificationConfig.paymentReminders.schedule`.
 *   3. When a match exists, dispatch the configured template via
 *      `NotificationService.sendNotification()`.
 *   4. Idempotency: same (entry, reminder window) combination is sent
 *      only once. Uses the existing `Notification` table — looks up by
 *      `(customerId, contractId, eventType=payment_reminder.{daysBefore})`.
 *
 * Product-specific reminder configs (e.g. S16-3 micro-loan defaults)
 * are stored on `product.notificationConfig.paymentReminders`. Products
 * without explicit config fall back to `DEFAULT_REMINDER_CONFIG`.
 */
@Injectable()
export class PaymentReminderJob {
  private readonly logger = new Logger('PaymentReminderJob');
  private static readonly MAX_REMINDER_DAYS = 7;

  /**
   * Sprint 16 (S16-10) — generic default. Used when a product has no
   * explicit `notificationConfig.paymentReminders`. Sends SMS reminders
   * 3 days / 1 day / day-of.
   */
  private static readonly DEFAULT_REMINDER_CONFIG: IReminderConfig = {
    enabled: true,
    schedule: [
      { daysBefore: 3, channel: 'sms', templateKey: 'payment_reminder.3_day' },
      { daysBefore: 1, channel: 'sms', templateKey: 'payment_reminder.1_day' },
      { daysBefore: 0, channel: 'sms', templateKey: 'payment_reminder.due_today' },
    ],
  };

  /**
   * S17-FIX-4 — default post-overdue reminder schedule. Escalating
   * notifications at 1, 3, and 7 days past due. Products can override via
   * `product.notificationConfig.paymentReminders.overdueSchedule`.
   */
  private static readonly DEFAULT_OVERDUE_SCHEDULE: number[] = [1, 3, 7];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 6 * * *', { name: 'payment-reminder' })
  async handleCron(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log('Starting daily payment reminder pass...');

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalSent = 0;
    let totalSkipped = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.runForTenant(tenant.id),
        );
        totalSent += result.sent;
        totalSkipped += result.skipped;
      } catch (err) {
        this.logger.error(
          `payment-reminder failed for tenant ${tenant.name}: ${(err as Error).message}`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Payment reminder pass complete in ${ms}ms — sent=${totalSent} skipped=${totalSkipped}`,
    );
  }

  async runForTenant(
    tenantId: string,
  ): Promise<{ sent: number; skipped: number }> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + PaymentReminderJob.MAX_REMINDER_DAYS);

    const upcoming = await this.prisma.repaymentScheduleEntry.findMany({
      where: {
        tenantId,
        status: {
          in: [
            RepaymentScheduleStatus.pending,
            RepaymentScheduleStatus.partial,
          ],
        },
        dueDate: { gte: today, lte: windowEnd },
      },
      include: {
        contract: {
          include: {
            product: {
              select: {
                id: true,
                type: true,
                notificationConfig: true,
                currency: true,
              },
            },
            customer: {
              select: { id: true, fullName: true },
            },
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const entry of upcoming) {
      const config = this.resolveReminderConfig(
        entry.contract.product.notificationConfig,
      );
      if (!config.enabled) {
        skipped += 1;
        continue;
      }

      const daysUntilDue = Math.ceil(
        (new Date(entry.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      for (const reminder of config.schedule) {
        if (reminder.daysBefore !== daysUntilDue) continue;

        // FIX-4: scope the dedupe key to the specific installment.
        // Without `:{installmentId}` two installments on the same
        // contract with the same due date would only get the FIRST
        // reminder (one-row dedupe). The Notification model has no
        // metadata / referenceId field, so we encode the installment
        // discriminator into eventType — fits the VARCHAR(100) column
        // with room to spare. `templateEventType` (without the
        // installmentId) is the key the template renderer looks up.
        const templateEventType = `payment_reminder.${reminder.daysBefore}`;
        const dedupeEventType = `${templateEventType}:${entry.id}`;
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            tenantId,
            customerId: entry.contract.customer.id,
            contractId: entry.contractId,
            eventType: dedupeEventType,
            status: { in: ['sent', 'pending', 'delivered'] },
          },
        });
        if (alreadySent) {
          skipped += 1;
          continue;
        }

        try {
          // Dispatch with the installment-scoped eventType so the
          // Notification row persists with the unique discriminator.
          // The template renderer looks up `templateEventType` from the
          // product's `notificationConfig.paymentReminders.schedule[].templateKey`
          // (passed via `params.eventType` → see NotificationService).
          // We pass `templateEventType` because that's what the
          // template registry indexes on; the discriminator is added
          // when the Notification row is persisted (see
          // NotificationService.sendNotification's caller convention).
          //
          // The cleanest split: send by the SCOPED eventType so the
          // row reads `payment_reminder.3:{installmentId}`, and rely
          // on `templateKey` for template lookup. NotificationService
          // currently uses `eventType` for both — extending it would
          // be a separate cleanup. For now we send with the scoped
          // eventType, and the templates registry (FIX-7) handles a
          // PREFIX MATCH via the unscoped key.
          await this.notificationService.sendNotification(tenantId, {
            customerId: entry.contract.customer.id,
            contractId: entry.contractId,
            eventType: dedupeEventType,
            channel: reminder.channel,
            variables: {
              amount: String(entry.totalAmount),
              currency: entry.contract.product.currency,
              dueDate: entry.dueDate.toISOString().split('T')[0],
              customerName: entry.contract.customer.fullName ?? '',
              installmentNumber: String(entry.installmentNumber),
            },
          });
          sent += 1;
        } catch (err) {
          this.logger.warn(
            `Failed to send ${dedupeEventType} for entry ${entry.id}: ${(err as Error).message}`,
          );
          skipped += 1;
        }
      }
    }

    // ── S17-FIX-4: post-overdue pass ────────────────────────────────────
    // Second pass: find overdue installments and send escalating reminders
    // at 1, 3, and 7 days past due. Uses the same idempotency mechanism as
    // the pre-due pass but with a separate discriminator prefix so the two
    // sets of rows don't collide.
    const overdue = await this.prisma.repaymentScheduleEntry.findMany({
      where: {
        tenantId,
        status: {
          in: [
            RepaymentScheduleStatus.overdue,
            RepaymentScheduleStatus.pending,
            RepaymentScheduleStatus.partial,
          ],
        },
        // Entries that were due before today (strictly past due).
        dueDate: { lt: today },
      },
      include: {
        contract: {
          include: {
            product: {
              select: {
                id: true,
                type: true,
                notificationConfig: true,
                currency: true,
              },
            },
            customer: {
              select: { id: true, fullName: true },
            },
          },
        },
      },
    });

    for (const entry of overdue) {
      const overdueSchedule = this.resolveOverdueSchedule(
        entry.contract.product.notificationConfig,
      );

      const daysPastDue = Math.floor(
        (today.getTime() - new Date(entry.dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // Only fire at the configured day offsets.
      if (!overdueSchedule.includes(daysPastDue)) continue;

      const templateEventType = `payment_overdue_reminder.${daysPastDue}`;
      const dedupeEventType = `${templateEventType}:${entry.id}`;

      const alreadySent = await this.prisma.notification.findFirst({
        where: {
          tenantId,
          customerId: entry.contract.customer.id,
          contractId: entry.contractId,
          eventType: dedupeEventType,
          status: { in: ['sent', 'pending', 'delivered'] },
        },
      });
      if (alreadySent) {
        skipped += 1;
        continue;
      }

      try {
        await this.notificationService.sendNotification(tenantId, {
          customerId: entry.contract.customer.id,
          contractId: entry.contractId,
          eventType: dedupeEventType,
          channel: 'sms',
          variables: {
            amount: String(entry.totalAmount),
            currency: entry.contract.product.currency,
            dueDate: entry.dueDate.toISOString().split('T')[0],
            customerName: entry.contract.customer.fullName ?? '',
            installmentNumber: String(entry.installmentNumber),
            daysPastDue: String(daysPastDue),
          },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to send ${dedupeEventType} for entry ${entry.id}: ${(err as Error).message}`,
        );
        skipped += 1;
      }
    }
    // ── end S17-FIX-4 ───────────────────────────────────────────────────

    return { sent, skipped };
  }

  /**
   * Resolve the product's reminder config. Reads from
   * `product.notificationConfig.paymentReminders`; falls back to the
   * generic default when missing or malformed. Defensive parse — a
   * stale product config should never crash the cron.
   */
  private resolveReminderConfig(
    notificationConfig: unknown,
  ): IReminderConfig {
    const cfg = (notificationConfig as Record<string, unknown> | null) ?? null;
    const raw = cfg?.paymentReminders as Partial<IReminderConfig> | undefined;
    if (!raw || typeof raw !== 'object') {
      return PaymentReminderJob.DEFAULT_REMINDER_CONFIG;
    }
    const schedule = Array.isArray(raw.schedule)
      ? raw.schedule
          .filter(
            (s): s is IReminderEntry =>
              !!s &&
              typeof s === 'object' &&
              typeof (s as IReminderEntry).daysBefore === 'number' &&
              typeof (s as IReminderEntry).templateKey === 'string',
          )
          .map((s) => ({
            daysBefore: s.daysBefore,
            channel: s.channel ?? 'sms',
            templateKey: s.templateKey,
          }))
      : PaymentReminderJob.DEFAULT_REMINDER_CONFIG.schedule;
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      schedule,
    };
  }

  /**
   * S17-FIX-4 — resolve the post-overdue reminder schedule from the
   * product's `notificationConfig.paymentReminders.overdueSchedule`.
   * Defaults to `[1, 3, 7]` when absent or malformed. Each element is
   * a positive integer representing days past due.
   */
  private resolveOverdueSchedule(notificationConfig: unknown): number[] {
    const cfg = (notificationConfig as Record<string, unknown> | null) ?? null;
    const reminders = cfg?.paymentReminders as Record<string, unknown> | undefined;
    if (!reminders || typeof reminders !== 'object') {
      return PaymentReminderJob.DEFAULT_OVERDUE_SCHEDULE;
    }
    const raw = reminders.overdueSchedule;
    if (
      Array.isArray(raw) &&
      raw.every((v) => typeof v === 'number' && v > 0)
    ) {
      return raw as number[];
    }
    return PaymentReminderJob.DEFAULT_OVERDUE_SCHEDULE;
  }
}
