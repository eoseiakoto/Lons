# Migration Playbook

**Status:** Active. Source of truth for all migration-impacting deliveries.
**First applied:** Post-Sprint-18 stabilisation (baseline squash, 2026-05-21).
**Owners:** Engineering. Reviewed by PM before each migration-impacting merge.

This playbook documents how the team ships, pulls, and deploys changes that touch the migration history. It exists because the Post-Sprint-18 baseline squash exposed the cost of having no playbook: 42 migration files moved on every developer's disk and no-one had a clear sequence for picking them up safely.

---

## 1. When this playbook applies

A change is "migration-impacting" if any of the following are true:

1. It adds, renames, deletes, or modifies any file under `packages/database/prisma/migrations/`.
2. It changes `packages/database/prisma/schema.prisma` in a way that requires a new migration (added/removed columns, tables, enum values, indexes, foreign keys, etc.).
3. It introduces a new environment variable that the application requires at boot (e.g. a new encryption key, a new pepper).
4. It renames or relocates archived migration files.

If you're unsure, run `git diff origin/main -- packages/database/prisma/` on your branch. If anything shows up, treat the change as migration-impacting.

Changes that are **not** migration-impacting (and therefore skip this playbook):

- New seed data in `seed.ts` / `seed-test.ts` with no schema change
- Code-only changes in `apps/`, `services/`, `packages/common`, `packages/shared-types`, etc.
- Config-only changes (linting, formatting, CI workflow tweaks)

---

## 2. Pre-push checklist (developer)

Before pushing a migration-impacting branch:

- [ ] `pnpm --filter @lons/database db:migrate` succeeds on a wiped local DB (drop+recreate schema, then `prisma migrate deploy`).
- [ ] `pnpm db:seed` and `pnpm --filter database db:seed:test` both succeed against the freshly-migrated DB.
- [ ] `pnpm audit:permissions` and `pnpm audit:input-decorators` both exit 0.
- [ ] `pnpm test:regression` passes.
- [ ] The PR description includes a **"Migration Impact"** section pointing at this playbook and listing:
  - Which migration files are added/renamed/deleted
  - Any new environment variables required
  - Whether the change is forward-only or needs a backout migration
- [ ] If the change deletes or archives migrations (like the baseline squash), the PR is announced in the team channel **before** merge so no-one is mid-feature on files about to move.

---

## 3. Local dev: pull-and-reseed procedure

When a migration-impacting commit lands on `main` and you pull it, your local Postgres still reflects the schema as of *before* the merge. There are two scenarios:

### 3a. New migrations added (additive — the normal case)

Use this when the merge added new migration files but didn't archive or rewrite existing ones.

```bash
git pull origin main
pnpm install
pnpm --filter @lons/database db:migrate     # applies the new migrations
```

If the merge also added seed data:
```bash
pnpm db:seed
pnpm --filter database db:seed:test         # if you want the stress + edge personas
```

No DB wipe needed. Your existing data survives.

### 3b. Migrations archived / baseline squashed (destructive)

Use this when the merge moved, renamed, or replaced migration files (like the Post-Sprint-18 squash). Your local migration state is now incompatible with the chain in the repo. The simplest recovery is a full wipe.

```bash
git pull origin main
pnpm install

./lons.sh stop                              # stops all node services + docker compose
docker compose -f infrastructure/docker/docker-compose.yml up -d
until docker exec lons-postgres pg_isready -U lons >/dev/null 2>&1; do sleep 1; done

docker exec -i lons-postgres psql -U lons -d lons -c \
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

pnpm --filter @lons/database db:migrate     # applies the squashed baseline
pnpm db:seed                                # base seed: 3 tenants, platform admin
pnpm --filter database db:seed:test         # optional: stress + edge personas
./lons.sh start
```

Convenience alias: `pnpm db:fresh-start` runs steps 4–8 in one shot (see §7).

**Cost:** You lose every row you'd added manually. If you were mid-feature with hand-crafted test data, capture a `pg_dump --data-only` first.

---

## 4. Staging / production: mark-baseline-applied procedure

Staging and production databases hold real or near-real data. The `DROP SCHEMA` shortcut is not available — running it would destroy real customer state. The correct path is to tell Prisma the baseline migration is already satisfied by the existing schema, then deploy any future migrations from there.

This procedure is required **only** when the merge includes a baseline squash or migration rewrite. For ordinary additive migrations, `prisma migrate deploy` alone is enough.

### 4.1 Pre-flight: detect schema drift

Before marking anything as applied, verify the live schema matches what the baseline claims. If a hotfix added a column manually and that column isn't in `schema.prisma`, marking the baseline as applied will lock that drift in and future migrations will fail in non-obvious ways.

