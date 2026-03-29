# SLA Mapping & Test Strategy

This document maps the non-functional requirements from Docs/12-non-functional.md to specific k6 load tests and validation thresholds.

## Reference: Docs/12-non-functional.md

From the requirements document, the Lōns platform must meet these SLAs:

### Latency Targets (P95)

| Endpoint/Operation | P95 | Target |
|---|---|---|
| Overdraft Application | 5 seconds | Fast turnaround for quick disbursal |
| Micro-Loan Application | 5 seconds | Same-day approval targeting |
| BNPL Application | 8 seconds | Checkout integration tolerance |
| Factoring Application | 10 seconds | B2B workflow tolerance |
| GraphQL Queries | 200 milliseconds | Interactive UI responsiveness |
| Scoring Service | 3 seconds | Real-time decision making |
| Repayment Processing | 2 seconds | Wallet integration throughput |
| Reconciliation Batch | < 15 minutes | Daily settlement window |

### Error Rate

- **Target:** < 0.1% (1 error per 1000 requests)
- **Exception:** Multi-tenant isolation must have zero cross-tenant leaks

### Concurrency

- **Peak Load:** 5,000 concurrent users
- **Sustained Load:** 2,000 concurrent users
- **Typical Load:** 500 concurrent users

### Data Volume

- **Tenants:** 100 active (test with top 5)
- **Customers:** 50,000 per tenant (sampled for performance tests)
- **Active Contracts:** 200,000 across all tenants
- **Ledger Entries:** ~2,000,000 (affects reconciliation)

### Product Distribution (Live Portfolio)

- **Overdraft:** 70% of volume
- **Micro-Loan:** 20% of volume
- **BNPL:** 5% of volume
- **Factoring:** 5% of volume

For load testing, we use:
- **Overdraft:** 40% (more realistic smaller test)
- **Micro-Loan:** 30%
- **BNPL:** 20%
- **Factoring:** 10%

## Test Mapping

### 1. Loan Application Lifecycle Tests

**Script:** `loan-application.js`

Tests the full path from request to disbursement. Each step is timed independently.

#### Steps Tested

1. **Customer Creation** (baseline)
2. **Create Loan Request** (t0)
   - Validates input, creates request entity
   - SLA: < overdraft P95 per product type
3. **Pre-Qualification Check** (t1)
   - Rule engine validation
   - SLA: < overdraft P95
4. **Credit Scoring** (t2)
   - Calls scoring service
   - SLA: < 3 seconds (scoring service SLA)
5. **Approval Decision** (t3)
   - Policy decision based on score
   - SLA: < overdraft P95
6. **Offer Generation** (t4)
   - Creates financial terms
   - SLA: < overdraft P95
7. **Offer Acceptance** (t5)
   - Customer signs terms, contract created
   - SLA: < 8 seconds (BNPL tolerance, highest of 1-6)
8. **Disbursement Initiation** (t6)
   - Wallet API call
   - SLA: < 8 seconds

#### Metrics Collected

Per product type:
- `overdraft_application_duration` (P95 < 5s)
- `microloan_application_duration` (P95 < 5s)
- `bnpl_application_duration` (P95 < 8s)
- `factoring_application_duration` (P95 < 10s)

Per step:
- `prequal_duration`
- `scoring_duration` (must stay < 3s)
- `approval_duration`
- `offer_duration`
- `accept_duration`
- `disbursement_duration`

**Validation Approach:**
- Run under sustained ramp (10 → 200 VUs over 10 minutes)
- Measure full path latency
- Identify slowest step bottleneck
- Score distribution affects scoring_duration

### 2. Repayment Processing Tests

**Script:** `repayment-processing.js`

Validates throughput and waterfall allocation under sustained load.

#### Scenario Coverage

1. **Full Payment** (60% of test traffic)
   - Pay entire outstanding balance
   - Allocate to principal, interest, fees in order
2. **Partial Payment** (25% of test traffic)
   - Pay 50% of outstanding
   - Verify allocation waterfall
3. **Early Settlement** (10% of test traffic)
   - Pay full amount + 2% early settlement fee
   - Update contract status
4. **Penalty Payment** (5% of test traffic)
   - Partial payment on delinquent contract
   - Apply penalties, then principal

#### Throughput Target

- **Target:** 500 transactions per minute sustained
- **Test Duration:** 5 minutes
- **Expected Completions:** ~2,500 repayments
- **Success Threshold:** > 99.9% (1 failure allowed)

#### Metrics Collected

- `payment_duration` (P95 < 2 seconds)
- `processed_payments` (counter, should reach ~2500)
- `failed_requests` (rate < 0.1%)

**Validation Approach:**
- Use constant-arrival-rate executor (not VU ramp)
- Verify waterfall allocation in database post-test
- Check ledger entries are correctly created
- Validate remaining balance equals sum of allocations

