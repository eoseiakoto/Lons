# Lōns Platform — Git Branching Strategy

This document defines the branching model, protection rules, naming conventions, and deployment flow for the Lōns monorepo.

---

## 1. Branch Model

Lōns uses a **Git Flow variant** optimized for continuous integration and multi-environment deployment.

### Primary Branches

#### `main`
- **Purpose**: Production-ready code, deployable at all times.
- **Source**: Created from releases and hotfixes.
- **Protection**: Strictly protected; no direct pushes.
- **Deployment**: Merge to `main` automatically triggers production deployment (manual gate).

#### `develop`
- **Purpose**: Integration branch; consolidates all feature work.
- **Source**: Base branch for all features and infrastructure changes.
- **Protection**: PR required, CI must pass.
- **Deployment**: Auto-deploys to the dev environment on merge.

#### `feature/*`
- **Purpose**: Individual feature or bug fix development.
- **Naming**: `feature/TICKET-ID-short-description` (e.g., `feature/LON-142-customer-kyc-verification`)
- **Source**: Branch from `develop`.
- **Merge**: Back to `develop` via PR (squash merge).
- **Deletion**: Delete after merge.

#### `release/*`
- **Purpose**: Prepare a release (version bump, final testing, release notes).
- **Naming**: `release/vX.Y.Z` (e.g., `release/v1.2.0`)
- **Source**: Branch from `develop` when release candidate is ready.
- **Merge**: Merge to `main` (merge commit) and back to `develop` (merge commit).
- **Deployment**: Auto-deploy to staging on PR creation; manual gates for preprod and prod.
- **Deletion**: Keep briefly for hotfixes; delete after main merge.

#### `hotfix/*`
- **Purpose**: Urgent production fixes (critical bugs, security patches).
- **Naming**: `hotfix/vX.Y.Z-description` (e.g., `hotfix/v1.2.1-payment-encryption-bug`)
- **Source**: Branch from `main`.
- **Merge**: Merge to `main` (merge commit) and back to `develop` (merge commit).
- **Deployment**: Fast-track to staging and prod (manual gates).
- **Deletion**: Delete after merge.

#### `infra/*`
- **Purpose**: Infrastructure, Terraform, Helm charts, CI/CD pipeline changes.
- **Naming**: `infra/description` (e.g., `infra/add-redis-cluster-helm-chart`)
- **Source**: Branch from `develop`.
- **Merge**: Back to `develop` via PR (squash merge).
- **Deletion**: Delete after merge.

---

## 2. Branch Protection Rules

### Rules for `main`

1. **Require a pull request before merging**
   - At least 1 approval required.
   - Dismiss stale PR approvals when new commits are pushed.

2. **Require status checks to pass before merging**
   - `lint-test-build` (TypeScript lint, unit tests, build)
   - `python-scoring` (Python service lint, tests)
   - `docker-build-push` (Docker image build and registry push)
   - All checks must pass.

3. **Require branches to be up to date before merging**
   - Cannot merge if `develop` has diverged.

4. **Enforce a merge strategy**
   - Squash merge preferred for atomic history.
   - Merge commit acceptable for releases/hotfixes.
   - Disallow rebase merge (preserves full history).

5. **Restrict push access**
   - No direct pushes allowed.
   - Only repo admins can bypass protection rules (use sparingly).

6. **Require conversation resolution**
   - All comments must be resolved before merge.

7. **Restrict force pushes**
   - No force push allowed.
   - No deletions allowed.

### Rules for `develop`

1. **Require a pull request before merging**
   - At least 1 approval required.
   - Dismiss stale PR approvals when new commits are pushed.

2. **Require status checks to pass before merging**
   - Same as `main`: `lint-test-build`, `python-scoring`, `docker-build-push`.

3. **Enforce a merge strategy**
   - Squash merge for features.
   - Merge commit for releases (if releasing from develop).

4. **Restrict force pushes**
   - No force push allowed.

---

## 3. Naming Conventions

| Branch Type | Pattern | Example |
|---|---|---|
| Feature | `feature/TICKET-ID-short-description` | `feature/LON-142-customer-kyc-verification` |
| Bug Fix | `feature/TICKET-ID-short-description` or `bugfix/TICKET-ID-description` | `bugfix/LON-087-fix-overdraft-interest-calc` |
| Release | `release/vX.Y.Z` | `release/v1.2.0` |
| Hotfix | `hotfix/vX.Y.Z-description` | `hotfix/v1.2.1-payment-encryption-bug` |
| Infrastructure | `infra/description` | `infra/add-redis-cluster-helm-chart` |

**Rules**:
- Use lowercase.
- Use hyphens to separate words (kebab-case).
- Keep descriptions concise (50 chars max after TICKET-ID).
- Include TICKET-ID when available (links PR to Monday.com board).

---

## 4. Merge Strategy

### Feature Branches
- **Merge Strategy**: Squash merge (keeps `develop` history clean).
- **Commit Message**: `TICKET-ID: Concise description of feature` (auto-filled from PR title).
- **Example**: `LON-142: Add customer KYC verification workflow`

### Release Branches
- **Merge Strategy**: Merge commit (preserves release history for traceability).
- **Commit Message**: `chore(release): bump version to vX.Y.Z`
- **Merge to main**: Merge commit.
- **Merge back to develop**: Merge commit.

