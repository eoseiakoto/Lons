# Sprint 7 Fixes — PM Review

> 3 minor gaps found across 13 tasks. All are quick wiring fixes.

---

## Fix 1: M7 — Add `updatedAt` to changePassword update (auth.service.ts)

**File**: `services/entity-service/src/auth/auth.service.ts`

In the `changePassword()` method, the Prisma update call is missing the explicit `updatedAt` field.

**Find** the `prisma.user.update` call inside `changePassword()` (around line 215-218):

```typescript
await this.prisma.user.update({
  where: { id: userId },
  data: { passwordHash: newHash },
});
```

**Replace with**:

```typescript
await this.prisma.user.update({
  where: { id: userId },
  data: { passwordHash: newHash, updatedAt: new Date() },
});
```

---

## Fix 2: M2 — Add PodDisruptionBudgets to scheduler and notification-worker Helm templates

Two deployment templates are missing PodDisruptionBudgets. The graphql-server, rest-server, and scoring-service deployments already have them — follow the same pattern.

### Fix 2a: Scheduler PDB

**File**: `infrastructure/helm/lons/templates/scheduler/deployment.yaml`

Append the following after the existing Deployment resource (add a `---` separator):

```yaml
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "lons.fullname" . }}-scheduler
  labels:
    {{- include "lons.labels" . | nindent 4 }}
    app.kubernetes.io/component: scheduler
spec:
  minAvailable: 1
  selector:
    matchLabels:
      {{- include "lons.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: scheduler
```

### Fix 2b: Notification Worker PDB

**File**: `infrastructure/helm/lons/templates/notification-worker/deployment.yaml`

Append the following after the existing Deployment resource (add a `---` separator):

```yaml
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "lons.fullname" . }}-notification-worker
  labels:
    {{- include "lons.labels" . | nindent 4 }}
    app.kubernetes.io/component: notification-worker
spec:
  minAvailable: 1
  selector:
    matchLabels:
      {{- include "lons.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: notification-worker
```

---

## Fix 3: M4 — Install jest-junit dependency

The regression test jest config references `jest-junit` as a reporter, but the package is not installed. The `test:regression` script will fail at runtime.

**Run**:

```bash
pnpm add -D jest-junit -w
```

This adds `jest-junit` to the root workspace devDependencies. Verify after installation that `pnpm test:regression` can at least load the config without error (tests themselves need a running database).

---

## Verification After Fixes

```bash
# Fix 1: Verify updatedAt is in the changePassword update
grep -A 3 "passwordHash: newHash" services/entity-service/src/auth/auth.service.ts

# Fix 2: Verify PDBs exist in both templates
grep -l "PodDisruptionBudget" infrastructure/helm/lons/templates/scheduler/deployment.yaml
grep -l "PodDisruptionBudget" infrastructure/helm/lons/templates/notification-worker/deployment.yaml

# Fix 2: Helm lint should still pass
helm lint infrastructure/helm/lons/ || echo "helm not available locally — verify in CI"

# Fix 3: Verify jest-junit installed
pnpm ls jest-junit

# Full test suite (if DB available)
pnpm test
```
