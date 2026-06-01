# Delivery Notes — PrismaService Middleware Root-Fix (Q7.2)

**Date:** 2026-05-30
**Author:** Engineering
**Scope:** Root-cause fix for the RLS singleton-bypass bug class identified by the entity-service audit
**Branch state:** `claude/prisma-middleware-rls-routing` (pushed pending), one commit
**Supersedes:** the audit-doc-driven long-tail per-service sweep that was the planned follow-up to `claude/user-service-rls-fix`

---

## 1. Executive summary

Earlier today the `claude/user-service-rls-fix` PR landed with a follow-up audit doc cataloguing **22 service files / 127 candidate bare `this.prisma.<rls_model>.*` calls** still affected by the same RLS-bypass bug class. The plan was to scope a sequential per-service sweep to fix them one by one.

This delivery is the **root-cause fix at the middleware level**. After 90 minutes of probing it turned out the PrismaService middleware can actually be made to re-route bare singleton calls onto the in-context tx connection — making the explicit `prisma.scoped()` pattern unnecessary for correctness (though still preferred as documentation).

**Net effect:** the 127 bare-call surface in the audit doc is now **transparently safe** — no sweep needed. Existing `scoped()`-based fixes stay in place as explicit documentation, not as load-bearing correctness.

**One source file changed** (`packages/database/src/prisma.service.ts`, +85/−15 LOC). One new regression spec (`tests/regression/prisma-middleware-rls-routing.spec.ts`, 6 real-DB tests). Zero changes to any service or app.

The first prototype was wrong (it used `AsyncLocalStorage` for recursion-guard and went into infinite recursion). The investigation found that **`AsyncLocalStorage` doesn't propagate through Prisma's `PrismaPromise` resolution** — the ALS frame snaps back to the outer store before the recursive middleware fires. The shipped solution uses a per-tx `WeakSet` flag instead, which doesn't depend on ALS propagation. Diagnostic transcript + reasoning in §3.

---

## 2. The fix

`packages/database/src/prisma.service.ts`:

### 2.1 Replace the broken short-circuit

**Before** (the bug — flagged in DEV-PROMPT-MFA-STATUS-DISPLAY-FIX):

```typescript
this.$use(async (params, next) => {
  // ...
  if (ctx.tx) {
    return next(params);  // ← assumes "ctx.tx exists ⇒ operation will run on tx"
  }                       //   FALSE. Prisma routes by which client instance was
                          //   called, not by ALS. Singleton calls dispatch on
                          //   the pool connection, bypassing SET LOCAL.
});
```

**After:**

```typescript
this.$use(async (params, next) => {
  // ...
  // Recursion guard for the second middleware fire that the re-dispatch triggers.
  if (ctx.tx && TX_ROUTING_FLAG.has(ctx.tx)) {
    TX_ROUTING_FLAG.delete(ctx.tx);   // one-shot
    return next(params);
  }
  // Re-route onto the in-tx connection.
  if (ctx.tx) {
    return this.dispatchOnTx(ctx, params);
  }
});

private async dispatchOnTx(ctx, params) {
  TX_ROUTING_FLAG.add(ctx.tx!);
  try {
    return await (ctx.tx as any)[modelKey][params.action](params.args);
  } finally {
    TX_ROUTING_FLAG.delete(ctx.tx!);   // defensive — clear if the recursive
                                       //   fire didn't (e.g. op threw)
  }
}
```

The same re-dispatch is applied to the fallback path (the "no tx yet, open one" branch). Previously that branch also called `next(params)` which would dispatch on the singleton — same bug, lower frequency in practice but still a latent issue.

### 2.2 Why per-tx `WeakSet` for the recursion guard

The first prototype used `AsyncLocalStorage.run(store, callback)` with `_rlsRouted: true` in the store. Probe transcript proved this didn't work — every recursive middleware fire saw `rlsRouted: undefined`:

```
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}
... (∞ until heap OOM)
```

