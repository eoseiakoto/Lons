import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { TenantService, TenantOnboardingService, PasswordService, Roles, CurrentTenant } from '@lons/entity-service';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType, TenantSettingsSchema } from '@lons/common';
import { Prisma } from '@lons/database';

import { TenantType, TenantConnection } from '../types/tenant.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreateTenantInput } from '../inputs/create-tenant.input';
import { UpdateTenantInput } from '../inputs/update-tenant.input';

function formatZodErrors(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const zodErr = err as { errors: { path: (string | number)[]; message: string }[] };
    return zodErr.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
  }
  return String(err);
}

@Resolver(() => TenantType)
export class TenantResolver {
  constructor(
    private tenantService: TenantService,
    private onboardingService: TenantOnboardingService,
    private passwordService: PasswordService,
  ) {}

  @Query(() => TenantType)
  async myTenant(
    @CurrentTenant() tenantId: string,
  ): Promise<TenantType> {
    return this.tenantService.findById(tenantId) as unknown as TenantType;
  }

  @Query(() => TenantConnection)
  @Roles('tenant:read')
  async tenants(
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<TenantConnection> {
    const take = pagination?.first || 20;
    const result = await this.tenantService.findAll(take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((t: any) => ({ node: t as TenantType, cursor: encodeCursor(t.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => TenantType)
  @Roles('tenant:read')
  async tenant(@Args('id', { type: () => ID }) id: string): Promise<TenantType> {
    return this.tenantService.findById(id) as unknown as TenantType;
  }

  @Mutation(() => TenantType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.TENANT)
  @Roles('tenant:create')
  async createTenant(
    @Args('input') input: CreateTenantInput,
  ): Promise<TenantType> {
    this.passwordService.validateStrength(input.adminPassword);
    const adminPasswordHash = await this.passwordService.hash(input.adminPassword);

    // Validate settings against Zod schema
    let parsedSettings;
    try {
      parsedSettings = input.settings
        ? TenantSettingsSchema.parse(input.settings)
        : TenantSettingsSchema.parse({});
    } catch (err) {
      throw new Error(`Invalid settings: ${formatZodErrors(err)}`);
    }

    const result = await this.onboardingService.onboard({
      name: input.name,
      slug: input.slug,
      legalName: input.legalName,
      registrationNumber: input.registrationNumber,
      country: input.country,
      planTier: (input.planTier as 'starter' | 'growth' | 'enterprise') || 'starter',
      platformFeePercent: input.platformFeePercent ? new Prisma.Decimal(input.platformFeePercent) : undefined,
      settings: parsedSettings as any,
      adminName: input.adminName,
      adminEmail: input.adminEmail,
      adminPasswordHash,
    });

    return result.tenant as unknown as TenantType;
  }

  @Mutation(() => TenantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.TENANT)
  @Roles('tenant:update')
  async updateTenant(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTenantInput,
  ): Promise<TenantType> {
    const updateData: Prisma.TenantUpdateInput = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.planTier !== undefined) updateData.planTier = input.planTier as any;
    if (input.status !== undefined) updateData.status = input.status as any;

    // Fields stored in settings JSON: logoUrl, primaryColor, timezone, defaultCurrency,
    // supportEmail, supportPhone, address, plus structured settings
    const hasSettingsFields = input.logoUrl !== undefined || input.primaryColor !== undefined
      || input.timezone !== undefined || input.defaultCurrency !== undefined
      || input.supportEmail !== undefined || input.supportPhone !== undefined
      || input.address !== undefined || input.settings !== undefined;

    if (hasSettingsFields) {
      // Fetch current settings to merge
      const current = await this.tenantService.findById(id);
      const existingSettings = (current as any)?.settings ?? {};
      const merged = { ...existingSettings };

      // Map convenience fields into settings
      if (input.logoUrl !== undefined) merged.branding = { ...merged.branding, logoUrl: input.logoUrl };
      if (input.primaryColor !== undefined) merged.branding = { ...merged.branding, primaryColor: input.primaryColor };
      if (input.timezone !== undefined) merged.timezone = input.timezone;
      if (input.defaultCurrency !== undefined) merged.defaultCurrency = input.defaultCurrency;
      if (input.supportEmail !== undefined) merged.supportEmail = input.supportEmail;
      if (input.supportPhone !== undefined) merged.supportPhone = input.supportPhone;
      if (input.address !== undefined) merged.address = input.address;

      // Merge structured settings if provided
      if (input.settings !== undefined) {
        Object.assign(merged, input.settings);
      }

      // Validate merged settings — use safeParse to be lenient with legacy data
      const parseResult = TenantSettingsSchema.safeParse(merged);
      if (parseResult.success) {
        updateData.settings = parseResult.data as any;
      } else {
        // Store as-is if legacy data doesn't match strict schema
        updateData.settings = merged as any;
      }
    }

    return this.tenantService.update(id, updateData) as unknown as TenantType;
  }

  // Field resolvers to extract convenience fields from settings JSON
  @ResolveField(() => String, { nullable: true })
  logoUrl(@Parent() tenant: any): string | undefined {
    return tenant.settings?.branding?.logoUrl;
  }

  @ResolveField(() => String, { nullable: true })
  primaryColor(@Parent() tenant: any): string | undefined {
    return tenant.settings?.branding?.primaryColor;
  }

  @ResolveField(() => String, { nullable: true })
  timezone(@Parent() tenant: any): string | undefined {
    return tenant.settings?.timezone;
  }

  @ResolveField(() => String, { nullable: true })
  defaultCurrency(@Parent() tenant: any): string | undefined {
    return tenant.settings?.defaultCurrency;
  }

  @ResolveField(() => String, { nullable: true })
  supportEmail(@Parent() tenant: any): string | undefined {
    return tenant.settings?.supportEmail;
  }

  @ResolveField(() => String, { nullable: true })
  supportPhone(@Parent() tenant: any): string | undefined {
    return tenant.settings?.supportPhone;
  }

  @ResolveField(() => String, { nullable: true })
  address(@Parent() tenant: any): string | undefined {
    return tenant.settings?.address;
  }

  @Mutation(() => TenantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.TENANT)
  @Roles('platform_admin')
  async setPlatformFee(
    @Args('id', { type: () => ID }) id: string,
    @Args('feePercent', { type: () => String }) feePercent: string,
  ): Promise<TenantType> {
    const fee = new Prisma.Decimal(feePercent);
    if (fee.lessThan(0) || fee.greaterThan(100)) {
      throw new Error('Platform fee must be between 0 and 100');
    }
    return this.tenantService.update(id, {
      platformFeePercent: fee,
    }) as unknown as TenantType;
  }
}
