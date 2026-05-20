import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { from, Observable } from 'rxjs';

import { PrismaService } from '@lons/database';

/**
 * Wraps every authenticated request in `prisma.enterTenantContext(...)` so that
 * Postgres RLS policies admit the requesting tenant's rows.
 *
 * Reads `request.user.tenantId` / `request.user.isPlatformAdmin` (set by
 * `AuthGuard`), opens an interactive transaction, executes
 * `SELECT set_config('app.current_tenant', $1, true)` and (for platform admins)
 * `SELECT set_config('app.is_platform_admin', 'true', true)`, then runs the
 * downstream handler with that transaction stored in async-local storage.
 *
 * Without this interceptor in place, RLS policies would return zero rows for
 * every authenticated query — RLS is open by default but every policy in
 * `20260430120000_enable_rls_tenant_isolation` requires the session vars to
 * be set.
 *
 * Public endpoints (those marked `@Public()`) skip authentication and so
 * `request.user` will be undefined; we pass them through without entering a
 * tenant context. They should not query tenant-scoped tables.
 */
@Injectable()
export class RlsTenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = this.getRequest(context);
    const user = request?.user as
      | { tenantId?: string; isPlatformAdmin?: boolean }
      | undefined;

    // Anonymous / public endpoint — pass through. Any tenant-scoped query
    // hit from here will return zero rows and that's the correct behavior.
    if (!user || (!user.tenantId && !user.isPlatformAdmin)) {
      return next.handle();
    }

    // Platform admins carry `tenantId: 'platform'` in the JWT as a sentinel,
    // not a real UUID. Don't forward that to setTenantContext — its UUID
    // guard would reject it. The is_platform_admin session var alone is
    // enough for the RLS policies to bypass tenant filtering.
    const tenantId = user.isPlatformAdmin ? undefined : user.tenantId;

    // Run the downstream handler inside an interactive transaction with
    // SET LOCAL applied. We materialize the Observable into a Promise via
    // `firstValueFrom`-like pattern (using `toPromise` semantics through `from`).
    return from(
      this.prisma.enterTenantContext(
        { tenantId, isPlatformAdmin: user.isPlatformAdmin },
        async () => {
          // Convert Observable → Promise so it joins the transaction's
          // async chain. If `next.handle()` errors, the transaction rolls back.
          return await new Promise((resolve, reject) => {
            const sub = next.handle().subscribe({
              next: resolve,
              error: reject,
            });
            // Defensive cleanup in case the observer never resolves.
            void sub;
          });
        },
      ),
    );
  }

  private getRequest(context: ExecutionContext): { user?: unknown } | undefined {
    const type = context.getType<string>();
    if (type === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
