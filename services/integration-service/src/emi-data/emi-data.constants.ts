/**
 * Injection tokens + defaults for {@link EmiDataService} config.
 *
 * `EmiDataService` originally took `cacheTtlMs: number` and
 * `retryOptions: RetryOptions` as positional constructor parameters
 * with defaults. NestJS resolves DI from TypeScript's emitted metadata
 * (`design:paramtypes`) and primitives emit as `Number` / `Object` —
 * which are not valid injection tokens. Default parameter values are
 * NOT a fallback for unresolved tokens; the injector throws before the
 * default ever runs, which crashed the GraphQL and Scheduler apps at
 * boot:
 *
 *   Nest can't resolve dependencies of the EmiDataService
 *   (EMI_DATA_ADAPTER, PrismaService, ?, Object, EventBusService).
 *
 * Fix: explicit tokens + module-level `useValue` providers. The
 * constructor still accepts the values positionally (so tests that
 * `new EmiDataService(adapter, prisma, customTtl, customRetry)`
 * continue to work without rewriting their setup).
 *
 * See Docs/DE-NOTE-nestjs-runtime-crashes.md.
 */

import type { RetryOptions } from '../resilience/retry';

export const EMI_CACHE_TTL_MS = 'EMI_CACHE_TTL_MS';
export const EMI_RETRY_OPTIONS = 'EMI_RETRY_OPTIONS';

/** 1 hour — matches the prior in-constructor default. */
export const DEFAULT_EMI_CACHE_TTL_MS = 60 * 60 * 1000;

/** 3 attempts, 1s base, 8s cap, 2× backoff — matches the prior default. */
export const DEFAULT_EMI_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1_000,
  maxDelay: 8_000,
  backoffMultiplier: 2,
};
