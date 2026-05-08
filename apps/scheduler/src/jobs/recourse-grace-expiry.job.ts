import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PrismaService,
  InvoiceStatus,
  RecourseType,
  Prisma,
} from '@lons/database';
import { RecourseService } from '@lons/process-engine';

/**
 * Sprint 13 S13-3 — RecourseGraceExpiryJob.
 *
 * Daily sweep that finds with-recourse invoices whose grace period has
 * expired (`metadata.recourseGraceEndAt <= now()`) and routes them into
 * the existing CollectionsAction workflow via
 * `RecourseService.enforceGracePeriodElapsed`.
 *
 * Idempotency: `RecourseService.enforceGracePeriodElapsed` stamps
 * `metadata.recourseEnforcedAt` after a successful enforcement. The scan
 * skips any invoice that already has it set, so the job is safe to
 * re-run on the same day.
 *
 * Per-tenant fan-out via `prisma.enterTenantContext` so each tenant's
 * RLS scope is honored. Per-tenant try/catch isolates failures so one
 * tenant's hiccup doesn't stop the rest of the platform; a per-invoice
 * try/catch lets a single bad invoice fail without aborting the rest of
 * the tenant's batch (and `recourseEnforcedAt` will remain unstamped, so
 * the next run picks it up again).
 */
@Injectable()
export class RecourseGraceExpiryJob {
  private readonly logger = new Logger('RecourseGraceExpiryJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly recourseService: RecourseService,
  ) {}

  /** Daily at 07:00 UTC — after aging (06:00) has classified new defaults. */
  @Cron('0 7 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting recourse grace-period expiry scan...');

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalEnforced = 0;
    const now = new Date();

    for (const tenant of tenants) {
      try {
        const enforcedThisTenant = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          async () => {
            // Prisma JSON path filter narrows to defaulted with-recourse
            // invoices that have a recourseGraceEndAt set. We then filter
            // in app code for date comparison + not-yet-enforced (Prisma
            // JSON filtering doesn't support date comparisons on string
            // values within JSONB).
            const candidates = await this.prisma.invoice.findMany({
              where: {
                tenantId: tenant.id,
                status: InvoiceStatus.defaulted,
                recourseType: RecourseType.with_recourse,
                metadata: {
                  path: ['recourseGraceEndAt'],
                  not: Prisma.DbNull,
                },
              },
            });

            let enforced = 0;
            for (const inv of candidates) {
              const meta = (inv.metadata ?? {}) as Record<string, unknown>;
              const graceEndStr = meta.recourseGraceEndAt as string | undefined;
              const enforcedAt = meta.recourseEnforcedAt as string | undefined;
              if (!graceEndStr) continue;
              if (enforcedAt) continue; // already done
              const graceEnd = new Date(graceEndStr);
              if (Number.isNaN(graceEnd.getTime())) continue;
              if (graceEnd > now) continue; // not yet expired

              try {
                await this.recourseService.enforceGracePeriodElapsed(
                  tenant.id,
                  inv.id,
                );
                enforced += 1;
              } catch (err) {
                this.logger.error(
                  `enforceGracePeriodElapsed failed for invoice ${inv.id}: ${
                    err instanceof Error ? err.message : err
                  }. Will retry on next run (recourseEnforcedAt not stamped).`,
                );
              }
            }
            return enforced;
          },
        );

        if (enforcedThisTenant > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: ${enforcedThisTenant} grace-expired invoice(s) enforced`,
          );
        }
        totalEnforced += enforcedThisTenant;
      } catch (error) {
        this.logger.error(
          `Recourse grace expiry scan failed for tenant ${tenant.name}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    this.logger.log(
      `Recourse grace expiry scan complete — ${totalEnforced} invoice(s) enforced across ${tenants.length} tenant(s).`,
    );
  }
}
