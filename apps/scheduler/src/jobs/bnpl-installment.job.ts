import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import {
  BnplInstallmentService,
  MerchantSettlementService,
} from '@lons/process-engine';

/**
 * Daily BNPL maintenance pass (Sprint 11 Track B / B6 part 2 + B7).
 *
 *   1. Mark `pending`/`due` installments past dueDate as `overdue`.
 *      Acceleration is evaluated inline per affected transaction.
 *   2. Emit `bnpl.installment.due` for installments hitting dueDate
 *      `today + leadDays` (default 3) so notification-service can SMS
 *      the customer ahead of time.
 *   3. Generate T+1 merchant settlement batches for the prior day.
 *
 * Each step is wrapped per tenant; a failure in one tenant doesn't
 * cascade. Cron at 02:00 (slightly after the contract aging job at
 * 01:30) so the day's overnight wallet activity has settled.
 */
@Injectable()
export class BnplInstallmentJob {
  private readonly logger = new Logger('BnplInstallmentJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly installmentService: BnplInstallmentService,
    private readonly settlementService: MerchantSettlementService,
  ) {}

  @Cron('0 2 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily BNPL installment + settlement pass...');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    for (const tenant of tenants) {
      // Mark overdue + acceleration evaluation.
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.installmentService.markOverdueInstallments(tenant.id, today),
        );
        if (result.markedOverdue > 0 || result.accelerated > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: ${result.markedOverdue} marked overdue, ${result.accelerated} accelerated`,
          );
        }
      } catch (error) {
        this.logger.error(
          `BNPL overdue pass failed for tenant ${tenant.name}: ${error}`,
        );
      }

      // Lead-time due notifications.
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.installmentService.emitDueNotifications(tenant.id, today, 3),
        );
        if (result.notified > 0) {
          this.logger.log(`Tenant ${tenant.name}: ${result.notified} due notifications emitted`);
        }
      } catch (error) {
        this.logger.error(
          `BNPL due-notification pass failed for tenant ${tenant.name}: ${error}`,
        );
      }

      // T+1 merchant settlement batch.
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.settlementService.runDailyBatch(tenant.id, today),
        );
        if (result.batches > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: ${result.batches} T+1 settlement batches covering ${result.transactions} transactions`,
          );
        }
      } catch (error) {
        this.logger.error(
          `BNPL settlement batch failed for tenant ${tenant.name}: ${error}`,
        );
      }
    }
  }
}
