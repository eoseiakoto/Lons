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
  /**
   * Q7.2 middleware-routing fix — internal recursion guard.
   *
   * When the RLS middleware detects that a caller used `this.prisma.X`
   * (bare singleton) while a tx is active in ALS, it re-dispatches the
   * operation onto `ctx.tx[model][action](args)` so SET LOCAL takes effect.
   * That re-dispatch re-enters the middleware chain on the tx client; this
   * flag short-circuits the second invocation to `next(params)` so we
   * don't loop forever.
   *
   * Not part of the public API — set + cleared inside the middleware
   * itself. Application code must never touch this.
   */
  _rlsRouted?: boolean;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Q7.2 middleware-routing fix — per-tx re-dispatch flag.
 *
 * ALS-based recursion guards don't work because Prisma's PrismaPromise
 * resolution escapes the AsyncLocalStorage frame — by the time the
 * middleware fires on the re-dispatched tx-side call, ALS has snapped
 * back to the outer store (no `_rlsRouted` set).
 *
 * Alternative: a WeakMap keyed on the tx client. When we re-dispatch,
 * we mark the tx as "currently routing"; the recursive middleware fire
 * reads the flag, clears it (one-shot), and lets the call proceed.
 * Safe for SEQUENTIAL ops on the same tx (the in-context tx scope is
 * always sequential in our usage). NOT safe for parallel ops on the
 * same tx — but Prisma's tx model doesn't support parallel ops anyway
 * (PG transactions are single-threaded per connection).
 */
const TX_ROUTING_FLAG = new WeakSet<Prisma.TransactionClient>();

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
    // session variables, and run the operation inside it.
    //
    // Q7.2 middleware-routing fix (2026-05-30):
    //   The previous implementation short-circuited `ctx.tx`-set calls
    //   with `return next(params)` on the (false) assumption that
    //   "ctx.tx exists ⇒ operation will run on tx". It doesn't. Prisma
    //   routes by which client instance was called, not by what's in
    //   AsyncLocalStorage. So a bare `this.prisma.user.findFirst(...)`
    //   inside an `enterTenantContext` callback dispatched on a fresh
    //   pool connection without SET LOCAL → RLS filtered the result
    //   to zero rows → silent failure.
    //
    //   The fix: when `ctx.tx` is set, re-dispatch the operation
    //   directly on `ctx.tx[model][action](args)`. That call routes
    //   through the in-tx connection where SET LOCAL is active.
    //   Recursion guard via `ctx._rlsRouted` — when the re-dispatched
    //   call re-enters this middleware, we short-circuit to next().
    //
    //   Cost: the re-dispatch re-runs the middleware chain once
    //   (encryption + this hook). Encryption is idempotent
    //   (`isEncryptedBlob` check skips already-encrypted values), so
    //   no correctness issue, just one extra middleware sweep per
    //   re-routed operation. Service code that already uses
    //   `prisma.scoped()` doesn't trigger the re-dispatch and is
    //   unaffected.
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
      // Q7.2 recursion guard: per-tx WeakSet flag. When we re-dispatch
      // via `ctx.tx[model][action](...)`, the middleware fires again
      // on the tx-side call. If TX_ROUTING_FLAG has this tx, we're
      // mid-re-dispatch — clear the flag (one-shot) and let the call
      // proceed. ALS doesn't survive Prisma's promise resolution,
      // hence the WeakSet approach.
      if (ctx.tx && TX_ROUTING_FLAG.has(ctx.tx)) {
        TX_ROUTING_FLAG.delete(ctx.tx);
        return next(params);
      }

      // Already inside a tenant-scoped tx — re-dispatch onto tx so
      // SET LOCAL is honoured even when the caller used the bare
      // singleton. Set the per-tx flag immediately before dispatch
      // so the recursive middleware fire short-circuits.
      if (ctx.tx) {
        return this.dispatchOnTx(ctx, params);
      }

      // No tx yet on ALS — open a one-off interactive transaction,
      // SET LOCAL, then re-dispatch onto that tx.
      // Performance cost: one extra round-trip per operation in this
      // path. Acceptable trade for hard tenant isolation; callers
      // amortize via `enterTenantContext` to batch many ops in one tx.
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
        // Q7.2: re-dispatch onto the just-opened tx (same correctness
        // reason as the ctx.tx branch above — `next(params)` would
        // dispatch on the singleton's pool, bypassing SET LOCAL).
        return tenantContextStorage.run(
          { ...ctx, tx },
          () => this.dispatchOnTx({ ...ctx, tx }, params),
        );
      });
    });
    this.logger.log('RLS tenant-context middleware registered');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Q7.2 middleware-routing fix — re-dispatch a typed-model operation
   * onto the in-context tx connection so SET LOCAL takes effect.
   *
   * Why this exists: Prisma's `$use` middleware calls `next(params)`
   * to continue the chain, and the engine dispatches the operation on
   * whichever client instance was originally called. So a singleton
   * call (`this.prisma.user.findFirst(...)`) inside a $transaction
   * callback STILL dispatches on a pool connection — the tx is just
   * sitting in ALS, unused. This helper bypasses that by calling
   * `ctx.tx[model][action](args)` directly, which routes through the
   * in-tx connection.
   *
   * The `_rlsRouted` flag in ALS prevents infinite recursion when
   * Prisma's middleware chain fires again on the tx-side dispatch.
   *
   * `as any` is the price of dynamic model access — Prisma's
   * TransactionClient is strongly typed and won't let us index by
   * string. The model+action combination is whatever Prisma passed
   * us in params, so it's already validated upstream.
   */
  private async dispatchOnTx(
    ctx: TenantContext,
    params: { model?: string; action: string; args: unknown },
  ): Promise<unknown> {
    if (!ctx.tx) {
      // Defensive — callers in the middleware ensure this can't
      // happen, but guard against future refactors.
      throw new Error(
        'PrismaService.dispatchOnTx called without an active ctx.tx',
      );
    }
    if (!params.model) {
      // Raw / lifecycle ops should have been filtered by the
      // middleware's RAW_OPERATIONS guard. If we got here, route on
      // the tx via its raw API.
      throw new Error(
        `PrismaService.dispatchOnTx: model is required for typed-model ops (got action="${params.action}")`,
      );
    }
    const modelKey = params.model.charAt(0).toLowerCase() + params.model.slice(1);
    const accessor = (ctx.tx as any)[modelKey];
    if (!accessor || typeof accessor[params.action] !== 'function') {
      throw new Error(
        `PrismaService.dispatchOnTx: no such model.action on tx — model=${params.model} action=${params.action}`,
      );
    }
    // Set the per-tx flag BEFORE invoking the dispatch. The flag is
    // a WeakSet entry on the tx instance; the recursive middleware
    // fire reads + clears it (see TX_ROUTING_FLAG check at the top
    // of the middleware).
    TX_ROUTING_FLAG.add(ctx.tx);
    try {
      return await accessor[params.action](params.args);
    } finally {
      // Defensive: if the recursive middleware didn't clear it
      // (e.g. the op threw before middleware fire), clear here too
      // so we don't leak a stale flag onto the tx.
      TX_ROUTING_FLAG.delete(ctx.tx);
    }
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
