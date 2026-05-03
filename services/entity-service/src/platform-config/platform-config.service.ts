import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';

export interface PlatformDefaults {
  maxCustomerExposure: string;
  enableCrossProductCheck: boolean;
  maxCustomerExposureMultiplier: number;
}

const PLATFORM_DEFAULTS_SLUG = '__platform_defaults__';
const PLATFORM_DEFAULTS_SCHEMA = '__platform_defaults__';

const SEED_DEFAULTS: PlatformDefaults = {
  maxCustomerExposure: '500000.00',
  enableCrossProductCheck: true,
  maxCustomerExposureMultiplier: 5,
};

@Injectable()
export class PlatformConfigService {
  constructor(private prisma: PrismaService) {}

  async getDefaults(): Promise<PlatformDefaults> {
    let tenant = await this.prisma.tenant.findUnique({
      where: { slug: PLATFORM_DEFAULTS_SLUG },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          name: 'Platform Defaults',
          slug: PLATFORM_DEFAULTS_SLUG,
          country: 'PLATFORM',
          schemaName: PLATFORM_DEFAULTS_SCHEMA,
          planTier: 'enterprise',
          status: 'active',
          settings: SEED_DEFAULTS as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const settings = (tenant.settings as Record<string, unknown>) ?? {};
    return {
      maxCustomerExposure:
        typeof settings.maxCustomerExposure === 'string'
          ? settings.maxCustomerExposure
          : SEED_DEFAULTS.maxCustomerExposure,
      enableCrossProductCheck:
        typeof settings.enableCrossProductCheck === 'boolean'
          ? settings.enableCrossProductCheck
          : SEED_DEFAULTS.enableCrossProductCheck,
      maxCustomerExposureMultiplier:
        typeof settings.maxCustomerExposureMultiplier === 'number'
          ? settings.maxCustomerExposureMultiplier
          : SEED_DEFAULTS.maxCustomerExposureMultiplier,
    };
  }

  async updateDefaults(
    input: Partial<PlatformDefaults>,
  ): Promise<PlatformDefaults> {
    const current = await this.getDefaults();

    const merged: PlatformDefaults = {
      maxCustomerExposure:
        input.maxCustomerExposure ?? current.maxCustomerExposure,
      enableCrossProductCheck:
        input.enableCrossProductCheck ?? current.enableCrossProductCheck,
      maxCustomerExposureMultiplier:
        input.maxCustomerExposureMultiplier ??
        current.maxCustomerExposureMultiplier,
    };

    await this.prisma.tenant.update({
      where: { slug: PLATFORM_DEFAULTS_SLUG },
      data: {
        settings: merged as unknown as Prisma.InputJsonValue,
      },
    });

    return merged;
  }
}
