import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService, InvoiceStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { AuditService } from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 12 pre-S13 FIX 1 (F-IF-1) — InvoiceOfferExpiryJob.
 *
 * Hourly sweep that cancels invoices whose factoring offer has expired
 * but were never accepted (status `offer_generated` with
 * `offerExpiresAt <= now()`). Mirrors the behavior in
 * `FactoringOriginationService.acceptOffer` so a stale offer is never
 * silently accepted: we transition the invoice to `cancelled` and emit
 * `INVOICE_CANCELLED` with `reason: 'offer_expired'`.
 *
 * Per-tenant fan-out via `prisma.enterTenantContext` so each tenant's
 * RLS scope is honored. Per-tenant try/catch isolates failures so one
 * tenant's hiccup doesn't stop the rest of the platform.
 */
@Injectable()
export class InvoiceOfferExpiryJob {
  private readonly logger = new Logger('InvoiceOfferExpiryJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
  ) {}

  /** Every hour, on the hour. */
  @Cron('0 * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting invoice offer expiry scan…');

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let totalCancelled = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          async () => {
            const expired = await this.prisma.invoice.findMany({
              where: {
                tenantId: tenant.id,
                status: InvoiceStatus.offer_generated,
                offerExpiresAt: { lt: new Date() },
              },
            });

            for (const inv of expired) {
              await this.prisma.invoice.update({
                where: { id: inv.id },
                data: { status: InvoiceStatus.cancelled },
              });
              this.eventBus.emitAndBuild(
                EventType.INVOICE_CANCELLED,
                tenant.id,
                {
                  invoiceId: inv.id,
                  reason: 'offer_expired',
                },
              );
              // S13B-1: append a system-actor audit entry for each automated
              // state transition. Action label follows verb.noun convention.
              await this.auditService.log({
                tenantId: tenant.id,
                actorType: 'system',
                action: 'transition.invoice',
                resourceType: 'invoice',
                resourceId: inv.id,
                beforeValue: { status: InvoiceStatus.offer_generated },
                afterValue: { status: InvoiceStatus.cancelled },
                metadata: {
                  job: 'invoice-offer-expiry',
                  reason: 'offer_expired',
                  offerExpiresAt: inv.offerExpiresAt,
                },
              });
            }

            return expired.length;
          },
        );

        if (count > 0) {
          this.logger.log(
            `Tenant ${tenant.name}: ${count} expired offer(s) cancelled`,
          );
        }
        totalCancelled += count;
      } catch (error) {
        this.logger.error(
          `Offer expiry scan failed for tenant ${tenant.name}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    this.logger.log(
      `Invoice offer expiry scan complete — ${totalCancelled} invoice(s) cancelled across ${tenants.length} tenant(s).`,
    );
  }
}
