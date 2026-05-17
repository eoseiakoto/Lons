import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { computeSearchableHash } from '@lons/common';

/**
 * S17-8 / FR-CM-001.3 — Configurable customer de-duplication.
 *
 * The default behaviour pre-S17-8 was to reject any `externalId` already
 * known to the tenant. That fails the moment two upstream channels send
 * the same customer with different external IDs (USSD vs mobile-app vs
 * agent portal), creating duplicate customer records and forking the
 * loan history. The spec calls for matching rules of the form:
 *
 *   - National ID alone
 *   - Phone + date of birth
 *   - Email + full name
 *
 * stored in `CustomerMatchingRule` rows (one Prisma row per rule per
 * tenant), evaluated in priority order. The first rule that matches
 * wins. If no rules are configured we fall back to the legacy
 * `externalId` lookup to avoid silently creating duplicates during the
 * migration window.
 *
 * **PII / encrypted field handling**
 *
 * `nationalId`, `phonePrimary`, and `email` are encrypted at rest with
 * AES-256-GCM (random IV per write). Direct equality on the ciphertext
 * is impossible. Sprint 13B (SEC-1) added companion `*_hash` columns
 * (deterministic HMAC-SHA-256 of the normalised lowercase value) for
 * indexed equality lookups; we route every encrypted-field match through
 * the hash column via `computeSearchableHash`. Plaintext fields
 * (`dateOfBirth`, `fullName`) compare directly.
 *
 * Note: `fullName` is technically encrypted as well but lacks a hash
 * column on purpose (see SECURITY-HARDENING-2026-05-10.md — full-name
 * hashing leaks demographic information without enabling a useful
 * lookup). The "Email + Name" rule therefore degrades to an email-only
 * match — fullName cannot contribute to the WHERE clause. Documenting
 * here rather than silently dropping the field.
 */
export interface CustomerDedupCandidate {
  externalId: string;
  externalSource?: string;
  fullName?: string;
  dateOfBirth?: Date;
  nationalId?: string;
  phonePrimary?: string;
  email?: string;
  [key: string]: unknown;
}

export interface CustomerDedupMatch {
  match: Awaited<ReturnType<PrismaService['customer']['findFirst']>>;
  matchedRule: string;
}

const FIELDS_REQUIRING_HASH: Record<string, string> = {
  nationalId: 'nationalIdHash',
  phonePrimary: 'phonePrimaryHash',
  email: 'emailHash',
};

@Injectable()
export class CustomerDedupService {
  private readonly logger = new Logger(CustomerDedupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Check for an existing customer that matches `candidateData` under any
   * configured rule. Returns the first match in priority order, or null
   * when no rule fires (the caller should then create a new customer).
   */
  async findDuplicate(
    tenantId: string,
    candidateData: CustomerDedupCandidate,
  ): Promise<CustomerDedupMatch | null> {
    const rules = await this.prisma.customerMatchingRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (rules.length === 0) {
      // No rules configured → legacy externalId check (returns null when
      // the tenant has never seen this externalId — the create path then
      // proceeds normally).
      return this.checkByExternalId(tenantId, candidateData);
    }

    for (const rule of rules) {
      const matchFields = this.coerceMatchFields(rule.matchFields);
      if (matchFields.length === 0) continue;
      const match = await this.checkRule(tenantId, candidateData, matchFields);
      if (match) {
        return { match, matchedRule: rule.name };
      }
    }

    return null;
  }

  /**
   * Internal: legacy fallback used when no rules are configured. Kept as
   * a single place to control the migration window — once every tenant
   * has seeded rules this path becomes dead code we can remove.
   */
  private async checkByExternalId(
    tenantId: string,
    data: CustomerDedupCandidate,
  ): Promise<CustomerDedupMatch | null> {
    if (!data.externalId) return null;
    const existing = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        externalId: data.externalId,
        externalSource: data.externalSource,
        deletedAt: null,
      },
    });
    if (!existing) return null;
    return { match: existing, matchedRule: 'Legacy externalId' };
  }

  /**
   * Internal: evaluate a single rule. Every field in the rule's
   * `matchFields` must have a non-empty value in the candidate AND must
   * resolve to a usable column in the WHERE clause. Missing or
   * un-searchable fields short-circuit the rule (return null) — we never
   * want a missing email to silently match "every customer with no email".
   */
  private async checkRule(
    tenantId: string,
    data: CustomerDedupCandidate,
    fields: string[],
  ): Promise<CustomerDedupCandidate extends never ? never : Awaited<
    ReturnType<PrismaService['customer']['findFirst']>
  >> {
    const where: Prisma.CustomerWhereInput & Record<string, unknown> = {
      tenantId,
      deletedAt: null,
    };

    for (const field of fields) {
      const rawValue = (data as Record<string, unknown>)[field];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        // Can't match on a missing field — abandon this rule.
        return null as never;
      }

      if (field === 'fullName') {
        // See class docstring: fullName has no hash column by design.
        // Skip silently — the rest of the rule still has to match.
        continue;
      }

      const hashColumn = FIELDS_REQUIRING_HASH[field];
      if (hashColumn) {
        const hash = computeSearchableHash(String(rawValue));
        if (!hash) return null as never;
        where[hashColumn] = hash;
      } else if (field === 'dateOfBirth') {
        // Prisma expects a Date; accept both Date and ISO string.
        where.dateOfBirth =
          rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      } else {
        where[field] = rawValue;
      }
    }

    // After the loop, if every field in the rule was fullName-only the
    // WHERE clause would be `{ tenantId, deletedAt: null }` and we'd
    // match arbitrary customers. Guard against that pathological case.
    const meaningfulKeys = Object.keys(where).filter(
      (k) => k !== 'tenantId' && k !== 'deletedAt',
    );
    if (meaningfulKeys.length === 0) return null as never;

    return this.prisma.customer.findFirst({ where }) as never;
  }

  /**
   * Coerce the `matchFields` JSON column to a string[]. Defensive against
   * malformed data — rule rows are seeded but operator UI is planned, so
   * a typo there shouldn't crash dedup for every customer create.
   */
  private coerceMatchFields(raw: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string' && item.length > 0) {
        out.push(item);
      }
    }
    return out;
  }
}