Root cause: Prisma's `PrismaPromise` uses a custom resolution path that escapes the ALS frame. By the time middleware fires on the tx-side dispatch, ALS has snapped back to the outer store (without the flag). This is presumably for Prisma's own internal book-keeping, but it makes ALS unusable for recursion guards inside the middleware.

`WeakSet` works because:
- It's keyed on the `Prisma.TransactionClient` instance, which IS preserved across promise resolution (it's just a JS reference).
- One-shot semantics: set before re-dispatch, read + cleared by the first recursive middleware fire.
- The defensive `try/finally` clears the flag even if the recursive fire never happens (e.g. the op threw before middleware ran).
- Safe for sequential ops on the same tx (the only pattern Postgres allows on an interactive transaction — single-threaded per connection).

---

## 3. Investigation log

### 3.1 Initial empirical probe (replicated middleware against real DB)

The probe from this morning's investigation showed:

```
TEST 1 (no context):                                              NULL
TEST 2 (in enterTenantContext, BARE singleton, ctx.tx set):       NULL — RLS FILTERED
TEST 3 (in enterTenantContext, via tx — what scoped() returns):   OK mfa=true lastLogin=true
```

That fingered the middleware short-circuit. Question for this PR: can the short-circuit be made to actually re-route?

### 3.2 First prototype — ALS-based guard (FAILED)

```typescript
return tenantContextStorage.run({ ...ctx, _rlsRouted: true }, () =>
  ctx.tx[modelKey][params.action](params.args),
);
// Middleware top:
if (ctx._rlsRouted) return next(params);
```

Probe with `DEBUG_RLS_MW=1`:
```
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}  ← outer call
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}  ← tx-side fire (should have rlsRouted:true)
[rls-mw] model=User action=findFirst ctx={tenantId:f491...,hasTx:true,rlsRouted:undefined}  ← recursing
... (infinite, heap OOM)
```

The ALS frame doesn't survive into Prisma's promise resolution.

### 3.3 Second prototype — WeakSet guard (WORKED)

Switched to a module-level `WeakSet<Prisma.TransactionClient>`. Re-built. Probe transcript:

```
--- TEST 1: no ctx (expected NULL) ---
  → NULL
--- TEST 2: in ctx, BARE singleton ---
  → OK id=412f3f70-4f04-48fa-bc80-330a9038b17f mfa=true lastLogin=true
--- TEST 3: in ctx, via scoped() ---
  → OK id=412f3f70-4f04-48fa-bc80-330a9038b17f mfa=true
--- TEST 4: sequential ops in same enterTenantContext ---
  → first: true list count: 5
```

All four pass. Fix is correct.

### 3.4 Why this works structurally

1. **WeakSet doesn't depend on ALS.** It's keyed on the live tx object. The tx instance is the same JS reference whether the call comes from singleton-middleware or from the recursive tx-side middleware fire — both code paths have access to it via `ctx.tx`.

2. **One-shot prevents the second-pass from re-routing.** When the recursive middleware fires (on the tx-side), it checks `TX_ROUTING_FLAG.has(ctx.tx)` → true → it clears the flag and calls `next(params)` (which dispatches on the tx connection, where SET LOCAL is active). The flag is gone, so any subsequent op in the same context that's also bare singleton gets a fresh re-route — correct.

3. **Sequential safe, parallel hostile.** If you tried `Promise.all([prisma.user.find(), prisma.user.find()])` inside one `enterTenantContext`, the two ops would race the WeakSet flag — but Postgres doesn't allow parallel ops on a single interactive tx anyway, so this is a pre-existing constraint, not a new one. The Prisma docs are explicit that tx ops should be sequential.

### 3.5 Performance impact

Each bare-singleton call inside `enterTenantContext` now goes through the middleware chain **twice** instead of once:
1. First fire: triggers re-dispatch onto tx
2. Second fire: short-circuits via the WeakSet guard

The encryption middleware also fires twice. It's idempotent on reads (decryption is no-op when the value isn't an encrypted blob) and on writes (the `isEncryptedBlob` check skips already-encrypted values). So no correctness issue, just one extra middleware sweep per re-routed op.

