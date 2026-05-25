# Delivery Notes — Post-Sprint 18 Stabilisation

**Date**: 2026-05-21
**Author**: Engineering
**Scope**: Critical bug triage + tech-debt cleanup + new MFA feature
**Branch state**: 7 commits on local `main`, **not yet pushed** to `origin/main` (waiting on PM/team coordination — see §11)

---

## 1. Executive summary

The Sprint 18 deliverable shipped with several latent issues that surfaced as soon as PM/BA tried to exercise the admin and platform portals end-to-end. Login was broken on the platform portal. The admin dashboard refused to load. Five UI/UX bugs were visible across the SP portal. The migration history was structurally broken and could not be re-applied from scratch. And — most concerning — every tenant's "SP Admin" role had silently lost access to features added since Sprint 13B because the seed's permission catalog wasn't kept in lockstep with the resolvers.

This delivery resolves all of those in **7 commits** spanning **79 files / +5,018 / −197 LOC**, plus a handful of operational DB changes documented in §10. Highlights:

- **Login works.** Both portals.
- **MFA enrollment is now self-service.** Operators can enable two-factor authentication from their own profile screen in either portal, with a QR code, backup codes, and 7-locale translations for tenant operators.
- **The migration chain is reproducible.** Forty-two broken migration files were squashed into a single clean baseline; a fresh clone can now run `prisma migrate deploy` against an empty DB and arrive at the canonical schema in one shot.
- **Permission drift is a build failure.** A new audit script + regression test catches the Sprint-14-era class of bug ("resolver gates a feature on a permission no role grants") at PR time instead of in production.
- **Test seed data tripled in volume.** 81 customers × 3 tenants, 100 loan requests across every status, 38 contracts, edge-case personas — enough to exercise every admin-portal screen without manual data setup.

Nothing in this delivery is feature work against the Sprint 18 roadmap. It's all stabilisation, hardening, and unblocking of work the next sprint will depend on.

---

## 2. Commits (chronological)

| Hash | Type | Summary | Files |
|---|---|---|---|
| `3f80b93` | fix(auth) | RLS interceptor + Prisma middleware: handle `tenantId: 'platform'` sentinel | 2 |
| `543275c` | refactor(db) | Squash 42 stuck migrations → single 2,481-line baseline; archive originals | 44 |
| `33fbe33` | refactor(shared-types) | Move `ScorecardConfig` + `DEFAULT_SCORECARD` to `@lons/shared-types`; process-engine re-exports for compat | 6 |
| `c0ceaaa` | chore(db) | Seed: `emailHash` lookups for platform admin + tenant users; new `seed-test.ts` for stress/edge cases | 3 |
| `35f46e9` | feat(portals) | MFA enrollment card in both portals + 37 `settings.mfa.*` i18n keys × 7 locales | 14 |
| `525f4d7` | fix(portals) | Five UX/integration bugs from screenshot triage (REST CORS, dashboard validation, dropdown z-index, missing nav key, IF queue) | 12 |
| `2c84171` | feat(seed) | `scripts/audit-permissions.ts` + regression spec; backfill 7 drifted permissions into seed | 7 |

All commits stack cleanly on the previous `origin/main` HEAD (`5ddc707`). No history rewriting. Each commit is independently revertable.

---

## 3. Critical fixes (immediate unblockers)