### 3. GraphQL Query Performance Tests

**Script:** `graphql-queries.js`

Read-heavy workload validating query response times and pagination.

#### Covered SLAs

- **GraphQL Queries:** P95 < 200ms, P99 < 500ms (Docs/12-non-functional.md §1.1)
- **REST API Endpoints:** P95 < 200ms (validation via REST adapter coverage)

#### Queries Tested

1. **Customer Search** (`customers`)
   - Pagination: 20, 50, 100 items
   - Filter by status, creation date
   - Expected: 10-50ms
2. **Loan List** (`contracts`)
   - Filter by product type, status, date range
   - Pagination with cursor
   - Expected: 50-100ms
3. **Contract Detail** (`contract`)
   - Single contract with all nested fields
   - Expected: 20-50ms
4. **Dashboard Metrics** (`dashboardMetrics`)
   - Aggregation query (heavy)
   - Expected: 100-200ms
5. **Repayment Schedule** (`repaymentSchedule`)
   - 20-50 installments per response
   - Expected: 30-80ms

#### Load Ramp

```
0-30s:  ramp to 50 VUs
30-90s: ramp to 200 VUs
90-180s: ramp to 500 VUs
180-240s: ramp to 1000 VUs (spike test)
240-270s: cool down
```

#### Metrics Collected

- `query_duration` per query type
- `graphql_p95` aggregate (P95 < 200ms, P99 < 500ms)
- Failed queries (rate < 0.1%)

**Validation Approach:**
- Ensure database has proper indexes
- Check pagination cursor implementation
- Verify field-level authorization (PII fields masked)
- Monitor N+1 query patterns
- Profile slow queries

### 4. GraphQL Mutation Performance Tests

**Script:** `graphql-mutations.js`

Write operation performance validating mutation response times and side effects.

#### Covered SLAs

- **GraphQL Mutations:** P95 < 500ms, P99 < 1s (Docs/12-non-functional.md §1.1)

#### Mutations Tested

1. **createCustomer** - New customer registration
   - Input validation and entity persistence
   - Expected: 50-200ms
2. **createLoanRequest** - Loan application submission
   - Request validation, initial scoring trigger
   - Expected: 100-300ms
3. **acceptOffer** - Offer acceptance and contract creation
   - Contract generation, state transitions, event emission
   - Expected: 150-400ms
4. **processRepayment** - Payment processing with waterfall allocation
   - Allocation calculation, ledger entry creation, balance update
   - Expected: 200-500ms

#### Load Ramp

```
0-30s:  ramp to 100 VUs
30-150s: sustain 200 VUs
150-180s: cool down
```

#### Metrics Collected

- `mutation_duration` per mutation type
- `graphql_mutations_p95` aggregate (P95 < 500ms, P99 < 1s)
- Failed mutations (rate < 1%)

**Validation Approach:**
- Ensure idempotency keys prevent duplicate processing
- Verify transaction isolation for concurrent mutations
- Check cascading updates (e.g., balance recalculation)
- Validate audit trail creation
- Monitor locking contention on shared resources

### 5. Multi-Tenant Isolation Tests

**Script:** `tenant-isolation.js`

Zero-tolerance verification of tenant data segregation.

#### Covered SLAs

- **Cross-Tenant Isolation:** Zero tolerance for data leaks (Docs/12-non-functional.md §2.1 NFR-SC-004)

#### Test Scenario

- **Tenant A:** 25 VUs, 2 minute duration
- **Tenant B:** 25 VUs, 2 minute duration (concurrent)
- **Queries:** Customer list, contract list per tenant
- **Verification:** Every returned record must have correct tenant

#### Cross-Contamination Checks

1. `node.tenantId` field matches request tenant ID
2. Total count per tenant matches baseline
3. No 403 errors (authorization enforced)
4. No SQL errors (malformed RLS policies)

#### Metrics Collected

- `cross_contamination_errors` (must be 0)
- `failed_requests` (rate < 5%)

**Validation Approach:**
- Use different credentials per tenant
- Query same resource types both tenants
- Compare result sets
- Check PostgreSQL session variable `app.current_tenant`
- Verify RLS policies on all tables
- Run before deploy to catch RLS regressions

### 6. Full SLA Validation Suite

**Script:** `sla-validation.js`

Combines all tests under production-like load to validate complete SLA compliance.

#### Load Profile

```
0-2m:    ramp 0 → 100 VUs (warm-up)
2-7m:    sustain 500 VUs (load test)
7-8m:    ramp 500 → 2000 VUs (sustained stress)
8-9m:    ramp 2000 → 5000 VUs (spike)
9-12m:   sustain 5000 VUs (peak load)
12-14m:  cool down to 0 VUs
```

#### Thresholds