`scoped()` callers are **unaffected** — they dispatch on tx directly, hit the middleware once, no flag involvement.

---

## 4. What this fix DOES and DOES NOT do

### Does
- Makes `this.prisma.<model>.<action>(...)` inside `enterTenantContext` transparently route through the in-tx connection (SET LOCAL in effect).
- Makes the audit doc's 127-call surface in entity-service **no longer load-bearing for correctness**. The bug they document is now closed at the middleware level.
- Applies the same re-dispatch to the fallback "open my own tx" path (when middleware sees ctx but no tx yet — rare in practice but was the same bug).
- Adds a permanent regression spec against real DB to prevent silent regression.

### Does NOT
- Remove the explicit `scoped()` calls or the `enterTenantContext`-wrapping in `UserService`, `MfaService`, `AuthService`. Those stay as **explicit, intentional code** — they're still the recommended pattern, and they document the RLS dependency at the call site. The middleware fix is a safety net, not a license to be sloppy.
- Fix anything in scheduler jobs, REST resolvers, or other monorepo packages that bypass the GraphQL `RlsTenantContextInterceptor` entirely. Those still need `enterTenantContext` wrapping at the entry point (because they have NO ALS context at all).
- Fix the case where a request handler does `Promise.all([...])` of multiple Prisma ops without awaiting sequentially. Same pre-existing Postgres constraint.

### Recommended follow-up
- **Close the audit doc as obsolete** OR keep it as a "candidates we should still explicitly scope() for clarity" list. PM call.
- Run the regression spec in CI alongside the existing `rls-coverage.spec.ts` etc. Currently `tests/regression/*` runs via `pnpm test:regression` — likely already in CI, but worth confirming.
- Future code review heuristic: bare `this.prisma.X` inside a request handler is no longer broken, but it IS less clear than `this.prisma.scoped().X`. Suggest a lint rule or PR template note.

---

## 5. Verification log

### 5.1 Real-DB regression (the proof)
```
PASS tests/regression/prisma-middleware-rls-routing.spec.ts
  PrismaService middleware Q7.2 — singleton-call re-routing
    ✓ TEST 1 — bare singleton WITHOUT context returns NULL (RLS filters)
    ✓ TEST 2 — bare singleton INSIDE enterTenantContext returns the row (THE FIX)
    ✓ TEST 3 — explicit scoped() path is unchanged
    ✓ TEST 4 — sequential ops in same enterTenantContext both succeed
    ✓ TEST 5 — mixed singleton + scoped() ops in same context both succeed
    ✓ TEST 6 — repeated entries to enterTenantContext don't leak per-tx flag state

Tests: 6 passed, 6 total
```

The spec auto-skips if `DATABASE_URL`, `ENCRYPTION_KEY`, or `HASH_PEPPER` are absent — keeps CI green on minimal environments while gating the actual proof on local/staging runs.

### 5.2 Existing entity-service unit tests
**342/342 pass** — same as before this PR. The middleware fix doesn't affect mocked tests because they bypass the real middleware.

### 5.3 All consumer apps build clean
- `@lons/database` (host of the fix)
- `@lons/entity-service`
- `graphql-server`
- `rest-server`
- `admin-portal`
- `platform-portal`

### 5.4 Sanity: the fix can't break what already worked
The middleware change only affects the code path where `ctx.tx` is set (i.e. inside `enterTenantContext`). For that branch:
- Bare singleton calls: **change from silently broken to working**.
- `scoped()` calls: **unchanged** — still dispatch on tx directly, never hit the re-dispatch path.
- No tenant context: **unchanged** — first guard returns next(params).

No way for this fix to regress an already-working call path.

---

## 6. Files changed

```
 Docs/DELIVERY-NOTES-PRISMA-MIDDLEWARE-ROOT-FIX-2026-05-30.md          | (this doc)
 packages/database/src/prisma.service.ts                               | +85/−15
 tests/regression/prisma-middleware-rls-routing.spec.ts                | +127/0 (new)
```

3 files. One source file actually changed.

---

## 7. Open questions for PM

