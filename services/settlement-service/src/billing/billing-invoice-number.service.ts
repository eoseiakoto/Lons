import { Injectable } from '@nestjs/common';

import { PrismaService } from '@lons/database';

/**
 * Sprint 14 (S14-12) — sequential invoice number generator.
 *
 * Format: `INV-{YYYY}-{NNNN}` where `NNNN` is sequential per tenant per
 * year (4 digits, zero-padded). We compute the next sequence by
 * counting existing invoices for the tenant + year and incrementing.
 *
 * **Race-condition note.** Two concurrent invoice generations could
 * both compute the same `NNNN`. The `@@unique([tenantId, invoiceNumber])`
 * Prisma constraint catches the collision; the caller retries with the
 * next number. The subscription job is single-threaded per tenant, so
 * in practice this only matters for unit-test concurrency or the rare
 * manual mark-paid flow racing with an automated generation. The
 * scheduler runs once per month with one transaction per tenant, so the
 * happy path never collides.
 */
@Injectable()
export class BillingInvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next invoice number for the tenant. Callers should
   * handle the `P2002` retry path themselves if running concurrent
   * generations.
   */
  async getNextInvoiceNumber(tenantId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `INV-${year}-`;
    const count = await this.prisma.billingInvoice.count({
      where: { tenantId, invoiceNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
}