All metrics must pass simultaneously:

| Metric | Threshold | Test | Source |
|--------|-----------|------|--------|
| `prequal_p95` | < 1000ms | loan-application.js/prequal | Docs/12 §1.1 |
| `rest_api_p95` | < 200ms | graphql-queries.js | Docs/12 §1.1 |
| `admin_portal_p95` | < 2000ms | Manual portal testing | Docs/12 §1.1 |
| `report_generation_p95` | < 10000ms | Manual report testing | Docs/12 §1.1 |
| `graphql_mutations_p95` | < 500ms | graphql-mutations.js | Docs/12 §1.1 |
| `overdraft_p95` | < 5000ms | loan-application.js step | Docs/12 §1.1 |
| `microloan_p95` | < 5000ms | loan-application.js step | Docs/12 §1.1 |
| `bnpl_p95` | < 8000ms | loan-application.js step | Docs/12 §1.1 |
| `factoring_p95` | < 10000ms | loan-application.js step | Docs/12 §1.1 |
| `graphql_p95` | < 200ms | graphql-queries.js | Docs/12 §1.1 |
| `repayment_p95` | < 2000ms | repayment-processing.js | Docs/12 §1.1 |
| `scoring_duration` | < 3000ms | loan-application.js/scoring | Docs/12 §1.1 |
| `overall_error_rate` | < 0.1% | all operations | Docs/12 §1.1 |

**Pass Criteria:**
- ALL thresholds pass (k6 exits with code 0)
- Zero cross-tenant contamination (separate test)
- P99 latencies < 2x P95 (normal distribution)

## Running Tests for SLA Validation

### Pre-Production Checklist

Before deploying to production, run in this order:

```bash
# 1. Quick smoke test (2 min)
k6 run scripts/load-test.js -e ENVIRONMENT=dev

# 2. Loan application flow (10 min)
k6 run scripts/load-tests/loan-application.js -e ENVIRONMENT=staging

# 3. Repayment throughput (5 min)
k6 run scripts/load-tests/repayment-processing.js -e ENVIRONMENT=staging

# 4. GraphQL query performance (8 min)
k6 run scripts/load-tests/graphql-queries.js -e ENVIRONMENT=staging

# 5. Tenant isolation (2 min) - zero tolerance
k6 run scripts/load-tests/tenant-isolation.js -e ENVIRONMENT=staging \
  -e TENANT_A_ID=<tenant-a> -e TENANT_A_EMAIL=... \
  -e TENANT_B_ID=<tenant-b> -e TENANT_B_EMAIL=...

# 6. Full SLA suite (14 min) - stress test at peak
k6 run scripts/load-tests/sla-validation.js -e ENVIRONMENT=preprod
```

**Total Time:** ~41 minutes
**Success Criteria:** All tests pass with exit code 0

### Continuous Performance Monitoring

Add to nightly CI/CD:

```yaml
# .github/workflows/nightly-sla-check.yml
schedule:
  - cron: '0 2 * * *'  # 2 AM UTC
steps:
  - run: k6 run scripts/load-tests/sla-validation.js \
    -e ENVIRONMENT=preprod
  - if: failure()
    run: |
      echo "SLA validation failed!"
      # Post to Slack, create issue, etc.
```

## Failure Analysis

### If P95 Exceeds Threshold

1. Identify which step/query is slow
2. Check query performance in database
3. Look for missing indexes
4. Profile with slow query log
5. Review recent schema changes
6. Check third-party service latency

### If Error Rate > 0.1%

1. Check application error logs
2. Verify database connectivity
3. Look for timeout errors
4. Check third-party API health
5. Review rate limiting config

### If Cross-Tenant Data Leaks

1. EMERGENCY: Block all deployments
2. Verify RLS policies exist on all tables
3. Check tenant context is set in session
4. Review recent SQL changes
5. Audit data retention

## Example: Interpreting Results

```
k6 run scripts/load-tests/sla-validation.js

...output...

 ✓ overdraft_p95: 3246ms < 5000ms (PASS)
 ✓ microloan_p95: 3512ms < 5000ms (PASS)
 ✗ bnpl_p95: 8234ms < 8000ms (FAIL) ← Exceeded by 234ms
 ✓ factoring_p95: 7891ms < 10000ms (PASS)
 ✓ graphql_p95: 156ms < 200ms (PASS)
 ✓ repayment_p95: 1876ms < 2000ms (PASS)
 ✓ overall_error_rate: 0.08% < 0.1% (PASS)

Exit Code: 1 (FAILURE)
```

**Interpretation:**
- BNPL application flow hit P95 of 8234ms (exceeds 8000ms SLA by 234ms)
- Likely culprit: complex BNPL offer generation
- Remediation: Add database index on offer calculation query, cache term templates
- Re-test: Repeat to confirm fix