### Hotfix Branches
- **Merge Strategy**: Merge commit (preserves hotfix history).
- **Commit Message**: `fix: description (hotfix vX.Y.Z)`
- **Merge to main**: Merge commit.
- **Merge back to develop**: Merge commit.

### Infrastructure Branches
- **Merge Strategy**: Squash merge.
- **Commit Message**: `infra: description`

---

## 5. Deployment Flow

### Standard Feature Development

```
feature/LON-XXX
    ↓ (create PR to develop)
    ↓ (approve + merge to develop)
    ↓ (auto-deploy to dev environment)
develop
```

### Release Process

```
develop (release candidate ready)
    ↓ (create release/vX.Y.Z branch)
    ↓ (bump versions, update CHANGELOG)
    ↓ (create PR: release/vX.Y.Z → develop & main)
    ↓ (CI: lint, test, build passes)
    ↓ (auto-deploy to staging on PR)
staging (manual testing)
    ↓ (approval for preprod)
preprod (final validation)
    ↓ (approval for production)
    ↓ (merge to main triggers auto-deploy)
main (production)
```

### Hotfix Process (Fast-Track)

```
main (production issue detected)
    ↓ (create hotfix/vX.Y.Z-description branch)
    ↓ (implement fix, bump patch version)
    ↓ (create PR: hotfix → main & develop)
    ↓ (CI: lint, test, build passes)
    ↓ (auto-deploy to staging)
staging (quick smoke test)
    ↓ (approval for production)
    ↓ (merge to main triggers auto-deploy)
main (production)
    ↓ (merge back to develop via PR)
develop
```

---

## 6. Environment Mapping

| Environment | Trigger | Branch | Auto/Manual |
|---|---|---|---|
| **dev** | Merge to `develop` | `develop` | Auto |
| **staging** | PR created for `main` or `hotfix` | `release/*`, `hotfix/*` | Auto |
| **preprod** | Manual approval | `release/*`, `hotfix/*` (staging passed) | Manual |
| **production** | Merge to `main` | `main` | Manual gate (approval) |

---

## 7. Developer Checklist Before PR

Before creating a PR, ensure:

- [ ] Branch created from latest `develop` (rebase if necessary).
- [ ] Commit history is clean (rebase/squash WIP commits).
- [ ] All tests pass: `pnpm test`
- [ ] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] No hardcoded secrets, API keys, or PII in code.
- [ ] Database migrations are backward-compatible (if applicable).
- [ ] Idempotency key supported on new mutations.
- [ ] Financial calculations use `Decimal` types (if applicable).
- [ ] Multi-tenancy: tenant context passed to all DB operations (if applicable).
- [ ] PR title follows naming convention (e.g., `TICKET-ID: Description`).
- [ ] PR description includes summary, testing notes, and screenshots (if UI).

---

## 8. Code Review Expectations

Reviewers should verify:

1. **Functional correctness**: Does the code implement the feature as intended?
2. **Test coverage**: Are critical paths tested?
3. **Code quality**: Follows Lōns naming conventions, architectural patterns, and best practices.
4. **Security**: No PII in logs, no SQL injection, encryption used for sensitive data, no hardcoded secrets.
5. **Performance**: No N+1 queries, efficient algorithms, no memory leaks.
6. **Multi-tenancy**: All DB operations scoped to current tenant.
7. **Financial correctness**: Decimal types used, rounding is correct, calculations are deterministic.
8. **Documentation**: API changes documented, complex logic has comments.

Approval = "I'm confident this is production-ready."

---

## 9. Incident Response: Broken `main`

If a critical bug is discovered in production (post-merge to `main`):

1. **Immediate**: Create a hotfix branch from `main`.
2. **Fix**: Implement the fix and add test coverage.
3. **Fast-track**: Merge hotfix to `main` (auto-deploys to prod).
4. **Backport**: Merge hotfix back to `develop` to prevent regression.
5. **Post-mortem**: Review what allowed the bug through; improve checks.

---

## 10. FAQ

### Q: Can I push directly to `main` or `develop`?
**A**: No. Branch protection rules enforce PR-only merges. This ensures all code is reviewed and tested.

### Q: What if my feature branch is stale?
**A**: Rebase on `develop`: `git rebase origin/develop`. If conflicts, resolve locally and force-push to your feature branch (safe because only you have it).

### Q: How do I include a hotfix in the current release?
**A**: Hotfixes branch from `main`, not `develop`. After merge to `main`, backport to `develop` and the current `release/*` branch (if one exists).

### Q: Can I use `rebase --interactive` to clean up commits before PR?
**A**: Yes! Recommended. Keep history clean: squash WIP commits, reword messages for clarity.

### Q: What if a PR is blocked by a failing CI check?
**A**: Fix the issue in your feature branch, push, and rerun the check. The PR will re-evaluate automatically.

---

## 11. Related Documents

- `.github/PULL_REQUEST_TEMPLATE.md` — PR template with checklists.
- `Docs/13-deployment.md` — Detailed deployment pipeline (CI/CD, environments).
- `CLAUDE.md` — Project overview and development phases.
