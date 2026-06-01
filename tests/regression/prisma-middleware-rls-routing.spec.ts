/**
 * Q7.2 PrismaService middleware-routing regression (2026-05-30).
 *
 * Pins the actual cross-process behaviour the fix achieves:
 *   - bare `prisma.X.find(...)` inside `enterTenantContext` now
 *     transparently routes through the in-tx connection where
 *     SET LOCAL is active → RLS admits the row.
 *   - explicit `scoped()` callers are unaffected.
 *   - sequential ops in the same context don't deadlock or recurse.
 *   - the per-tx WeakSet recursion guard one-shot semantics survive
 *     the second middleware fire that the re-dispatch triggers.
 *
 * Requires:
 *   - Real Postgres with the lons_app role + RLS migration applied
 *   - DATABASE_URL pointing at lons_app (RLS-enforcing)
 *   - ENCRYPTION_KEY + HASH_PEPPER from .env
 *   - A seeded SP Admin user with a known tenantId
 *
 * If any of those are missing, the test SKIPS rather than failing —
 * keeps the regression suite green in CI environments without a
 * fully-seeded DB. Run locally to validate.
 */
// Import from the built dist — tests/regression has no path mapping to
// the @lons/database workspace package, but the built file is stable
// and the only thing we need is the PrismaService class. Run
// `pnpm --filter @lons/database build` before this spec.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaService } = require('../../packages/database/dist/prisma.service.js') as {
  PrismaService: new () => any;
};

const TENANT_ID = process.env.RLS_TEST_TENANT_ID ?? 'f491cf48-45ed-4a25-b08a-651fd059e2bd';
const USER_ID = process.env.RLS_TEST_USER_ID ?? '412f3f70-4f04-48fa-bc80-330a9038b17f';

const hasRequiredEnv =
  !!process.env.DATABASE_URL &&
  !!process.env.ENCRYPTION_KEY &&
  !!process.env.HASH_PEPPER;

const describeRealDb = hasRequiredEnv ? describe : describe.skip;

describeRealDb('PrismaService middleware Q7.2 — singleton-call re-routing', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('TEST 1 — bare singleton WITHOUT context returns NULL (RLS filters)', async () => {
    // Sanity: confirms RLS is actually enforcing on this DB role.
    // If this returns a row, the runtime is using lons (owner) which
    // bypasses RLS — the whole audit doc is moot.
    const r = await prisma.user.findFirst({ where: { id: USER_ID } });
    expect(r).toBeNull();
  });

  it('TEST 2 — bare singleton INSIDE enterTenantContext returns the row (THE FIX)', async () => {
    // Pre-fix: NULL (singleton dispatched on pool, no SET LOCAL).
    // Post-fix: row (middleware re-dispatches onto ctx.tx, SET LOCAL active).
    const r = await prisma.enterTenantContext(
      { tenantId: TENANT_ID },
      async () => prisma.user.findFirst({ where: { id: USER_ID } }),
    );
    expect(r).not.toBeNull();
    expect(r!.id).toBe(USER_ID);
  });

  it('TEST 3 — explicit scoped() path is unchanged', async () => {
    // The Q7.2 fix MUST NOT regress the existing explicit pattern that
    // every recent service-level fix already adopted.
    const r = await prisma.enterTenantContext(
      { tenantId: TENANT_ID },
      async () => {
        const tx = prisma.scoped();
        return tx.user.findFirst({ where: { id: USER_ID } });
      },
    );
    expect(r).not.toBeNull();
    expect(r!.id).toBe(USER_ID);
  });

  it('TEST 4 — sequential ops in same enterTenantContext both succeed (no recursion/deadlock)', async () => {
    // Verifies the per-tx WeakSet flag is properly one-shot — the
    // second op in the same context must NOT see a stale flag.
    const out = await prisma.enterTenantContext(
      { tenantId: TENANT_ID },
      async () => {
        const a = await prisma.user.findFirst({ where: { id: USER_ID } });
        const b = await prisma.user.findMany({ where: { tenantId: TENANT_ID, deletedAt: null } });
        return { a, listCount: b.length };
      },
    );
    expect(out.a).not.toBeNull();
    expect(out.listCount).toBeGreaterThan(0);
  });

  it('TEST 5 — mixed singleton + scoped() ops in same context both succeed', async () => {
    // Real-world pattern: some legacy code uses bare singleton (auto-
    // routed by Q7.2), some explicit code uses scoped(). Both must work
    // in the same enterTenantContext frame.
    const out = await prisma.enterTenantContext(
      { tenantId: TENANT_ID },
      async () => {
        const fromSingleton = await prisma.user.findFirst({ where: { id: USER_ID } });
        const tx = prisma.scoped();
        const fromScoped = await tx.user.findFirst({ where: { id: USER_ID } });
        return { fromSingleton, fromScoped };
      },
    );
    expect(out.fromSingleton).not.toBeNull();
    expect(out.fromScoped).not.toBeNull();
    expect(out.fromSingleton!.id).toBe(out.fromScoped!.id);
  });

  it('TEST 6 — repeated entries to enterTenantContext don\'t leak per-tx flag state', async () => {
    // The TX_ROUTING_FLAG WeakSet is keyed on tx instance. Each
    // enterTenantContext invocation gets a fresh tx, so no flag could
    // leak. Verify by running 5 consecutive contexts and asserting
    // every one returns the row.
    for (let i = 0; i < 5; i++) {
      const r = await prisma.enterTenantContext(
        { tenantId: TENANT_ID },
        async () => prisma.user.findFirst({ where: { id: USER_ID } }),
      );
      expect(r).not.toBeNull();
      expect(r!.id).toBe(USER_ID);
    }
  });
});
