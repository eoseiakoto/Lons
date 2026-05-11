/**
 * Sprint 13B (S13B-2) — PII encryption field expansion.
 *
 * Declarative configuration of which Prisma model fields the
 * field-encryption middleware (`field-encryption.middleware.ts`) auto-
 * encrypts on write and auto-decrypts on read. Source of truth for
 * FR-SEC-006.1–3 (`Docs/10-security-compliance.md` §3): national IDs,
 * full names paired with national ID, phone numbers, and email addresses
 * are encrypted at rest.
 *
 * Models with companion `*Hash` columns:
 *   - `PlatformUser.email`  → `PlatformUser.emailHash` (login lookup)
 *   - `User.email`          → `User.emailHash` (tenant-scoped login lookup)
 *   - `Debtor.taxId`        → `Debtor.taxIdHash` (debtor-payment matching)
 *   - `Debtor.registrationNumber` → `Debtor.registrationNumberHash`
 *
 * Hash columns hold SHA-256(lowercase(trim(value))) so equality lookups
 * survive encryption. `email-hash.util.ts` is the canonical helper.
 *
 * Keys are Prisma model names (PascalCase), values are field names
 * (camelCase) that the middleware will transparently encrypt.
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  // Customer (Sprint 7 baseline) — KYC PII for end consumers.
  Customer: [
    'nationalId',
    'phonePrimary',
    'phoneSecondary',
    'email',
    'dateOfBirth',
    'fullName',
  ],

  // Platform admin users — login-by-email lookup uses `emailHash`.
  PlatformUser: ['email'],

  // Tenant-scoped operator users — login uses `emailHash`.
  User: ['email', 'phone'],

  // Factoring debtors — corporate PII + government identifiers used by the
  // debtor-payment matching service. `taxIdHash` and `registrationNumberHash`
  // companion columns drive lookups.
  Debtor: ['contactEmail', 'contactPhone', 'contactName', 'taxId', 'registrationNumber'],

  // BNPL merchants — contact channel PII.
  Merchant: ['contactEmail', 'contactPhone'],
};
