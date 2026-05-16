import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { AuditService } from '@lons/entity-service';
import { SettlementService } from '@lons/settlement-service';

@Injectable()
export class SettlementJob {
  private readonly logger = new Logger('SettlementJob');

  constructor(
    private prisma: PrismaService,
    private settlementService: SettlementService,
    // Sprint 15 (S15-FIX-2) — system-actor audit entries for settlement
    // runs so revenue-share disputes have a clear job-execution
    // breadcrumb.
    private auditService: AuditService,
  ) {}

  @Cron('0 3 * * *') // 3:00 AM daily
  async handleSettlementRun() {
    // Sprint 10B Task 0: scheduler runs outside HTTP request scope. Look up
    // tenants under platform-admin context, then re-enter per-tenant for the
    // settlement calculation so RLS admits the correct rows.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active' } }),
    );
    for (const tenant of tenants) {
      try {
        const settings = (tenant.settings as any) || {};
        const frequency = settings.settlementFrequency || 'daily';
        const now = new Date();

        // Determine period based on frequency
        let periodStart: Date;
        let periodEnd: Date;

        if (frequency === 'daily') {
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1);
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd);
          periodStart.setHours(0, 0, 0, 0);
        } else if (frequency === 'weekly' && now.getDay() === 1) { // Monday
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1); // Sunday
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd);
          periodStart.setDate(periodStart.getDate() - 6); // Previous Monday
          periodStart.setHours(0, 0, 0, 0);
        } else if (frequency === 'monthly' && now.getDate() === 1) {
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1); // Last day of prev month
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
        } else {
          continue; // Skip -- not the right day for this frequency
        }

        await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.settlementService.calculateSettlement(tenant.id, periodStart, periodEnd),
        );
        this.logger.log(`Settlement calculated for tenant ${tenant.id}`);
        // S15-FIX-2: audit-log every settlement run with the period.
        await this.auditService.log({
          tenantId: tenant.id,
          actorType: 'system',
          action: 'execute.settlementCalculate',
          resourceType: 'tenant',
          resourceId: tenant.id,
          metadata: {
            job: 'settlement',
            frequency,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          },
        });
      } catch (error) {
        this.logger.error(`Settlement failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
