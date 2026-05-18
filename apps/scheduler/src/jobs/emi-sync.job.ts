import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@lons/database';
import { EmiDataSyncJob, EmiIntegrationConfigService } from '@lons/integration-service';

/**
 * FIX-BA-4 — scheduler-side wrapper that actually fires the EMI sync
 * job on a cadence.
 *
 * The underlying `EmiDataSyncJob` from `@lons/integration-service` is
 * the business-logic worker (one tenant + one config per call). It
 * has no `@Cron` decorator of its own; without a scheduler wrapper the
 * sync is dead code. This job iterates every active tenant + active
 * EMI integration config and dispatches the worker for each, using the
 * same `enterTenantContext` pattern as every other cron job in the
 * scheduler so RLS policies are satisfied.
 *
 * Schedule: every 30 minutes. Per-config `syncFrequencyMin` policing
 * happens inside the worker — this cron just keeps the wakeup cadence
 * tight enough that a config set to "sync every 60 minutes" still
 * triggers within the operator's expected window.
 */
@Injectable()
export class EmiSyncJob {
  private readonly logger = new Logger('EmiSyncJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emiDataSyncJob: EmiDataSyncJob,
    private readonly emiConfigService: EmiIntegrationConfigService,
  ) {}

  @Cron('*/30 * * * *') // every 30 minutes
  async handleCron(): Promise<void> {
    this.logger.log('Starting EMI data sync sweep…');

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
          select: { id: true, name: true },
        }),
    );

    for (const tenant of tenants) {
      try {
        const configs = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.emiConfigService.findAll(tenant.id),
        );
        const activeConfigs = configs.filter((c) => c.isActive);
        if (activeConfigs.length === 0) continue;

        for (const config of activeConfigs) {
          try {
            const result = await this.prisma.enterTenantContext(
              { tenantId: tenant.id },
              () => this.emiDataSyncJob.runForTenant(tenant.id, config.id),
            );
            this.logger.log(
              `EMI sync ${tenant.name}/${config.id}: ` +
                `attempted=${result.attempted} succeeded=${result.succeeded} ` +
                `skipped=${result.skipped} failed=${result.failed}`,
            );
          } catch (err) {
            this.logger.error(
              `EMI sync failed for tenant ${tenant.name} config ${config.id}: ${(err as Error).message}`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `EMI config listing failed for tenant ${tenant.name}: ${(err as Error).message}`,
        );
      }
    }
  }
}
