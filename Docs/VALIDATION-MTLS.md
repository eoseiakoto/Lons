# Staging Validation: Linkerd mTLS Service Mesh

**Task ID:** 11620328879
**Sprint:** 5 (May 22 – Jun 4)
**Prerequisites:** Staging EKS cluster running, Linkerd control plane installed, services deployed with mesh injection enabled

## Objective
Validate that Linkerd mTLS doesn't break inter-service communication, stays within latency SLAs, and resource overhead is acceptable.

## Pre-Validation Checklist
- [ ] values-staging.yaml has `serviceMesh.enabled: true` ✅ (already set)
- [ ] Linkerd control plane is healthy (`linkerd check`)
- [ ] All service pods have Linkerd sidecar injected (2/2 containers)
- [ ] Linkerd dashboard accessible (`linkerd dashboard`)

## Test Cases

### TC-1: Mesh Injection Verification
```bash
# Verify all pods have Linkerd sidecar
kubectl get pods -n lons-staging -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].name}{"\n"}{end}'
```
**Pass criteria:** Each pod shows 2 containers (main + linkerd-proxy). All 6 deployments injected.

### TC-2: mTLS Certificate Verification
```bash
# Check mTLS status between services
linkerd viz stat -n lons-staging deploy
linkerd viz edges -n lons-staging deploy
```
**Pass criteria:** All edges show "secured" (mTLS active). No plaintext connections between mesh-injected pods.

### TC-3: ServerAuthorization — Allowed Paths
Test each allowed communication path:

| Source | Destination | Port | Expected |
|--------|------------|------|----------|
| graphql-server | scoring-service | 8000 | ✅ Allowed |
| rest-server | scoring-service | 8000 | ✅ Allowed |
| scheduler | notification-worker | 3003 | ✅ Allowed |
| admin-portal | graphql-server | 3000 | ✅ Allowed |
| rest-server | graphql-server | 3000 | ✅ Allowed |
| ingress (unauthenticated) | graphql-server | 3000 | ✅ Allowed |
| ingress (unauthenticated) | rest-server | 3001 | ✅ Allowed |
| ingress (unauthenticated) | admin-portal | 3100 | ✅ Allowed |

**Test method:** Run integration E2E test suite — all tests should pass.

### TC-4: ServerAuthorization — Denied Paths
Test unauthorized communication is blocked (when authorization.enabled=true, preprod/prod only):

| Source | Destination | Port | Expected |
|--------|------------|------|----------|
| notification-worker | scoring-service | 8000 | ❌ Denied |
| scheduler | scoring-service | 8000 | ❌ Denied |
| admin-portal | scoring-service | 8000 | ❌ Denied |
| scoring-service | graphql-server | 3000 | ❌ Denied |

**Note:** In staging, authorization is disabled (auth off for testing). This test runs in preprod.

### TC-5: Latency Impact — GraphQL P95
**Baseline:** Record GraphQL P95 latency before mesh enablement
**Test:** Record P95 latency with mesh active over 1 hour
```bash
# Check via Linkerd metrics
linkerd viz stat -n lons-staging deploy/lons-graphql-server --to deploy/lons-scoring-service
```
**Pass criteria:** GraphQL P95 < 200ms (Docs/12-non-functional.md SLA). Mesh overhead < 5ms per hop.

### TC-6: Latency Impact — Scoring Service
**Test:** Measure scoring-service response time through the mesh
**Pass criteria:** P95 < 500ms (scoring has a higher tolerance due to ML inference)

### TC-7: Sidecar Resource Overhead
```bash
# Check Linkerd proxy resource consumption
kubectl top pods -n lons-staging --containers | grep linkerd-proxy
```
**Pass criteria:** Each sidecar uses < 50m CPU and < 80Mi memory (within configured limits of 250m/256Mi). Total cluster overhead from 6 sidecars < 300m CPU and < 480Mi memory.

### TC-8: Full E2E Test Suite with Mesh
Run the complete integration test suite:
```bash
pnpm test:e2e
```
**Pass criteria:** All existing E2E tests pass without modification. No timeout increases needed.

## Validation Sign-Off
| Test Case | Result | Tested By | Date | Notes |
|-----------|--------|-----------|------|-------|
| TC-1 | | | | |
| TC-2 | | | | |
| TC-3 | | | | |
| TC-4 | | | | Preprod only |
| TC-5 | | | | Baseline: ___ms, With mesh: ___ms |
| TC-6 | | | | |
| TC-7 | | | | Total overhead: CPU ___m, Mem ___Mi |
| TC-8 | | | | |

## Rollback Procedure
If mesh causes issues:
1. Disable injection: Set `serviceMesh.enabled: false` in values
2. Helm upgrade to redeploy without sidecars
3. Restart all pods: `kubectl rollout restart -n lons-staging deploy`