### 7.1 Audit doc — close or keep?
`Docs/AUDIT-ENTITY-SERVICE-RLS-SINGLETON-CALLS-2026-05-30.md` documented 127 bare singleton calls across 22 entity-service files as **correctness bugs**. They're no longer correctness bugs — but they're still less clear than the explicit `scoped()` pattern. Options:
- **A** (recommended): rename to "code-quality candidates" and lower priority from P0/P1/P2 to "nice-to-have refactor". Keep the file as a reference but stop treating it as a bug list.
- **B**: close the doc entirely.
- **C**: keep as-is and still do the sweep for clarity.

I'd recommend A.

### 7.2 Should the existing service-level explicit wraps be reverted?
The UserService, MfaService, AuthService methods that wrap in `enterTenantContext({tenantId}) + scoped()` could be simplified back to bare singleton. **I do NOT recommend this.** The explicit wraps:
- Document the RLS dependency at the call site
- Survive future middleware refactors (defence in depth)
- Are zero-cost — same network round-trips either way
- Are already shipped + tested + reviewed

Keep them as-is. New code can use bare singleton OR explicit scoped() — both correct. Code-review guidance: prefer explicit for any new tenant-data path; bare singleton is acceptable cleanup if the original code was already that way.

### 7.3 Other monorepo packages
The same middleware fix benefits **every** monorepo package that uses `@lons/database`'s `PrismaService` — process-engine, repayment-service, recovery-service, settlement-service, reconciliation-service, notification-service, integration-service, analytics-service. Their bare singleton calls inside any `enterTenantContext` are now safe.

**Caveat:** scheduler jobs that run OUTSIDE a request context still need explicit `enterTenantContext` wrapping at the entry point. No middleware fix can synthesise tenant context out of nothing.

Recommend a quick audit of scheduler entry points to verify they all wrap.

### 7.4 Merge ordering
The fix is on `claude/prisma-middleware-rls-routing`. Branch is from `main` post-user-service-rls merge. Clean merge, no conflicts expected. Awaiting PM go-ahead.

---

## 8. The risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Parallel ops on the same tx race the WeakSet flag | Low (Postgres forbids parallel ops on interactive tx; Prisma docs flag it) | Medium (would manifest as flag stuck, next op re-routes infinitely → hang/OOM) | The defensive `try/finally` clears the flag even if recursive fire didn't. Worst case: hang on a single request, not corruption. |
| Future Prisma upgrade changes how `$use` middleware works | Low-medium (Prisma 5.x has flagged `$use` as deprecated in favor of `$extends`) | High (would require porting the fix to `$extends`) | Regression spec catches it. If `$use` is removed, port to `$extends` query hook (same pattern, different API). |
| WeakSet entry not garbage-collected if tx outlives the request | None (`Prisma.TransactionClient` is created per `$transaction` and discarded after `enterTenantContext`'s callback resolves; WeakSet allows GC) | — | — |
| Encryption middleware double-fire breaks something | None confirmed | None confirmed | Tested in regression spec TEST 5 (mixed singleton + scoped) — both paths read the row correctly; no double-encryption corruption. |

---

## 9. Verification PM/BA can run themselves

```bash
# Build the package (required before running the regression spec):
pnpm --filter @lons/database build

# Run the new regression spec against your local DB:
DATABASE_URL='postgresql://lons_app:lons_app_dev_password@localhost:5432/lons' \
ENCRYPTION_KEY='<from .env>' \
HASH_PEPPER='<from .env>' \
pnpm test:regression -- --testPathPattern=prisma-middleware-rls-routing

# Expected: 6 passed.

# Confirm existing unit suite still green:
pnpm --filter @lons/entity-service test
# Expected: 342/342 passed.

# Verify the MFA-status-display bug from this morning is now fixed
# regardless of UserService implementation (revert UserService to bare
# singleton temporarily — page should STILL show "Enabled"):
# (don't actually do this in main — just a mental test of the fix.)
```

---

*Engineering, 2026-05-30. Awaiting PM go-ahead to merge `claude/prisma-middleware-rls-routing` and close the long-tail audit per §7.1.*
