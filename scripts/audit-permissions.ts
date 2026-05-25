/**
 * audit-permissions.ts — catch SP-Admin permission drift before it ships.
 *
 * Scans every `@Roles(...)` invocation under apps/ and services/, extracts
 * the permission strings (anything matching `^[a-z_]+:[a-z_]+$` —
 * deliberately excluding ALL-CAPS or single-word role names like `admin`,
 * `SP_ADMIN`, `operator`), and diffs the resulting catalog against the
 * `allPermissions` list baked into `packages/database/prisma/seed.ts`.
 *
 * Drift directions:
 *   - **MissingFromSeed**: a resolver requires `foo:bar` but no role row
 *     gets that permission in the seed → on a clean reseed, the feature
 *     is silently inaccessible to every existing tenant admin. This is
 *     the failure mode we hit in Sprint 14 with `factoring:verify`.
 *   - **UnusedInSeed**: a permission listed in the seed has no
 *     `@Roles(...)` reference anywhere. Not strictly dangerous, but
 *     usually a sign of dead code or a permission that was renamed
 *     without cleaning up the catalog.
 *
 * The Jest test in tests/regression/permission-catalog-drift.spec.ts
 * fails the build on any MissingFromSeed entry. UnusedInSeed is a
 * warning surfaced by the CLI but does not fail CI by default.
 *
 * Usage:
 *   pnpm audit:permissions          # exits 1 on MissingFromSeed
 *   pnpm audit:permissions --strict # also exits 1 on UnusedInSeed
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, sep } from 'path';

export interface AuditResult {
  /** Every permission referenced by an @Roles decorator anywhere. */
  fromResolvers: string[];
  /** Every permission listed in the seed's allPermissions array. */
  fromSeed: string[];
  /** Referenced by resolvers but missing from the seed — dangerous. */
  missingFromSeed: string[];
  /** Listed in the seed but not referenced anywhere — likely stale. */
  unusedInSeed: string[];
}

const PROJECT_ROOT = join(__dirname, '..');

// Permission shape: lowercase identifier, colon, lowercase identifier.
// Tight enough to skip role names (`admin`, `SP_ADMIN`, `operator`) and
// loose enough to admit underscores (`bnpl_credit_line:adjust`).
const PERMISSION_RE = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/**
 * Permissions intentionally NOT granted to tenant-scope roles in the
 * seed. These guard platform-portal endpoints; platform admins satisfy
 * them via the `permissions: ['*']` wildcard issued in their JWT, so
 * no tenant role needs them. Listed here so the audit doesn't flag
 * them as drift.
 *
 * Add new entries when introducing platform-only resolvers.
 */
export const PLATFORM_ONLY_PERMISSIONS = new Set<string>([
  'platform:admin',
]);

// Skip dist / node_modules / archived migrations / __tests__ when scanning.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '__tests__',
  '__snapshots__',
  'migrations-archive-2026-05-19',
]);

// Strings inside test files often reference @Roles for mocking; we scan
// them too for completeness but the test itself can filter if needed.
const SCAN_ROOTS = ['apps', 'services'];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walkTsFiles(p, out);
    } else if (s.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) {
      // Skip spec/test files — they reference permissions for mock setup
      // and that's fine, but they're noisy if a developer typoes a test
      // permission. The test for this module re-checks production files
      // only, so we restrict scanning here too.
      if (/\.spec\.ts$|\.test\.ts$|\.e2e-spec\.ts$/.test(p)) continue;
      out.push(p);
    }
  }
  return out;
}

/**
 * Extract permission strings from `@Roles(...)` invocations in the
 * given source text. Handles single/double quotes and multiple
 * comma-separated arguments per invocation. Strings that don't match
 * the permission shape (role names like `admin`) are dropped.
 */
export function extractPermissionsFromSource(source: string): string[] {
  const found: string[] = [];
  // Match `@Roles( ... )` allowing newlines inside the parens. Capture
  // group 1 is the contents between the parens.
  const rolesRe = /@Roles\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = rolesRe.exec(source)) !== null) {
    const args = m[1];
    const stringRe = /['"]([^'"]+)['"]/g;
    let sm: RegExpExecArray | null;
    while ((sm = stringRe.exec(args)) !== null) {
      const candidate = sm[1];
      if (PERMISSION_RE.test(candidate)) found.push(candidate);
    }
  }
  return found;
}

