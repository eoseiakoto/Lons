import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { InvoiceAgingService } from '@lons/process-engine';

/**
 * Daily aging-classification pass for invoice factoring (Sprint 12 §6A).
 *
 * Iterates every active tenant and calls
 * {@link InvoiceAgingService.processAging}. Each tenant runs in its own
 * try/catch so a single tenant's failure (e.g., DB hiccup, malformed
 * factoringConfig) doesn't stop the rest of the portfolio.
 *
 * Cron: 06:00 UTC daily — chosen to land after the contract aging
 * (01:30) and BNPL passes (02:00) so the day's overnight payment
 * activity has fully settled before factoring DPD is computed.
 */
@Injectable()
export class InvoiceAgingJob {
  private readonly logger = new Logger('InvoiceAgingJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceAgingService: InvoiceAgingService,
  ) {}

  @Cron('0 6 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily invoice aging classification...');

    // Sprint 10B Task 0: scheduler runs outside HTTP request scope, so the
    // global RLS interceptor never fires. Look up tenants under platform
    // admin context, then re-enter per-tenant for the service call.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalScanned = 0;
    let totalDefaults = 0;
    let tenantsProcessed = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.invoiceAgingService.processAging(tenant.id),
        );
        tenantsProcessed += 1;
        totalScanned += result.totalScanned;
        totalDefaults += result.newDefaults.length;
        if (result.totalScanned > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: scanned ${result.totalScanned} invoices, ${result.transitions} bucket transitions, ${result.newDefaults.length} new defaults`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Invoice aging failed for tenant ${tenant.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(
      `Invoice aging: scanned ${totalScanned} invoices across ${tenantsProcessed} tenants, ${totalDefaults} new defaults`,
    );
  }
}
