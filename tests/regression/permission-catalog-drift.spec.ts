/**
 * Catches the systemic drift we hit in Sprint 14: a resolver added
 * `@Roles('factoring:verify')` but no role row got that permission in
 * the seed, so on a clean reseed the feature became silently
 * inaccessible to every tenant admin.
 *
 * The audit in `scripts/audit-permissions.ts` scans every
 * `@Roles('foo:bar')` invocation under apps/ and services/ and compares
 * the union to the `allPermissions` array in
 * `packages/database/prisma/seed.ts`. This spec asserts the diff is
 * empty — the build fails fast if anyone adds a permission to a
 * resolver without backfilling the seed.
 */
import { audit } from '../../scripts/audit-permissions';

describe('SP Admin permission catalog drift', () => {
  it('every @Roles(...) permission is present in seed allPermissions', () => {
    const result = audit();

    if (result.missingFromSeed.length > 0) {
      // Build a developer-friendly message right in the failure so the
      // CI log makes the fix obvious without needing to run the audit
      // script locally.
      const lines = result.missingFromSeed
        .map((p) => `    '${p}',`)
        .join('\n');
      throw new Error(
        `Permission catalog drift detected.\n\n` +
          `These permissions are required by @Roles(...) decorators but ` +
          `not listed in allPermissions in packages/database/prisma/seed.ts:\n\n` +
          `${lines}\n\n` +
          `Fix: add them to allPermissions, then either re-seed the dev DB ` +
          `(\`pnpm --filter database db:seed\`) or update live role rows ` +
          `with a one-off SQL UPDATE so existing tenants pick them up.`,
      );
    }

    expect(result.missingFromSeed).toEqual([]);
  });

  // Unused-in-seed is a softer signal — leave it as a console warning
  // surfaced by the CLI rather than a build failure. Promote to an
  // expect() when the catalog stabilises and stale entries become a
  // signal of dead code worth cleaning.
});
