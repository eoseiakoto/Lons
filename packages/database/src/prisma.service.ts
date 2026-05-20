import { AsyncLocalStorage } from 'async_hooks';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { createFieldEncryptionMiddleware, createKeyProvider } from '@lons/common';

/**
 * Per-request tenant context carried through async calls. Set by the
 * `RlsTenantContextInterceptor` at the controller/resolver entry point and
 * read by Prisma middleware to wire `SET LOCAL` for RLS policies.
 */
export interface TenantContext {
  /** Tenant UUID. Required unless `isPlatformAdmin` is true. */
  tenantId?: string;
  /** True for platform-tier operators that need cross-tenant access. */
  isPlatformAdmin?: boolean;
  /**
   * Active interactive transaction client when one is on the stack. The RLS
   * Prisma middleware uses this to detect "already inside a tenant-scoped tx"
   * and avoid re-wrapping (which would deadlock).
   */
  tx?: Prisma.TransactionClient;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/** Read the current tenant context from async local storage. Returns undefined outside a request. */
export function currentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * UUID v4 / v7 format guard. Used to validate tenant IDs before they're fed
 * into a SET LOCAL — even though we use parameterized `$executeRaw`, an extra
 * format check stops malformed input early and gives a clear error message.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operations that run before any business logic and shouldn't trigger an
 * implicit transaction wrap (they manage the tx themselves, or they don't
 * touch tenant-scoped data).
 */
const RAW_OPERATIONS = new Set<string>([
  'executeRaw',
  'executeRawUnsafe',
  'queryRaw',
  'queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
  '$transaction',
  '$connect',
  '$disconnect',
  '$on',
  '$use',
  '$extends',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    // Register PII field encryption middleware first — the RLS middleware
    // chains on top of it.
    const keyProvider = createKeyProvider();
    this.$use(createFieldEncryptionMiddleware(keyProvider) as any);
    this.logger.log('PII field encryption middleware registered');

    // Register RLS-context middleware. Every typed-model operation
    // (`prisma.contract.findMany`, `prisma.user.create`, etc.) goes through
    // this hook. If the request has an active tenant context but no active
    // transaction, we open a one-off interactive transaction, set the
    // session variables, and run the operation inside it. The `tx` flag in
    // ALS prevents infinite recursion when the operation re-enters via the
    // tx client's middleware chain.
    this.$use(async (params, next) => {
      const ctx = tenantContextStorage.getStore();

      // No tenant context, or this is a raw/lifecycle op — proceed normally.
      // Raw queries used by infra code (e.g. setTenantContext itself) must
      // not be intercepted, otherwise we'd recurse.
      if (!ctx || (!ctx.tenantId && !ctx.isPlatformAdmin)) {
        return next(params);
      }
      if (RAW_OPERATIONS.has(params.action)) {
        return next(params);
      }

      // Already inside a tenant-scoped tx — the SET LOCAL is in effect on
      // this connection, so just run the underlying op without re-wrapping.
      if (ctx.tx) {
        return next(params);
      }

      // Wrap this single operation in an interactive transaction with the
      // appropriate session vars. Performance cost: one extra round-trip per
      // operation. Acceptable trade for hard tenant isolation; can be
      // amortized by callers using `enterTenantContext` to batch many ops
      // into a single tx.
      return this.$transaction(async (tx) => {
        if (ctx.isPlatformAdmin) {
          await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
        }
        // For platform admins the JWT sometimes carries `tenantId: 'platform'`
        // as a sentinel rather than a real UUID. Skip the tenant SET in that
        // case — `is_platform_admin` alone unlocks the RLS bypass.
        if (ctx.tenantId && UUID_RE.test(ctx.tenantId)) {
          await tx.$executeRaw`SELECT set_config('app.current_tenant', ${ctx.tenantId}, true)`;
        } else if (ctx.tenantId && !ctx.isPlatformAdmin) {
          throw new Error(`Invalid tenant id format`);
        }
        // Re-enter with `tx` on the ALS so the recursive call bypasses the
        // wrap-and-set logic and runs straight through.
        return tenantContextStorage.run({ ...ctx, tx }, () => next(params));
      });
    });
    this.logger.log('RLS tenant-context middleware registered');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Sets the tenant session variable on a transaction connection. Use only
   * inside a `$transaction(async tx => ...)` block — `SET LOCAL` is scoped
   * to the current transaction, so it has no effect on autocommit
   * statements. Parameterized via `$executeRaw` to prevent SQL injection
   * (P1-001 fix).
   */
  async setTenantContext(client: Prisma.TransactionClient | this, tenantId: string): Promise<void> {
    if (!UUID_RE.test(tenantId)) {
      throw new Error(`Invalid tenant id format`);
    }
    // `set_config(name, value, is_local=true)` is the parameterizable
    // equivalent of `SET LOCAL`. SET itself is a utility statement and
    // can't take parameters, so we use the function form.
    await client.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
  }

  /**
   * Marks the active transaction as a platform-admin session. Combined with
   * the RLS policy (which bypasses when this is `'true'`), this allows
   * cross-tenant reads from the platform portal.
   */
  async setPlatformAdminContext(client: Prisma.TransactionClient | this): Promise<void> {
    await client.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
  }

  /**
   * Run `fn` inside an interactive transaction with `app.current_tenant`
   * (and optionally `app.is_platform_admin`) set so RLS policies admit the
   * tenant's rows. Stores the transaction client in async local storage so
   * the RLS middleware skips re-wrapping.
   *
   * Used by the `RlsTenantContextInterceptor` once per request to batch all
   * the request's queries into a single transaction (instead of one tx per
   * query as the middleware would otherwise do).
   */
  async enterTenantContext<T>(
    ctx: { tenantId?: string; isPlatformAdmin?: boolean },
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!ctx.tenantId && !ctx.isPlatformAdmin) {
      // No tenant context at all — running anonymously will hit RLS policies
      // and return zero rows. Refuse fast so the caller knows.
      throw new Error('enterTenantContext requires either tenantId or isPlatformAdmin');
    }

    // Platform admins carry `tenantId: 'platform'` in the JWT as a sentinel,
    // not a real UUID. Strip it before calling setTenantContext so the UUID
    // guard doesn't reject the request. The is_platform_admin session var
    // alone is enough for RLS policies to bypass tenant filtering.
    const isUuidTenant =
      typeof ctx.tenantId === 'string' && UUID_RE.test(ctx.tenantId);
    const effectiveTenantId = isUuidTenant ? ctx.tenantId : undefined;

    return this.$transaction(async (tx) => {
      if (ctx.isPlatformAdmin) {
        await this.setPlatformAdminContext(tx);
      }
      if (effectiveTenantId) {
        await this.setTenantContext(tx, effectiveTenantId);
      }
      return tenantContextStorage.run(
        { tenantId: effectiveTenantId, isPlatformAdmin: ctx.isPlatformAdmin, tx },
        fn,
      );
    });
  }

  /**
   * Returns the active transaction client if `enterTenantContext` is on the
   * stack, otherwise the singleton client. Services that explicitly need
   * the RLS-scoped connection (e.g. the audit log writer that wants to
   * share the request transaction) can call this; for most callers, the
   * RLS middleware handles routing transparently.
   */
  scoped(): Prisma.TransactionClient | this {
    return tenantContextStorage.getStore()?.tx ?? this;
  }

  /** @deprecated Use `enterTenantContext` instead. Kept for backward compat. */
  async withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.enterTenantContext({ tenantId }, fn);
  }
}
