import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';

/**
 * Consent Service
 *
 * Manages CreditBureauConsent records for tracking customer consent
 * to credit bureau queries. Supports recording, checking, revoking,
 * and listing consents per customer/tenant/bureau.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger('ConsentService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a new credit bureau consent for a customer.
   * Creates a CreditBureauConsent record with the specified expiry.
   */
  async recordConsent(
    tenantId: string,
    customerId: string,
    bureauType: string,
    expiresInMonths: number = 12,
  ) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + expiresInMonths);

    this.logger.log(
      `Recording consent for customer ${customerId}, bureau: ${bureauType}, expires: ${expiresAt.toISOString()}`,
    );

    return (this.prisma as any).creditBureauConsent.create({
      data: {
        tenantId,
        customerId,
        bureauType,
        consentGiven: true,
        consentDate: now,
        expiresAt,
      },
    });
  }

  /**
   * Alias for recordConsent for convenience.
   */
  async grantConsent(
    tenantId: string,
    customerId: string,
    bureauType: string,
    expiresAt?: Date,
  ) {
    const expiresInMonths = expiresAt
      ? Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
      : 12;
    return this.recordConsent(tenantId, customerId, bureauType, expiresInMonths);
  }

  /**
   * Check if a valid (non-expired, non-revoked) consent exists
   * for the given customer and bureau type.
   */
  async hasValidConsent(
    tenantId: string,
    customerId: string,
    bureauType: string,
  ): Promise<boolean> {
    const consent = await (this.prisma as any).creditBureauConsent.findFirst({
      where: {
        tenantId,
        customerId,
        bureauType,
        consentGiven: true,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { consentDate: 'desc' },
    });

    const hasConsent = !!consent;
    this.logger.debug(
      `Consent check for customer ${customerId}, bureau ${bureauType}: ${hasConsent}`,
    );

    return hasConsent;
  }

  /**
   * Revoke consent for a customer and bureau type.
   * Sets revokedAt on the most recent active consent.
   */
  async revokeConsent(
    tenantId: string,
    customerId: string,
    bureauType: string,
  ): Promise<boolean> {
    const consent = await (this.prisma as any).creditBureauConsent.findFirst({
      where: {
        tenantId,
        customerId,
        bureauType,
        consentGiven: true,
        revokedAt: null,
      },
      orderBy: { consentDate: 'desc' },
    });

    if (!consent) {
      this.logger.warn(
        `No active consent found to revoke for customer ${customerId}, bureau ${bureauType}`,
      );
      return false;
    }

    await (this.prisma as any).creditBureauConsent.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });

    this.logger.log(
      `Consent revoked for customer ${customerId}, bureau ${bureauType}`,
    );

    return true;
  }

  /**
   * List all consents for a customer within a tenant.
   */
  async getConsents(tenantId: string, customerId: string) {
    return (this.prisma as any).creditBureauConsent.findMany({
      where: { tenantId, customerId },
      orderBy: { consentDate: 'desc' },
    });
  }
}
