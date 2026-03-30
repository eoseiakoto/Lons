# Sprint 7 Fixes V2 — BA Review: Dead Rate Limiting File Cleanup

> 1 fix. Remove the old in-memory rate limiting stub that was superseded by the real Redis implementation.

---

## Fix 1: Remove dead in-memory rate limiting file

The old `RedisThrottleStorage` (in-memory `Map`) still exists alongside the real `RedisThrottlerStorage` (Redis-backed with Lua scripts). Both are exported from the index. The old file is not imported by any app module but creates naming confusion and risk of accidental misuse.

### Step 1: Delete the old file

```bash
rm packages/common/src/rate-limiting/redis-throttle.storage.ts
```

### Step 2: Delete its test file

```bash
rm packages/common/src/rate-limiting/__tests__/redis-throttle.spec.ts
```

### Step 3: Remove the export from index.ts

**File**: `packages/common/src/rate-limiting/index.ts`

Remove this line:

```typescript
export { RedisThrottleStorage } from './redis-throttle.storage';
```

Keep the correct export:

```typescript
export { RedisThrottlerStorage } from './redis-throttler-storage';
```

### Step 4: Remove built dist artifacts

```bash
rm -f packages/common/dist/rate-limiting/redis-throttle.storage.*
rm -f packages/common/dist/rate-limiting/__tests__/redis-throttle.spec.*
```

### Step 5: Verify no other imports reference the old class

```bash
grep -r "RedisThrottleStorage" --include="*.ts" . | grep -v node_modules | grep -v dist
```

This should return **zero results** after the fix. If any file imports `RedisThrottleStorage` (without the `r` in `Throttler`), update it to use `RedisThrottlerStorage`.

### Step 6: Rebuild and test

```bash
pnpm build
pnpm test
```

All tests should pass. The `redis-throttler-storage.spec.ts` (191 lines, tests Redis Lua path and in-memory fallback) remains and covers the production code.
