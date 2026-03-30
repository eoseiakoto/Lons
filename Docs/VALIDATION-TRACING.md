# Staging Validation: OTEL Tracing Pipeline

**Task ID:** 11620338475
**Sprint:** 5 (May 22 – Jun 4)
**Prerequisites:** Staging EKS cluster running, OTEL Collector deployed, services deployed with tracing enabled

## Objective
Validate end-to-end trace propagation across the full loan lifecycle and confirm AWS X-Ray is receiving spans correctly.

## Pre-Validation Checklist
- [ ] values-staging.yaml has `tracing.enabled: true` ✅ (already set)
- [ ] OTEL Collector pod is Running (`kubectl get pods -n lons-staging -l app.kubernetes.io/component=otel-collector`)
- [ ] All service pods are Running with OTEL_EXPORTER_OTLP_ENDPOINT env var set
- [ ] AWS X-Ray console accessible in eu-west-1

## Test Cases

### TC-1: OTEL Collector Health
```bash
# Verify collector is running and healthy
kubectl get pods -n lons-staging -l app.kubernetes.io/component=otel-collector
kubectl logs -n lons-staging -l app.kubernetes.io/component=otel-collector --tail=50

# Check collector metrics
kubectl port-forward -n lons-staging svc/lons-otel-collector 8888:8888
curl http://localhost:8888/metrics | grep otelcol_receiver_accepted_spans
```
**Pass criteria:** Collector running, no error logs, metrics endpoint responding.

### TC-2: Single Service Trace (GraphQL)
```bash
# Send a simple GraphQL query
curl -X POST https://api.staging.lons.io/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -d '{"query": "{ __typename }"}'
```
**Pass criteria:** Trace visible in X-Ray within 60 seconds. Span includes: service name (graphql-server), HTTP method, status code, duration.

### TC-3: Cross-Service Trace (GraphQL → Scoring)
```bash
# Trigger a loan pre-qualification that calls the scoring service
curl -X POST https://api.staging.lons.io/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -d '{"query": "mutation { createLoanRequest(input: { ... }) { id status } }"}'
```
**Pass criteria:** X-Ray shows a trace with spans for both graphql-server AND scoring-service, linked by trace context propagation (W3C TraceContext headers).

### TC-4: Full Loan Lifecycle Trace
Execute the full loan lifecycle and verify trace continuity:
1. Create loan request (graphql-server)
2. Pre-qualification (process-engine)
3. Credit scoring (scoring-service)
4. Approval + offer generation (process-engine)
5. Acceptance + disbursement (process-engine → notification-worker)

**Pass criteria:** Single trace ID visible across all 5 steps in X-Ray service map. No broken trace contexts.

### TC-5: Health Endpoint Exclusion
```bash
# Hit health endpoint repeatedly
for i in $(seq 1 20); do curl -s https://api.staging.lons.io/v1/health; done
```
**Pass criteria:** Health endpoint requests do NOT generate traces (excluded via OTEL config).

### TC-6: Performance Impact
**Baseline:** Measure GraphQL P95 latency WITHOUT tracing (from pre-deployment metrics)
**Test:** Measure P95 latency WITH tracing active over 1 hour of simulated traffic
**Pass criteria:** P95 increase < 10ms (tracing overhead should be negligible with batch export)

## Validation Sign-Off
| Test Case | Result | Tested By | Date | Notes |
|-----------|--------|-----------|------|-------|
| TC-1 | | | | |
| TC-2 | | | | |
| TC-3 | | | | |
| TC-4 | | | | |
| TC-5 | | | | |
| TC-6 | | | | |

## Tuning Notes
<!-- Document any batch processor, sampling, or exporter tuning applied during validation -->
