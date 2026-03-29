/**
 * Declarative configuration of which Prisma model fields should be encrypted at rest.
 * Keys are Prisma model names (PascalCase), values are arrays of field names (camelCase).
 */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Customer: ['nationalId', 'phonePrimary', 'phoneSecondary', 'email', 'dateOfBirth', 'fullName'],
};