/**
 * Read packages/database/prisma/seed.ts and pull the `allPermissions`
 * array literal. Returns the strings in source order.
 *
 * Brittle by design — we want this to break loudly if someone refactors
 * the seed in a way that hides permissions (e.g. constructs the array
 * dynamically). Better a failing audit than a silent miss.
 */
export function extractSeedPermissions(seedSource: string): string[] {
  const blockRe = /const\s+allPermissions\s*=\s*\[([\s\S]*?)\]/;
  const match = blockRe.exec(seedSource);
  if (!match) {
    throw new Error(
      'Could not find `const allPermissions = [ ... ]` in seed source. ' +
        'If the seed was refactored, update audit-permissions.ts to match.',
    );
  }
  const body = match[1];
  const out: string[] = [];
  const stringRe = /['"]([^'"]+)['"]/g;
  let sm: RegExpExecArray | null;
  while ((sm = stringRe.exec(body)) !== null) {
    out.push(sm[1]);
  }
  return out;
}

export function audit(): AuditResult {
  // Collect from resolvers.
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walkTsFiles(join(PROJECT_ROOT, root), files);
  }
  const resolverSet = new Set<string>();
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (!src.includes('@Roles')) continue; // fast path
    for (const p of extractPermissionsFromSource(src)) resolverSet.add(p);
  }

  // Collect from seed.
  const seedPath = join(
    PROJECT_ROOT,
    'packages',
    'database',
    'prisma',
    'seed.ts',
  );
  const seedSource = readFileSync(seedPath, 'utf8');
  const seedList = extractSeedPermissions(seedSource);
  const seedSet = new Set(seedList);

  const fromResolvers = [...resolverSet].sort();
  const fromSeed = [...seedSet].sort();
  // Platform-only permissions are deliberately absent from the tenant
  // role catalog — exclude them from the missing-from-seed signal.
  const missingFromSeed = fromResolvers.filter(
    (p) => !seedSet.has(p) && !PLATFORM_ONLY_PERMISSIONS.has(p),
  );
  const unusedInSeed = fromSeed.filter((p) => !resolverSet.has(p));

  return { fromResolvers, fromSeed, missingFromSeed, unusedInSeed };
}

function formatList(items: string[]): string {
  if (items.length === 0) return '  (none)';
  return items.map((p) => `  - '${p}',`).join('\n');
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const result = audit();

  console.log('Permission catalog audit');
  console.log('========================\n');
  console.log(`Resolvers reference ${result.fromResolvers.length} permission(s)`);
  console.log(`Seed lists         ${result.fromSeed.length} permission(s)\n`);

  if (result.missingFromSeed.length > 0) {
    console.error(
      `[31m✗ MISSING FROM SEED (${result.missingFromSeed.length}) — ` +
        'tenants reseeded after this point would lose access:[0m',
    );
    console.error(formatList(result.missingFromSeed));
    console.error(
      '\nAction: add these strings to `allPermissions` in ' +
        'packages/database/prisma/seed.ts, then re-seed (or UPDATE the live ' +
        'roles row to refresh existing tenants).\n',
    );
  } else {
    console.log('[32m✓ No permissions missing from seed.[0m');
  }

  if (result.unusedInSeed.length > 0) {
    console.warn(
      `\n[33m⚠ UNUSED IN SEED (${result.unusedInSeed.length}) — ` +
        'listed but not referenced by any resolver:[0m',
    );
    console.warn(formatList(result.unusedInSeed));
    if (strict) {
      console.warn('\n(--strict: failing build because of unused entries.)');
    } else {
      console.warn(
        '\nNot failing build — these are usually safe but worth cleaning up.',
      );
    }
  } else {
    console.log('[32m✓ No stale entries in seed.[0m');
  }

  const fail =
    result.missingFromSeed.length > 0 ||
    (strict && result.unusedInSeed.length > 0);
  process.exit(fail ? 1 : 0);
}

// Run when invoked directly (`ts-node scripts/audit-permissions.ts`);
// re-exporting from the test file uses the module without triggering main().
const invokedDirectly =
  require.main === module ||
  // ts-node sets a slightly different require.main; fall back to argv check.
  (process.argv[1] && process.argv[1].endsWith(`${sep}audit-permissions.ts`));

if (invokedDirectly) {
  main();
}