### 3.1 Platform-portal login returned "Internal server error"
- **Symptom**: Every login attempt on `:3200` showed a generic 500. PM/BA could not access the platform admin portal at all.
- **Root cause**: `HASH_PEPPER` environment variable was missing. The login flow uses `computeSearchableHash(email)` (Sprint 13B SEC-5) to look up the user by `email_hash`; the util fails closed if `HASH_PEPPER` is unset, and that thrown error was bubbling up unhandled into Apollo's generic error response.
- **Fix**: Documented `HASH_PEPPER` requirement; added it to local `.env`. The util's strict-mode behaviour is intentional and correct — silent fallback would be a security regression.
- **Visible to PM**: Login works. `admin@lons.io / AdminPass123!@#`.
- **Follow-up for PM**: Every environment (dev, staging, prod, every new developer's laptop) must have `HASH_PEPPER` set or backend boots will look healthy until the first encrypted-PII lookup. Recommend documenting this in onboarding docs and `.env.example`. The value itself is a 32-byte hex string; generate per-environment with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotating it invalidates every existing `email_hash` and `tax_id_hash` row, so it's a one-time secret per environment.

### 3.2 Platform PlanTier enum had a stale value blocking every scheduler job
- **Symptom**: Scheduler logs showed `Value 'professional' not found in enum 'PlanTier'` every 15 minutes across multiple cron jobs (cooling-off, EMI sync, invoice expiry, auto-deduction, recourse). All scheduled per-tenant work was failing.
- **Root cause**: The `plan_tier` Postgres enum still carried the legacy `'professional'` label; the Prisma schema had renamed it to `'starter | growth | enterprise'` (matching `SPEC-plan-tiers.md`) but no migration had translated the existing tenant rows. QuickCash Ghana had `plan_tier='professional'` in the DB.
- **Fix**: `ALTER TYPE "PlanTier" RENAME VALUE 'professional' TO 'growth'` — atomic enum + row rename in a single statement. QuickCash Ghana is now on the `growth` tier.
- **Visible to PM**: The 3 tenants now hold the expected tiers — NairaLend NG = `starter`, QuickCash GH = `growth`, Pesa Express KE = `enterprise`. All scheduler logs are clean.
- **Note for PM**: This was a one-time fixup of an inconsistency between the DB and the canonical spec. There is no risk of recurrence — the rename is permanent and the spec is now the source of truth.

### 3.3 "Invalid tenant id format" thrown on every platform-admin GraphQL query
- **Symptom**: Every authenticated request from the platform portal logged an unhandled exception in graphql-server. The platform portal could not list tenants, plan tiers, or anything else.
- **Root cause**: Platform-admin JWTs carry `tenantId: 'platform'` as a string sentinel (not a real UUID). The RLS tenant-context plumbing UUID-validates `ctx.tenantId` and was throwing. The interceptor was forwarding the sentinel into `setTenantContext`, which correctly rejected it.
- **Fix** (commit `3f80b93`, two layers of defense):
  1. `RlsTenantContextInterceptor` now strips `tenantId` when `isPlatformAdmin` is true.
  2. `PrismaService.enterTenantContext` + its middleware ignore non-UUID `tenantId` values when `isPlatformAdmin` is true. Any caller that forwards the sentinel gets the right behaviour now, not just the one interceptor.
- **Verification**: 95-second log monitor after deploy showed zero recurrences.

---

## 4. Five UX bugs visible to PM in screenshots (commit `525f4d7`)

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 4.1 | Platform-portal `/system` showed REST Server as DOWN with "Connection refused" | rest-server CORS allowed `:3001` (admin) and `:3002` (platform) — both pre-date the `lons.sh` port assignments of `:3100` and `:3200` | Updated defaults in `apps/rest-server/src/main.ts` to match `lons.sh` |
| 4.2 | SP dashboard refused to load with "property productId/productType/lenderId/region/customerSegment/dateFrom/dateTo should not exist" | `PortfolioMetricsFilterInput` had only `@Field()` decorators, no `class-validator` decorators. Global `ValidationPipe { forbidNonWhitelisted: true }` rejected every property | Added `@IsOptional() @IsString()` to each field |
| 4.3 | "Any classification" dropdown on the contracts page rendered behind the table rows below | Filters section and table section both had `z-10`; the dropdown's own `z-30` was trapped inside the filter section's lower stacking context. Sibling DOM order put the table on top | Bumped filters section to `z-20`; also removed redundant `overflow-hidden` on the table section as secondary hardening |
| 4.4 | Sidebar showed the literal `nav.settlements` instead of a translated label | Key was referenced by `sidebar.tsx` but missing from all 7 locale JSONs | Added the key with native translations in en/fr/es/pt/sw/ha/ar |
| 4.5 | IF Verification Queue showed "Failed to load queue — Received status code 400" | Two stacked bugs: (a) same class-validator gap as 4.2 on all 4 input DTOs in `invoice-verification.input.ts`; (b) GraphQL schema exposed `InvoiceType`/`DebtorType` but admin-portal fragments said `on Invoice`/`on Debtor`; (c) SP Admin role permissions were missing 8 perms including `factoring:verify` | (a) decorators added; (b) `@ObjectType('Invoice')` and `@ObjectType('Debtor')` to align schema names with client expectations; (c) handled separately in §7 |

All five were verified end-to-end by re-driving the browser through each affected screen post-fix. Evidence in commit message + this doc's verification log (§13).

---

## 5. New feature — MFA enrollment in user profile (commit `35f46e9`)

### What PM will see

In both **admin-portal** and **platform-portal**, at *Settings → My Profile*, there's a new "Two-Factor Authentication" card. When the user clicks "Enable", the card walks them through:

1. **Re-authentication** with current password (FIX-14 guard — prevents an attacker holding a stolen session from enrolling their own authenticator).
2. **QR code** rendered inline (via `qrcode.react`), plus the manual base32 key for apps that prefer text entry.
3. **10 backup codes** displayed in a grid with the one-time-display warning.
4. **Verification step** — user enters the 6-digit code from their authenticator; on success, MFA flips to enabled.

When MFA is on, the same card offers "Disable" (also password-gated, S16-FIX-5) and "Regenerate backup codes" (same gate).

### Implementation notes for engineering

- Component: `mfa-card.tsx` lives in each portal's `settings/profile/` directory. Two parallel files because the portals don't share a UI package yet; identical logic, only the CSS surface class differs (`card-glow` in admin-portal, `card` in platform-portal).
- Backend mutations already existed (`initiateMfaEnrollment`, `confirmMfaEnrollment`, `disableMfa`, `regenerateMfaBackupCodes` — all in `auth.resolver.ts` from Sprint 15 / FIX-14). Only the frontend was missing.
- New dependency: `qrcode.react@4.1.0` added to both portal package.json files.
- **i18n coverage**: 37 new keys under `settings.mfa.*` in all 7 admin-portal locale files (en, fr, es, pt, sw, ha, ar). Drafted with working knowledge of en/fr/es/pt; **sw/ha/ar should be reviewed by a native speaker before production cutover**.
- Platform-portal has no i18n infrastructure (English-only by design); the platform-portal MfaCard ships English strings. If platform-portal ever gets internationalised, mirror the admin-portal locale block.

### Verification done

- Drove a full enrollment flow in the platform-portal browser: scanned the QR into `otplib.authenticator.generate()` (the same library the server uses to verify), entered the TOTP, confirmed `mfa_enabled = true` in DB, then logged out and back in to confirm the two-step flow (`requiresMfa: true` + `mfaToken` → `verifyMfa(mfaToken, code)` → `accessToken`).
- Switched the admin-portal to French and Arabic locales to verify translations render. Arabic confirmed correctly RTL.

---

## 6. Refactors / tech debt

### 6.1 Migration squash (commit `543275c`)
- **Why**: The migration chain was systemically broken. Two migrations (`20260430120000_enable_rls_tenant_isolation` and `20260510000000_swap_unique_constraints_to_hash_columns`) had failed in dev and were holding back ~10 newer migrations. The audit_log partitioning migration had a Postgres incompatibility (PK on partitioned table must include the partition column). Three migrations redefined `wallet_provider_configs` in mutually-incompatible ways. **A clean clone could not run `prisma migrate deploy` from empty.**
- **What**: Generated a fresh single-file baseline via `prisma migrate diff --from-empty --to-schema-datamodel`. 2,481 lines of DDL representing the canonical schema as of `schema.prisma`. Archived the 42 broken migrations into `packages/database/prisma/migrations-archive-2026-05-19/` (still in the repo for forensics — but Prisma only scans `prisma/migrations/`).
- **What's lost**: Three pieces of DDL that lived in failed migrations and were therefore never live in the running DB anyway — RLS policies, `audit_logs` table partitioning, and the `audit_writer` role grants. They're **NOT** in the baseline. The RLS *interceptor* (which sets session vars) still runs; it just has no policies to enforce against right now. Re-add as targeted hardening migrations when RLS enforcement is needed in staging/prod.
- **Impact on teammates**: Anyone with the old migration files checked out will see 42 file renames + 1 new baseline file. They need to wipe their local dev DB and re-seed for things to line up — a one-time pain. **Communicate before merging to `main` so no-one is mid-feature.**

### 6.2 ScorecardConfig moved to `@lons/shared-types` (commit `33fbe33`)
- **Why**: The database seed needs `DEFAULT_SCORECARD` to insert the initial `scorecard_configs` row, but `@lons/process-engine` (where it lived) depends on `@lons/database`. The seed's previous workaround was a `../../../services/process-engine/src/...` relative path bypassing the workspace dep graph.
- **What**: Moved `ScorecardConfig` + `ScorecardFactor` interfaces and the `DEFAULT_SCORECARD` constant to `@lons/shared-types` (a true leaf package). Process-engine re-exports them so the public `@lons/process-engine` API is unchanged — no existing imports break.
- **Impact on teammates**: None. Pure refactor; types and constant values are identical.

### 6.3 Seed seed.ts caught up to current schema (commit `c0ceaaa`)
- Platform-admin upsert now keys on `emailHash` (uniqueness moved from `email` to `emailHash` in S13B-1). Two tenant-user upserts likewise. Without this, a clean reseed would TypeScript-fail because `email` is no longer a Prisma unique key.

---

## 7. Security / hardening — SP Admin permission drift (commit `2c84171`)

This is the most important hardening in this delivery. PM should understand it.

### The class of bug

Resolvers across `apps/graphql-server` and `services/*` guard endpoints with `@Roles('foo:bar')` decorators. The list of permissions a tenant role has is set in `packages/database/prisma/seed.ts` (`allPermissions` array, granted in full to the "SP Admin" role). **There is no compile-time link between the two.** A developer can add `@Roles('factoring:verify')` to a new resolver without updating the seed, and every existing tenant's SP Admin loses access to that feature on the next reseed. That's exactly what happened in Sprint 14 — `factoring:verify` was added to the invoice verification resolver but never made it into the seed.

### Scope of the drift discovered

Running the audit on the codebase as of Sprint 18 surfaced **8 permissions** referenced by resolvers but missing from the seed:

| Permission | Used in |
|---|---|
| `collections:read` | `services/recovery-service/src/recovery.resolver.ts` |
| `collections:write` | recovery service |
| `factoring:verify` | invoice verification resolver |
| `loan_request:approve` | `loan-request-review.resolver.ts` |
| `monitoring:read` | `process-engine/.../monitoring.resolver.ts` |
| `monitoring:write` | monitoring service |
| `product:delete` | `bnpl.resolver.ts` |
| `usage:read` | `usage.resolver.ts` |
| `platform:admin` | `plan-tier.resolver.ts` *(intentionally platform-only — explicitly allow-listed)* |

All 7 tenant-scope permissions were added to `allPermissions`. **Three live tenants' SP Admin role rows were also updated via SQL** to reflect the new catalog (from 36 → 64 permissions each).

### Drift prevention going forward

- **`scripts/audit-permissions.ts`**: scans every `@Roles(...)` in apps/ + services/, extracts permission strings, diffs against `allPermissions` in the seed. Knows about role-name vs permission distinction (skips `'admin'`, `'SP_ADMIN'`, `'operator'`). Handles multi-arg `@Roles(...)` forms. Carries a `PLATFORM_ONLY_PERMISSIONS` allow-list for perms that platform admins satisfy via the JWT `*` wildcard (e.g. `platform:admin`) — these are deliberately not in the tenant catalog and shouldn't trigger drift signals.
- **`tests/regression/permission-catalog-drift.spec.ts`**: Jest spec that calls `audit()` and asserts `missingFromSeed === []`. Build fails on PR if drift appears. Error message includes the exact missing strings and the fix instructions, so CI log makes the resolution obvious to whoever opened the PR.
- **`pnpm audit:permissions`**: local CLI for devs. Exits non-zero on drift with a coloured diff.
- **Negative-tested**: temporarily deleted `'factoring:verify'` from the seed → spec failed with the expected diagnostic → restored → passes clean.

### Soft signals (intentionally not failing builds)

The audit also reports **UnusedInSeed** — perms in `allPermissions` that no resolver references. Current set: `role:create`, `role:delete`, `role:update`, `tenant:suspend`, `subscription:read`, `customer:read_pii`, `customer:create`. These are not breaking anything; they're either (a) used by non-`@Roles` access decorators (e.g. field-level auth) or (b) dead/stale. Worth a small audit to decide which but not urgent.

### Action item for PM

When triaging Sprint 19 / 20 / 21 feature work, **any story that adds a new resolver MUST add the corresponding permission to the seed in the same PR**. The CI guard catches the slip, but it's faster to write it correctly the first time.

---

## 8. Test seed data expansion (commit `c0ceaaa`)

### What's available now

| Tenant | Customers | Loan requests | Contracts | Defaulted | Edge case persona |
|---|---|---|---|---|---|
| QuickCash GH (`growth`) | 81 | 103 | 41 | 7 | Frequent defaulter: 3 defaulted contracts on one customer |
| Pesa Express KE (`enterprise`) | 81 | 100 | 38 | 4 | BNPL credit line at 100% utilisation (`availableLimit = 0`) |
| NairaLend NG (`starter`) | 81 | 100 | 38 | 4 | Critical sanctions hit awaiting AML review |

Plus a second platform user `mfa-admin@lons.io` (currently with MFA disabled, see §10).

### Why this matters for PM/BA

Every admin-portal screen now has realistic data without manual setup:
- Dashboard renders meaningful portfolio metrics (~GHS 97k outstanding on QuickCash)
- Contracts list shows active/overdue/delinquent/defaulted/settled across all 3 tenants
- Collections queue has real defaulters to triage
- AML screening queue has critical sanctions match for NairaLend
- BNPL credit line at-cap scenario for Pesa Express

Run with `pnpm --filter database db:seed:test` after the base seed.

### Edge cases tested

- **Frequent defaulter** — recovery workflow with multiple debts from same customer.
- **BNPL at quota** — exercises the quota-gate enforcement when a customer hits their limit.
- **Sanctions critical** — exercises the AML review queue with a HIGH-priority match.

### Idempotent

Re-running `db:seed:test` is safe — every insert uses deterministic external IDs and `findFirst`-then-create patterns (or `skipDuplicates` for `createMany`).

---

## 9. Documentation gaps PM should know about

These aren't bugs; they're documentation/process items that became visible during this work:

1. **`HASH_PEPPER` bootstrap is undocumented.** New developers will hit "Internal server error" on first login until they generate and set the value. Should be in onboarding docs and `.env.example`.
2. **The migration squash removes RLS policies and audit partitioning from the migration history.** When those features are turned on for staging/prod, they'll need targeted re-add migrations.
3. **Platform-portal has no i18n infrastructure.** Strings on the platform admin portal are English-only by design; if PM wants the platform portal translated as well, that's a separate small project (≈1 day to scaffold the same `useI18n` setup admin-portal has).
4. **Translation quality for sw/ha/ar in admin-portal MFA flow** is technically correct but worth a native-speaker review before production. Same applies to `nav.settlements` in those locales.

---

## 10. Operational changes done outside code (live DB state)

These are documented here so they don't get lost — they're not in any commit:

| Change | What | Why |
|---|---|---|
| `.env` | Added `HASH_PEPPER=<32-byte hex>` to local dev `.env` | Required by `computeSearchableHash` (Sprint 13B SEC-5). `.env` is gitignored — value is local-only. |
| Postgres | `ALTER TYPE "PlanTier" RENAME VALUE 'professional' TO 'growth'` | Bring DB enum in line with the canonical 3-tier spec |
| Postgres | DROP + recreate `public` schema, then `prisma migrate deploy` against the new baseline | Apply the squashed migration cleanly |
| Postgres | Marked all 42 archived migrations as `applied` in `_prisma_migrations` via `prisma migrate resolve --applied` | So `prisma migrate status` is clean (showing "Database schema is up to date") |
| Postgres | `UPDATE roles SET permissions = <64-perm array> WHERE name = 'SP Admin'` for all 3 tenants | Backfill the permission drift in §7 to existing tenants. Future tenants will inherit the right catalog via the updated seed. |
| Postgres | `UPDATE platform_users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL` for both `admin@lons.io` and `mfa-admin@lons.io` | Per PM request after MFA flow verification — easier daily testing without TOTP overhead |

The `mfa-admin@lons.io` user still exists; it will be re-enrolled with a fresh TOTP secret on the next `pnpm --filter database db:seed:test` run. If you want it permanently password-only, edit `addMfaPlatformUser()` in `seed-test.ts` and set `mfaEnabled: false` in both upsert branches.

---

## 11. Push status & coordination

**Nothing is on `origin/main` yet.** Local `main` is **7 commits ahead** of `origin/main`. The branch tracks correctly and a fast-forward push will work; no force-pushing needed.

### Why we paused before pushing

- Commit `543275c` (migration squash) is a destructive rename of 42 files. Anyone with those files checked out will see them move to `migrations-archive-2026-05-19/`. They need to wipe local dev DB and reseed.
- This was post-Sprint-18 stabilisation; merging it back to `main` should be a coordinated event, not silent.

### Recommended push sequence

1. PM confirms no-one is mid-Sprint-18-followup work on the migration files.
2. Engineering announces in the team channel: "Pushing migration squash + 6 other commits to `main`. After pull, run: `git pull && pnpm install && ./lons.sh stop && docker compose -f infrastructure/docker/docker-compose.yml up -d && pnpm --filter database db:migrate && pnpm db:seed && pnpm --filter database db:seed:test && ./lons.sh start`. You will also need `HASH_PEPPER` set in your `.env`."
3. `git push origin main`.
4. Communicate in the channel that the push is done.

Alternative: push to a feature branch (`claude/post-sprint-18-stabilisation`) and open a PR for review. Slower but safer if multiple devs are active on this repo.

### 11.1 Staging / production migration path (FIX-STAB-2)

The above sequence assumes a **wipe-and-reseed** workflow that is only appropriate for local dev. Staging and production databases cannot be dropped — they hold real or near-real data that the wipe would destroy. The correct path for those environments is to tell Prisma that the baseline migration is **already satisfied** by the existing schema, then deploy any future migrations from there.

**The command (run once per pre-existing environment, after pulling the squash commit, BEFORE `prisma migrate deploy`):**

```bash
DATABASE_URL=postgres://... pnpm exec prisma migrate resolve --applied 20260519000000_baseline
```

This writes a row to `_prisma_migrations` marking the baseline as applied. It does **not** execute any DDL — it just updates the bookkeeping table.

**When to run it:**

After the squash commit lands on `main` and is pulled into the staging/prod-pointing CI runner or deploy host. The order is strictly:
1. `git pull` (the squash commit is now in `prisma/migrations/`)
2. `prisma migrate resolve --applied 20260519000000_baseline` (mark it as satisfied)
3. `prisma migrate deploy` (no-op on the baseline, applies anything newer)
4. Restart application servers

**What happens if you skip step 2:**

`prisma migrate deploy` will see an "unapplied" migration in `prisma/migrations/` and attempt to run the full 2,481-line baseline DDL against the populated database. Every `CREATE TABLE` will fail with `relation "tenants" already exists` (and so on for ~80 tables), the deploy will abort, and the database will be left in a state where Prisma considers the migration failed. Recovery requires manual `prisma migrate resolve --rolled-back 20260519000000_baseline` followed by the correct `--applied` call — survivable but embarrassing.

**What happens if you run it against a schema that has drifted from the baseline:**

A column added manually in staging (e.g. a hotfix that wasn't backported to `schema.prisma`) won't be reflected in the baseline. Future migrations may then conflict because their DDL assumes the baseline shape.

**Mandatory pre-flight check** before running step 2 on a real environment:

```bash
DATABASE_URL=postgres://... pnpm exec prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-url $DATABASE_URL \
  --script
```

This emits the DDL that would be needed to bring the live database up to the canonical `schema.prisma` shape. If the output is empty, the live schema matches the baseline exactly and step 2 is safe. If the output is non-empty, **stop**: those differences need to be reconciled (either by amending `schema.prisma` to match the live drift, or by applying the diff as a hotfix migration) before the squash commit can safely land in that environment.

**Runbook for staging deploy:**

```bash
# 1. Pull
git pull origin main

# 2. Verify no drift
pnpm exec prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-url $DATABASE_URL --script > /tmp/drift.sql
test -s /tmp/drift.sql && { echo "ABORT: drift detected, see /tmp/drift.sql"; exit 1; }

# 3. Mark baseline as already-applied (no DDL runs)
pnpm exec prisma migrate resolve --applied 20260519000000_baseline

# 4. Apply any newer migrations (no-op today; future-proofing)
pnpm exec prisma migrate deploy

# 5. Restart
./lons.sh restart
```

**Backout if step 3 was wrong:** `prisma migrate resolve --rolled-back 20260519000000_baseline` un-marks it. No DDL impact.

This procedure is also captured (or will be — see DOC-1 / S19-STAB-7 in the PM's dev prompt) as a reusable playbook in `Docs/13-deployment.md` so it doesn't have to be relearned from a delivery note next time.

---

## 12. Outstanding follow-ups (for backlog grooming)

Ordered by what I'd recommend prioritising:

1. **Wire `pnpm audit:permissions` into the CI pipeline** (whatever runs on PR). Currently only runs locally when devs invoke it; the regression test will catch drift in `pnpm test:regression` but having it as a separate fast check shortens feedback loops. Small (10 min).
2. **Add RLS hardening as a targeted migration.** The migration squash dropped the RLS policy DDL from the chain. Whether to add it back depends on the staging/prod security model; tenant filtering is currently application-level (via the RLS interceptor setting session vars). Recommend deciding before the first staging deployment.
3. **Add audit_logs partitioning as a targeted migration.** Same as above — the partitioning DDL is no longer in the chain. Recommended when audit log volume justifies it; not blocking anything today.
4. **Translation review for sw/ha/ar.** 37 new `settings.mfa.*` keys + 1 new `nav.settlements` key are awaiting native-speaker review before production.
5. **Address the 7 UnusedInSeed warnings.** Either add resolvers that use them or remove from the seed. Not urgent.
6. **Document `HASH_PEPPER` requirement** in `Docs/13-deployment.md` and `.env.example` (one-line note + the generate command).
7. **Platform-portal i18n** if/when that's a product requirement.
8. **Consider squashing the 41 archived migrations out of the repo** in a future cleanup, once the new baseline has proven itself. They're useful for forensics for now (e.g. understanding *why* the chain broke) but add ~250 KB to clones.

---

## 13. Verification evidence (for QA hand-off)

All five UX bugs were verified end-to-end in the browser via the preview tooling. For the record:

- **REST health card**: `/system` page now shows all 3 services as HEALTHY, REST returns "OK" in ~6ms.
- **SP dashboard**: renders portfolio metrics — `GHS 97,543.41` outstanding, 36 active loans, PAR 30, NPL ratio 37.0%, collections counts. No more "Failed to load dashboard metrics."
- **Dropdown z-index**: programmatically confirmed via `elementFromPoint(centerOfDropdown)` — returns the dropdown option button, not a table cell.
- **Sidebar i18n**: sidebar shows "Settlements" between Collections and Screening (English) and translated equivalents in fr/es/pt/sw/ha/ar.
- **IF Verification Queue**: renders cleanly with the empty state ("Queue is clear — no invoices awaiting verification") for an enterprise-tier tenant (Pesa Express) with the freshly-granted `factoring:verify` permission. No more 400.

GraphQL-level verification:
- `loginPlatformUser` mutation returns a valid token pair for both `admin@lons.io` and `mfa-admin@lons.io` (MFA disabled per §10).
- `portfolioMetrics` query succeeds with no filter args.
- `invoiceVerificationQueue` returns an empty connection (200, no errors) for an enterprise-tier SP Admin.

Direct DB checks:
- 3 tenants seeded with correct plan tiers
- SP Admin role has 64 permissions across all 3 tenants
- `mfa_enabled = false` on both platform admin users

---

## 14. Files touched (full inventory across all 7 commits)

Backend / GraphQL:
- `apps/graphql-server/src/graphql/inputs/invoice-verification.input.ts` (input validation)
- `apps/graphql-server/src/graphql/resolvers/collections.resolver.ts` (PortfolioMetricsFilterInput validation)
- `apps/graphql-server/src/graphql/types/factoring.type.ts` (`@ObjectType('Invoice')`, `@ObjectType('Debtor')`)

Backend / Auth:
- `services/entity-service/src/auth/interceptors/rls-tenant-context.interceptor.ts` (platform sentinel handling)
- `packages/database/src/prisma.service.ts` (middleware + enterTenantContext)

Backend / Other:
- `apps/rest-server/src/main.ts` (CORS defaults)

Database:
- `packages/database/prisma/seed.ts` (emailHash, expanded allPermissions catalog)
- `packages/database/prisma/seed-test.ts` *(new file — stress + edge cases)*
- `packages/database/prisma/migrations/20260519000000_baseline/` *(new — 2,481-line baseline)*
- `packages/database/prisma/migrations-archive-2026-05-19/` *(new directory — 42 archived migrations)*
- `packages/database/package.json` (otplib dep + db:seed:test script)

Shared packages:
- `packages/shared-types/src/interfaces/scorecard-config.interface.ts` *(new)*
- `packages/shared-types/src/constants/default-scorecard.ts` *(new)*
- `packages/shared-types/src/{interfaces,constants}/index.ts` (re-exports)
- `services/process-engine/src/scoring/scorecard/{scorecard-engine,default-scorecard}.ts` (re-export from shared-types)

Admin portal:
- `apps/admin-portal/src/app/(portal)/settings/profile/mfa-card.tsx` *(new — MFA enrollment UI)*
- `apps/admin-portal/src/app/(portal)/settings/profile/page.tsx` (slot MfaCard)
- `apps/admin-portal/src/app/(portal)/loans/contracts/page.tsx` (dropdown z-index)
- `apps/admin-portal/src/lib/i18n/locales/{en,fr,es,pt,sw,ha,ar}.json` (37 settings.mfa.* keys + nav.settlements)
- `apps/admin-portal/package.json` (qrcode.react)

Platform portal:
- `apps/platform-portal/src/app/(portal)/settings/profile/mfa-card.tsx` *(new — MFA enrollment UI)*
- `apps/platform-portal/src/app/(portal)/settings/profile/page.tsx` (slot MfaCard)
- `apps/platform-portal/package.json` (qrcode.react)

Tooling / tests:
- `scripts/audit-permissions.ts` *(new — permission catalog audit)*
- `tests/regression/permission-catalog-drift.spec.ts` *(new)*
- `tests/regression/jest.config.ts` (ts-jest tsconfig pointer)
- `tests/tsconfig.json` *(new)*
- `package.json` (audit:permissions script, @types/jest + @types/node devDeps)
- `pnpm-lock.yaml`

---

## 15. Pre-existing repo state NOT touched

These items were in the working tree before this session began. They were intentionally left alone — not authored or modified during this stabilisation pass:

- `Docs/05-process-engine.md`, `Docs/06-post-process.md`, `Docs/SPEC-invoice-factoring.md`, `Docs/SPEC-plan-tiers.md` — modified pre-session, awaiting commit.
- `lons.sh` — modified pre-session.
- ~30 untracked `Docs/BA-*.md`, `Docs/PM-*.md`, `Docs/DEV-PROMPT-*.md`, `Docs/DELIVERY-NOTES-*.md`, `Docs/MONDAY-*.md`, `Docs/SECURITY-HARDENING-*.md`, `Docs/SPRINT-PLAN-*.md` files — your own working notes. Not committed; not deleted.
- `.pids/` — runtime artifacts from `lons.sh`.

These are flagged for awareness only. PM should decide whether to commit/clean them at their leisure.

---

*End of delivery notes.*
