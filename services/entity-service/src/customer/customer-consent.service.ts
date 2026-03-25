import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { ConsentType } from '@lons/database';

@Injectable()
export class CustomerConsentService {
  constructor(private prisma: PrismaService) {}

  async grantConsent(tenantId: string, customerId: string, data: {
    consentType: string;
    channel?: string;
    ipAddress?: string;
  }) {
    const existing = await this.prisma.customerConsent.findFirst({
      where: { tenantId, customerId, consentType: data.consentType as ConsentType },
    });

    if (existing) {
      return this.prisma.customerConsent.update({
        where: { id: existing.id },
        data: {
          granted: true,
          grantedAt: new Date(),
          revokedAt: null,
          channel: data.channel,
          ipAddress: data.ipAddress,
          version: existing.version + 1,
        },
      });
    }

    return this.prisma.customerConsent.create({
      data: {
        tenantId,
        customerId,
        consentType: data.consentType as ConsentType,
        granted: true,
        grantedAt: new Date(),
        channel: data.channel,
        ipAddress: data.ipAddress,
      },
    });
  }

  async revokeConsent(tenantId: string, customerId: string, consentType: string) {
    const consent = await this.prisma.customerConsent.findFirst({
      where: { tenantId, customerId, consentType: consentType as ConsentType },
    });
    if (!consent) return null;

    return this.prisma.customerConsent.update({
      where: { id: consent.id },
      data: { granted: false, revokedAt: new Date() },
    });
  }

  async getConsents(tenantId: string, customerId: string) {
    return this.prisma.customerConsent.findMany({
      where: { tenantId, customerId },
      orderBy: { consentType: 'asc' },
    });
  }
}
