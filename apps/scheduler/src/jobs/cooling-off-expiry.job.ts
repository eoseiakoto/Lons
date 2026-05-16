import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { AuditService } from '@lons/entity-service';
import { CoolingOffService } from '@lons/process-engine';

@Injectable()
export class CoolingOffExpiryJob {
  private readonly logger = new Logger('CoolingOffExpiryJob');

  constructor(
    private prisma: PrismaService,
    private coolingOffService: CoolingOffService,
    // Sprint 15 (S15-FIX-2) — system-actor audit entries when contracts
    // transition out of cooling-off via the scheduler.
    private auditService: AuditService,
  ) {}

  @Cron('*/15 * * * *') // Every 15 minutes
  async handleCron() {
    this.logger.log('Starting cooling-off expiry check...');

    // Sprint 10B Task 0: scheduler runs outside HTTP request scope. Look up
    // tenants under platform-admin context so RLS admits the rows, then
    // re-enter per-tenant context for the per-tenant work.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    let totalTransitioned = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.coolingOffService.expireCoolingOffContracts(tenant.id),
        );
        if (count > 0) {
          this.logger.log(`Tenant ${tenant.name}: ${count} contracts transitioned from cooling_off to active`);
          // S15-FIX-2: only log when something actually changed —
          // avoids audit-log spam every 15 minutes when there's nothing
          // to do.
          await this.auditService.log({
            tenantId: tenant.id,
            actorType: 'system',
            action: 'execute.coolingOffExpiry',
            resourceType: 'tenant',
            resourceId: tenant.id,
            metadata: {
              job: 'cooling-off-expiry',
              transitioned: count,
            },
          });
        }
        totalTransitioned += count;
      } catch (error) {
        this.logger.error(
          `Cooling-off expiry failed for tenant ${tenant.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(`Cooling-off expiry check complete. ${totalTransitioned} contracts transitioned.`);
  }
}