```bash
export DATABASE_URL=postgres://...           # the live target
pnpm exec prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-url $DATABASE_URL \
  --script > /tmp/drift.sql

if [ -s /tmp/drift.sql ]; then
  echo "ABORT — live schema has drifted from schema.prisma. See /tmp/drift.sql."
  echo "Reconcile (either update schema.prisma to match or apply the diff as a"
  echo "hotfix migration) before continuing."
  exit 1
fi
```

If `drift.sql` is empty, the live schema matches the canonical model. Proceed.

If `drift.sql` is non-empty, **stop**. The reconciliation path is one of:

- The drift is a known hotfix that should be in `schema.prisma` → update the schema, generate a new migration that's a no-op against the live DB but matches the chain, and re-run the pre-flight.
- The drift is something the squash is trying to *replace* with the baseline → it's safe to proceed, but only after sign-off from whoever wrote the hotfix.
- The drift is genuinely unexpected → escalate before any further DB action.

### 4.2 Mark the baseline as applied (no DDL runs)

```bash
pnpm exec prisma migrate resolve --applied 20260519000000_baseline
```

This writes a single row to `_prisma_migrations` saying the baseline is at-rest. No table-creation DDL executes. The live schema is unchanged.

Substitute the actual baseline name if it's been re-squashed in a future delivery.

### 4.3 Apply any newer migrations

```bash
pnpm exec prisma migrate deploy
```

For the Post-Sprint-18 squash specifically this is a no-op (no migrations newer than the baseline yet). It's still safe and correct to run — it's the same command used for all future deployments.

### 4.4 Verify

```bash
pnpm exec prisma migrate status
# Expected: "Database schema is up to date!"
```

### 4.5 Restart application servers

```bash
# k8s / your deploy tool
kubectl rollout restart deployment/graphql-server deployment/rest-server deployment/scheduler
```

### 4.6 Backout if step 4.2 was wrong

```bash
pnpm exec prisma migrate resolve --rolled-back 20260519000000_baseline
```

This un-marks the baseline as applied. No DDL ran in step 4.2, so there's nothing to undo at the schema level. After backout, re-run §4.1 pre-flight before deciding the next move.

---

## 5. Production deployment — additional safeguards

Beyond §4, production deploys require:

1. **Read-only window declared in the team channel** for the duration of the migration.
2. **`pg_dump --schema-only` snapshot** taken immediately before step 4.2. Useful for forensic diffs if something goes wrong after.
3. **Two-person verification.** One person runs the pre-flight `migrate diff`; a second person reviews the (empty or non-empty) result before §4.2 proceeds.
4. **5-minute observation** after step 4.5 before declaring success — watch error rate dashboards and the application's first authenticated query (a `myTenant` or equivalent ping is fine).
5. **Backout drill.** If error rate exceeds the agreed threshold within the observation window, execute §4.6 immediately. Do not investigate first.

For destructive migrations (column removal, table drop), the multi-step deprecate→stop→remove process from NFR-MIG-003 still applies — the playbook above covers the *application* of the migration, not whether it's safe to write.

---

## 6. Environment variable bootstrapping

Some application boots require secrets that aren't checked into the repo. Missing any of these will show up as a clean-looking server boot followed by a 500 on the first request that hits the affected path.

Set these in `.env` (local) or your secret manager (staging/prod) **before** the first application start after a migration-impacting deploy. They're per-environment.

| Variable | Purpose | Generate with | Rotation effect |
|---|---|---|---|
| `HASH_PEPPER` | HMAC pepper for searchable PII hashes (`email_hash`, `tax_id_hash`, `national_id_hash`, `registration_number_hash`). | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Rotating invalidates **all** existing `*_hash` rows. Users will get "Invalid credentials" on login until a backfill script re-computes hashes under the new pepper. Treat as long-lived. |
| `ENCRYPTION_KEY` | AES-256-GCM key for at-rest PII encryption (encrypted columns: `email`, `national_id`, `phone`, etc.). | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | Rotation requires re-encrypting every encrypted column with the new key. There is a `scripts/backfill-pii-hashes-and-encrypt.ts` for this purpose. |
| `ENCRYPTION_IV_LENGTH` | Initialisation vector length for AES-GCM. Always `16`. Documented for clarity. | (constant) | Don't change. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RS256 keypair for signing/verifying access + refresh + MFA tokens. | `openssl genpkey -algorithm RSA -out keys/private.pem && openssl rsa -in keys/private.pem -pubout -out keys/public.pem` | Rotation invalidates every active session. Plan a coordinated logout window. |

**New variables** introduced by a delivery must be added to:
1. `.env.example` (with a placeholder value or generator comment)
2. This table
3. The PR description's "Migration Impact" section if the boot would fail without it

---

## 7. Helper commands

These are convenience aliases for the sequences above. They live in the root `package.json` so any teammate can use them without remembering the long form.

