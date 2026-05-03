# BA Observation: Local Development Quality Issues

**ID:** BA-OBS-001
**Date:** 2026-04-06
**Raised by:** Business Analyst (Claude)
**Severity:** High — blocks all local development and testing
**Status:** Fixes applied by BA during local testing; needs dev review and permanent resolution

---

## Summary

During local environment setup and login testing, **6 blocking bugs** were discovered that prevent any developer or QA engineer from running the Lōns platform locally. These are code-level defects that should have been caught during development and CI, not during BA acceptance testing.

---

## Issues Found

### 1. JWT Key Paths Resolve Incorrectly (`.env`)

**What:** `JWT_PRIVATE_KEY=./keys/private.pem` resolves relative to `apps/graphql-server/` (Turborepo's working directory), not the repo root where `keys/` lives.

**Impact:** Server falls back to ephemeral RSA keys every time. While login still works with ephemeral keys, this means JWT tokens are invalidated on every server restart — breaking any persisted sessions.

**Fix applied:** Changed to `../../keys/private.pem` in `.env`.

**Root cause:** Developer tested with absolute paths (`/Users/.../keys/private.pem`) and committed them. When switching to relative paths, didn't account for Turborepo's `cwd` behavior.

### 2. Database Migrations Fail on Clean Setup (3 separate migration bugs)

**What:** Running `prisma migrate deploy` on a fresh database fails on migrations 8 and 9 of 9.

**Migration `20260328200000_audit_log_partitioning`:**
- Primary key `(id)` doesn't include partition column `created_at` — PostgreSQL rejects this for partitioned tables
- Constraint name `audit_logs_pkey` collides after table rename (PostgreSQL keeps constraint names on renamed tables)
- `INSERT INTO ... SELECT *` fails due to column order mismatch between old and new table definitions

**Migration `20260329100000_add_sprint7_adapter_feedback_models`:**
- Tries to `CREATE TABLE wallet_provider_configs` which already exists from migration `20260327004703_add_integration_models`, with a completely different schema (different column names, types, and constraints)

**Impact:** No developer can set up a local database from scratch. The migrations have never been run against a clean PostgreSQL instance.

**Fix applied:** Rewrote both migrations — composite PK, constraint rename, explicit column lists, `ALTER TABLE` instead of `CREATE TABLE` for existing tables, idempotent guards throughout.

### 3. `TenantThrottlerGuard` Crashes on All GraphQL Requests

**What:** The throttler guard extends NestJS's `ThrottlerGuard`, which only handles HTTP execution contexts. In a GraphQL context, `getRequestResponse()` returns `undefined` for both `req` and `res`, causing `TypeError: Cannot read properties of undefined (reading 'user')` on every request.

**Impact:** Every GraphQL request — including unauthenticated ones like login — returns "Internal server error". The entire API is non-functional.

**Fix applied:** Overrode `getRequestResponse()` to detect GraphQL context type and extract `req`/`res` from the resolver's context argument (`context.getArgs()[2]`). Added null guards and a no-op `res` stub for cases where response object is unavailable.

### 4. GraphQL Context Missing `res` Object (`app.module.ts`)

**What:** The Apollo GraphQL context factory only passes `req`: `context: ({ req }) => ({ req })`. The response object `res` is not included.

**Impact:** Even after fixing the throttler guard's context detection, the parent `ThrottlerGuard.handleRequest()` crashes with `Cannot read properties of undefined (reading 'header')` when trying to set rate-limit response headers.

**Fix applied:** Changed to `context: ({ req, res }) => ({ req, res })`.

### 5. `GraphqlExceptionFilter` Silently Swallows All Unhandled Errors

**What:** The catch-all handler returns `new GraphQLError('Internal server error')` with zero logging. Any exception that isn't a `LonsBaseError`, `GraphQLError`, or `HttpException` is invisible.

**Impact:** All of the above bugs manifested as a generic "Internal server error" with no diagnostic information in server logs. Debugging required reading source code and tracing the call chain manually.

**Fix applied:** Added `Logger.error()` call with full stack trace before returning the generic error.

---

## Systemic Observations

These are not isolated incidents. They reveal process gaps:

**No integration testing against a real database.** The migration bugs would be caught instantly by running `prisma migrate reset --force` in CI. The migrations were clearly authored against an already-populated database and never tested from scratch.

**No smoke test for the GraphQL server.** The throttler guard crash happens on literally any GraphQL request. A single `curl` to the GraphQL endpoint after server startup would catch this.

**No local development runbook validation.** The README/CLAUDE.md documents commands like `pnpm --filter database db:migrate` and `pnpm --filter graphql-server dev`, but nobody has followed these steps end-to-end on a clean environment.

**Error handling hides root causes.** The exception filter's catch-all with no logging meant that five different bugs all presented as the same "Internal server error" — making diagnosis extremely slow.

---

## Recommendations

1. **Add a CI job that runs `prisma migrate reset --force` on every PR** that touches `packages/database/prisma/migrations/`. This catches migration bugs before merge.

2. **Add a post-startup health check** to the GraphQL server's dev script that sends a simple query (e.g., introspection or a ping query) and fails loudly if it gets an error.

3. **Require the dev agent to test locally before marking tasks complete.** "It compiles" is not "it works." The checklist should include: clean database setup, server startup, and at least one authenticated request.

4. **Keep the error logging** in `GraphqlExceptionFilter`. In production, this should go to structured logging (not console), but the information should always be captured.

5. **Review and test all global guards against GraphQL contexts.** If `TenantThrottlerGuard` was broken, other guards registered as `APP_GUARD` may have similar issues.

---

## Files Modified (by BA during debugging)

| File | Change |
|------|--------|
| `.env` | JWT key paths: `./keys/` → `../../keys/` |
| `apps/graphql-server/src/filters/graphql-exception.filter.ts` | Added Logger for unhandled exceptions |
| `apps/graphql-server/src/app.module.ts` | Added `res` to GraphQL context factory |
| `packages/common/src/rate-limiting/tenant-throttler.guard.ts` | GraphQL-aware `getRequestResponse()` override, null-safe `getTracker()` |
| `packages/database/prisma/schema.prisma` | Composite PK `@@id([id, createdAt])` on AuditLog |
| `packages/database/prisma/migrations/20260328200000_audit_log_partitioning/migration.sql` | Full rewrite with correct PK, constraint rename, explicit columns |
| `packages/database/prisma/migrations/20260329100000_add_sprint7_adapter_feedback_models/migration.sql` | Rewrite: ALTER existing table instead of CREATE, idempotent guards |
