import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  NotFoundError,
  ValidationError,
  computeSearchableHash,
} from '@lons/common';

import { QuotaEnforcementService } from '../plan-tier/quota-enforcement.service';
import { CustomerDedupService } from './customer-dedup.service';

/**
 * S17-8 / FR-CM-001.3 — new shape for `create()`. The previous return
 * type was the bare `Customer`; we now return a tagged result so callers
 * can tell whether the customer was created or matched against an
 * existing record under a dedup rule.
 */
export interface CustomerCreateResult {
  customer: Awaited<ReturnType<PrismaService['customer']['create']>>;
  isDuplicate: boolean;
  matchedRule: string | null;
}

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private prisma: PrismaService,
    // Sprint 14 (S14-10): plan-tier customer-quota enforcement.
    private quotaEnforcementService: QuotaEnforcementService,
    // S17-8 (FR-CM-001.3): configurable de-duplication.
    private dedupService: CustomerDedupService,
  ) {}

  async create(tenantId: string, data: {
    externalId: string;
    externalSource?: string;
    fullName?: string;
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other' | 'undisclosed';
    nationalId?: string;
    nationalIdType?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    email?: string;
    country?: string;
    region?: string;
    city?: string;
    kycLevel?: 'none' | 'tier_1' | 'tier_2' | 'tier_3';
    metadata?: Prisma.InputJsonValue;
  }): Promise<CustomerCreateResult> {
    // Sprint 14 (S14-10): customer-count quota gate before any DB write.
    // Throws ForbiddenException({ code: 'QUOTA_EXCEEDED', ... }) when
    // the tenant is at its plan's customer cap. We still run the gate
    // BEFORE dedup — a duplicate match is cheap to compute and the
    // quota check is a single Redis call, but the call order matters for
    // tenants near the cap (they get a clear quota error rather than
    // sometimes-success / sometimes-quota depending on duplicate state).
    await this.quotaEnforcementService.checkEntityLimit(tenantId, 'customers');

    // S17-8 (FR-CM-001.3): configurable matching rules. The dedup
    // service evaluates rules in priority order and falls back to the
    // legacy externalId check when no rules are configured for the
    // tenant. A match here is NOT an error — it's an idempotent re-sync
    // of the upstream customer record. The caller decides what to do
    // with the returned `isDuplicate` flag (most just return the
    // existing customer; a write-through flow may merge new fields).
    const duplicateResult = await this.dedupService.findDuplicate(
      tenantId,
      data,
    );
    if (duplicateResult && duplicateResult.match) {
      this.logger.log(
        `Duplicate customer found via rule "${duplicateResult.matchedRule}" — ` +
          `returning existing id=${duplicateResult.match.id}`,
      );
      return {
        customer: duplicateResult.match as Awaited<
          ReturnType<PrismaService['customer']['create']>
        >,
        isDuplicate: true,
        matchedRule: duplicateResult.matchedRule,
      };
    }

    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        externalId: data.externalId,
        externalSource: data.externalSource,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        nationalId: data.nationalId,
        nationalIdType: data.nationalIdType,
        phonePrimary: data.phonePrimary,
        phoneSecondary: data.phoneSecondary,
        email: data.email,
        country: data.country,
        region: data.region,
        city: data.city,
        kycLevel: data.kycLevel,
        metadata: data.metadata ?? undefined,
        status: 'active',
      },
    });
    return { customer, isDuplicate: false, matchedRule: null };
  }

  async findById(tenantId: string | undefined, id: string) {
    const where: Prisma.CustomerWhereInput = { id, deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    const customer = await this.prisma.customer.findFirst({ where });
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }

  async findByExternalId(tenantId: string, externalId: string, externalSource?: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, externalId, externalSource, deletedAt: null },
    });
  }

  async search(tenantId: string | undefined, filters: {
    status?: string;
    kycLevel?: string;
    segment?: string;
    phonePrimary?: string;
    externalId?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    if (filters.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters.kycLevel) where.kycLevel = filters.kycLevel as Prisma.EnumKycLevelFilter['equals'];
    if (filters.segment) where.segment = filters.segment;
    // Security Hardening (SEC-1): phonePrimary is encrypted at rest. The
    // legacy `where.phonePrimary = filters.phonePrimary` compared plaintext
    // to AES-GCM ciphertext (random IV) and silently returned empty — every
    // call. Equality lookup now routes through the deterministic
    // phonePrimaryHash companion column.
    if (filters.phonePrimary) {
      where.phonePrimaryHash = computeSearchableHash(filters.phonePrimary);
    }
    if (filters.externalId) where.externalId = filters.externalId;

    const customers = await this.prisma.customer.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return { items: customers.slice(0, take), hasMore: customers.length > take };
  }

  /**
   * Security Hardening (SEC-1): build the OR clause for free-text customer
   * search. The encrypted PII columns (`fullName`, `phonePrimary`, `email`)
   * cannot be substring-matched against ciphertext, so we expose only:
   *   - `externalId` (plaintext) — partial match
   *   - `phonePrimaryHash` (deterministic HMAC) — exact match when the
   *     search string normalises to a stored phone number
   *   - `emailHash` — exact match when the search looks like an email
   *
   * **Known trade-off:** name / partial-phone / partial-email substring
   * search is gone. Operators searching for "John" can no longer surface
   * customers by name. Re-introducing partial PII search requires a
   * tokenised search index outside the encrypted column (out of scope
   * here — see SECURITY-HARDENING-2026-05-10.md §"Tests" notes).
   */
  private buildSearchOr(
    search: string,
  ): Prisma.CustomerWhereInput['OR'] {
    const normalised = search.trim();
    if (normalised === '') return undefined;
    const hash = computeSearchableHash(normalised);
    const clauses: Prisma.CustomerWhereInput[] = [
      { externalId: { contains: normalised } },
    ];
    if (hash) {
      // Same hash works for any encrypted PII column — `phonePrimary` and
      // `email` lookups both exact-match it. We don't try to disambiguate
      // (the worst case is an over-permissive OR, which is fine for a
      // search box).
      clauses.push({ phonePrimaryHash: hash });
      clauses.push({ emailHash: hash });
    }
    return clauses;
  }

  async findAll(tenantId: string, filters?: {
    skip?: number;
    take?: number;
    search?: string;
    status?: string;
  }) {
    const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
    if (filters?.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters?.search) {
      const or = this.buildSearchOr(filters.search);
      if (or) where.OR = or;
    }

    return this.prisma.customer.findMany({
      where,
      skip: filters?.skip ?? 0,
      take: filters?.take ?? 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string, filters?: {
    search?: string;
    status?: string;
  }) {
    const where: Prisma.CustomerWhereInput = { tenantId, deletedAt: null };
    if (filters?.status) where.status = filters.status as Prisma.EnumCustomerStatusFilter['equals'];
    if (filters?.search) {
      const or = this.buildSearchOr(filters.search);
      if (or) where.OR = or;
    }

    return this.prisma.customer.count({ where });
  }

  async update(tenantId: string, id: string, data: {
    fullName?: string;
    phonePrimary?: string;
    phoneSecondary?: string;
    email?: string;
    country?: string;
    region?: string;
    city?: string;
    kycLevel?: 'none' | 'tier_1' | 'tier_2' | 'tier_3';
    segment?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.findById(tenantId, id);

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.phonePrimary !== undefined) updateData.phonePrimary = data.phonePrimary;
    if (data.phoneSecondary !== undefined) updateData.phoneSecondary = data.phoneSecondary;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.kycLevel !== undefined) updateData.kycLevel = data.kycLevel;
    if (data.segment !== undefined) updateData.segment = data.segment;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    return this.prisma.customer.update({ where: { id }, data: updateData });
  }

  async blacklist(tenantId: string, id: string, reason: string) {
    const customer = await this.findById(tenantId, id);
    if (customer.status === 'blacklisted') {
      throw new ValidationError('Customer is already blacklisted');
    }
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'blacklisted', blacklistReason: reason },
    });
  }

  async unblacklist(tenantId: string, id: string) {
    const customer = await this.findById(tenantId, id);
    if (customer.status !== 'blacklisted') {
      throw new ValidationError('Customer is not blacklisted');
    }
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'active', blacklistReason: null },
    });
  }
}