| Script | What it does | When to use |
|---|---|---|
| `pnpm db:fresh-start` | Stops services, recreates the public schema, applies migrations, runs base seed + test seed, restarts services. The full §3b sequence in one shot. | Local dev only. Use after pulling a destructive migration change. |
| `pnpm audit:permissions` | Scans `@Roles(...)` strings across `apps/` + `services/` and compares to seed's `allPermissions`. Exits non-zero on drift. | Locally before pushing; CI on every PR. |
| `pnpm audit:input-decorators` | Scans every `@InputType` / `@ArgsType` `@Field` for missing class-validator decorators. Exits non-zero on gaps. | Locally before pushing; CI on every PR. |
| `pnpm test:regression` | Jest suite under `tests/regression/`. Includes the two drift specs above plus other lifecycle tests. | Before pushing; CI on every PR. |

Implementation: `scripts/db-fresh-start.sh` runs the §3b sequence end-to-end. It refuses to execute if `DATABASE_URL` resolves to anything other than `localhost`, `127.0.0.1`, or `host.docker.internal` — guards against accidentally wiping staging or prod via a stale `.env` switch. For non-local databases, follow §4 explicitly.

---

## 8. Troubleshooting

### "ERROR: relation 'tenants' already exists" during `prisma migrate deploy`

You hit this when the baseline migration tried to run against a populated database (the schema already has the tables the baseline wants to create).

**Fix:** Run §4.1 pre-flight, then §4.2 to mark the baseline as applied. Do **not** proceed without the pre-flight or you risk locking schema drift in.

### "P3018: A migration failed to apply" with a partial-apply error

Prisma marked a migration as "in progress but failed". This is what happened to the original 42-migration chain pre-squash.

**Fix:** Either roll back (`prisma migrate resolve --rolled-back <name>`) and fix the migration's SQL, or mark applied (`prisma migrate resolve --applied <name>`) if you've manually executed the equivalent DDL. For more than two failed migrations in a chain, consider the squash procedure (see §1 of the Post-Sprint-18 delivery notes for the rationale).

### "Internal server error" on every login after a fresh clone

Usually means `HASH_PEPPER` (or another required secret in §6) is missing from `.env`. Check `apps/graphql-server` logs for the actual exception — `computeSearchableHash` throws closed-fail-loud when the pepper is unset.

**Fix:** Generate the secret per §6 and put it in `.env`. Restart the application servers.

### "Cannot find module '@lons/process-engine'" or similar from a script

ts-node is resolving against the wrong `tsconfig`. The audit scripts use explicit `--compiler-options` to bypass the package-level NodeNext config.

**Fix:** Don't run audit scripts via raw `ts-node`; use the `pnpm audit:*` aliases in §7 which carry the correct flags.

### "Migration name is missing" from `prisma migrate resolve`

You typed the baseline name with the wrong format. The argument is the directory name *inside* `prisma/migrations/`, not a hash or a description.

**Fix:** `ls packages/database/prisma/migrations/` to find the canonical name (e.g. `20260519000000_baseline`), then retry.

---

## 9. Future automation (Sprint 19+)

The playbook above is a manual procedure. The Sprint 19 backlog tracks the following automation work to reduce its surface area:

- **S19-STAB-7** Push/merge coordination playbook (this document) + helper script `pnpm db:fresh-start` for §3b in one command.
- **Detection hook** (not yet ticketed): a post-`git pull` or pre-`pnpm dev` check that compares the hash of `packages/database/prisma/migrations/` against the last-known hash on this machine. If it changed, warn the developer to run §3a or §3b before starting their app. Lightweight — could be implemented as a husky hook or a `pnpm postinstall` script.
- **Self-healing seed** (S19-STAB-4 alternative): `db:seed` re-upserts every tenant's role permissions to match `allPermissions`. Removes the manual SQL backfill step that happens after permission-drift fixes.

When these land, this playbook should be updated to reflect the new shorter procedure.

---

## 10. References

- `Docs/DELIVERY-NOTES-POST-SPRINT-18-2026-05-21.md` — the originating delivery that exposed the need for this playbook. §11 (push coordination), §11.1 (staging migration path) and §10 (operational DB state) are the precedents this document generalises.
- `Docs/DEV-PROMPT-POST-SPRINT-18-STABILISATION-FIXES.md` — PM directive (DOC-1 + S19-STAB-7) authorising this playbook.
- `Docs/13-deployment.md` §3.3 — NFR-MIG-001 through -004 (the requirement level this playbook satisfies).
- `Docs/10-security-compliance.md` — guidance on rotating encryption keys and peppers (§6 cross-reference).
- Prisma docs: <https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations>, <https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-resolve>.

---

*Update this document at the close of every migration-impacting delivery. Bias toward making the operational sections shorter, not longer — if a step appears in the playbook three deliveries in a row, automate it.*
