# k6 Load Testing Framework

Comprehensive load testing suite for the Lōns fintech platform using k6, with scenario-based tests validating SLAs from Docs/12-non-functional.md.

## Quick Start

### Installation

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3232A
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6

# Verify installation
k6 version
```

### Run Smoke Test (2 minutes)

```bash
# Local development (default)
k6 run scripts/load-test.js

# Staging
k6 run -e ENVIRONMENT=staging scripts/load-test.js
```

### Run Full SLA Validation (14 minutes)

```bash
# Full suite with 5000 concurrent users at peak
k6 run scripts/load-tests/sla-validation.js -e ENVIRONMENT=dev
```

## Test Scenarios

### 1. Loan Application (`loan-application.js`)

Full loan lifecycle: request → pre-qualification → scoring → approval → offer → acceptance → disbursement.

**Duration:** 10 minutes
**Peak VUs:** 200
**Product Mix:**
- 40% Overdraft (P95 <5s)
- 30% Micro-Loan (P95 <5s)
- 20% BNPL (P95 <8s)
- 10% Factoring (P95 <10s)

**Run:**
```bash
k6 run scripts/load-tests/loan-application.js \
  -e ENVIRONMENT=dev
```

**Metrics:**
- `loan_application_duration` - Full application flow
- `prequal_duration` - Pre-qualification step
- `scoring_duration` - Credit scoring
- `approval_duration` - Approval decision
- `offer_duration` - Offer generation
- `accept_duration` - Offer acceptance
- `disbursement_duration` - Disbursement initiation

### 2. Repayment Processing (`repayment-processing.js`)

Sustained repayment throughput test targeting 500 transactions/minute.

**Duration:** 5 minutes
**Target Rate:** 500 txn/min
**Pre-allocated VUs:** 50
**Max VUs:** 100
**Thresholds:** P95 <2s, Error rate <0.1%

**Run:**
```bash
k6 run scripts/load-tests/repayment-processing.js \
  -e ENVIRONMENT=dev \
  -e CONTRACT_ID=<contract-uuid>
```

**Metrics:**
- `payment_duration` - Repayment processing time
- `processed_payments` - Success counter
- `failed_requests` - Failure rate

**Scenarios:**
- Full payment
- Partial payment (50% of balance)
- Early settlement (102% - includes fee)
- Penalty payment (15% partial)

### 3. GraphQL Queries (`graphql-queries.js`)

Read query performance across core endpoints.

**Duration:** 8 minutes
**VU Ramp:** 50 → 200 → 500 → 1000 → 500 → 0
**Thresholds:** P95 <200ms, P99 <500ms

**Run:**
```bash
k6 run scripts/load-tests/graphql-queries.js \
  -e ENVIRONMENT=dev
```

**Query Coverage:**
- Customer search with pagination
- Loan list with filters
- Contract details
- Dashboard metrics
- Repayment schedule

**Pagination Testing:**
- 25, 50, 100 items per page (cursor-based)
- Field-level authorization (PII field masking)

### 4. GraphQL Mutations (`graphql-mutations.js`)

Mutation performance across core write operations.

**Duration:** 5 minutes
**Peak VUs:** 200
**Thresholds:** P95 <500ms, P99 <1s

**Run:**
```bash
k6 run scripts/load-tests/graphql-mutations.js \
  -e ENVIRONMENT=dev \
  -e TENANT_ID=<tenant-uuid>
```

**Mutation Coverage:**
- `createCustomer` - New customer registration
- `createLoanRequest` - Loan application submission
- `acceptOffer` - Offer acceptance and contract creation
- `processRepayment` - Payment processing with waterfall allocation

**Metrics:**
- `mutation_duration` - Individual mutation latency
- `failed_requests` - Failure rate (< 1%)

**Test Pattern:**
- Stages: 30s ramp (100 VUs) → 2m sustained (200 VUs) → 30s cooldown
- Equal distribution across mutation types
- Validates mutation SLA from Docs/12-non-functional.md §1.1

### 5. Tenant Isolation (`tenant-isolation.js`)

Multi-tenant data isolation verification.

**Duration:** 2 minutes
**Configuration:** 2 concurrent tenants (Tenant A: 25 VUs, Tenant B: 25 VUs)
**Verification:** Zero cross-tenant data leaks

**Run:**
```bash
k6 run scripts/load-tests/tenant-isolation.js \
  -e ENVIRONMENT=dev \
  -e TENANT_A_ID=<tenant-a-uuid> \
  -e TENANT_A_EMAIL=admin-a@example.com \
  -e TENANT_A_PASSWORD=password-a \
  -e TENANT_B_ID=<tenant-b-uuid> \
  -e TENANT_B_EMAIL=admin-b@example.com \
  -e TENANT_B_PASSWORD=password-b
```

**Metrics:**
- `cross_contamination_errors` - Zero tolerance
- `failed_requests` - HTTP failures <5%

**Checks:**
- Only tenant's own data returned
- Cross-tenant queries return empty or 403
- RLS (Row-Level Security) enforcement

### 6. SLA Validation (`sla-validation.js`)

Comprehensive suite validating all SLAs under production-like load.

**Duration:** 14 minutes
**Peak VUs:** 5000
**Test Parameters:**
- 100 tenants (top 5 by customer count)
- 50K customers per tenant (sampled)
- 200K active contracts
- 4 product types with realistic mix

**Run:**
```bash
k6 run scripts/load-tests/sla-validation.js -e ENVIRONMENT=preprod
```

**SLA Thresholds (from Docs/12):**

| Metric | P95 | P99 |
|--------|-----|-----|
| Overdraft Application | 5s | — |
| Micro-Loan Application | 5s | — |
| BNPL Application | 8s | — |
| Factoring Application | 10s | — |
| GraphQL Queries | 200ms | 500ms |
| Scoring Service | 3s | — |
| Repayment Processing | 2s | — |
| Reconciliation Batch | <15 min | — |
| Error Rate | <0.1% | — |
| Concurrent Users | 5000 | — |

## Configuration

### Environment Variables

All tests respect these environment variables:

```bash
ENVIRONMENT=dev|staging|preprod|prod  # Default: dev
PROFILE=smoke|load|stress|soak|spike   # Default: load
```

### config.js

Central configuration file defining:
- **ENVIRONMENTS** - API endpoints for each environment
- **SLA_THRESHOLDS** - P95/P99 targets from requirements
- **PRODUCT_MIX** - Distribution weights
- **CONCURRENCY_PROFILES** - VU ramp patterns

### Concurrency Profiles

```javascript
smoke   // 30s ramp, 5 peak VUs (quick sanity check)
load    // 6m test, 50-100 VUs (baseline performance)
stress  // 5m ramp to 2000 VUs (breaking point)
soak    // 40m sustained 100 VUs (stability check)
spike   // Sudden 5000 spike from 100 (resilience)
```

## Helper Modules

### `helpers/auth.js`

JWT token management with per-VU caching:
- `getAuthToken(baseUrl, tenantId, username, password)` - Gets/caches token
- `getAuthHeaders(token, tenantId)` - REST headers with auth
- `getGraphQLHeaders(token, tenantId)` - GraphQL headers with auth
- `clearAuthCache()` - Reset tokens (for test reset)

### `helpers/data-generators.js`

Realistic test data generation:
- `generateGhanaianCustomer()` - +233 phone format
- `generateKenyanCustomer()` - +254 phone format
- `generateNigerianCustomer()` - +234 phone format
- `generateLoanRequest(productType)` - Loan payloads
- `generateRepaymentPayload(type, amount)` - Repayment types
- `GRAPHQL_QUERIES` - Pre-built GraphQL query templates

**Phone Formats:**
- Ghana: +233XXXXXXXXX (10 digits)
- Kenya: +254XXXXXXXXX (9 digits)
- Nigeria: +234XXXXXXXXXX (10 digits)

## Metrics & Thresholds

All tests define thresholds that must pass for the test to succeed.

### Built-in k6 Metrics

```
http_req_duration    // Request latency
http_req_failed      // Failed HTTP requests
http_req_receiving   // Response receive time
http_req_sending     // Request send time
http_req_waiting     // Time to first byte
```

### Custom Metrics

**Trends** (percentiles):
- `loan_application_duration`
- `prequal_duration`
- `scoring_duration`
- `approval_duration`
- `offer_duration`
- `accept_duration`
- `disbursement_duration`
- `payment_duration`
- `query_duration`
- `overdraft_p95`, `microloan_p95`, `bnpl_p95`, `factoring_p95`
- `graphql_p95`
- `repayment_p95`

**Rates** (0-1):
- `application_failure_rate`
- `prequal_failure_rate`
- `scoring_failure_rate`
- `approval_failure_rate`
- `offer_failure_rate`
- `accept_failure_rate`
- `disbursement_failure_rate`
- `overall_error_rate`

**Counters** (cumulative):
- `processed_payments`
- `successful_operations`
- `failed_operations`
- `cross_contamination_errors`

## Output Formats

### Console Output

```bash
k6 run script.js
# Default: summary in stdout
```

### JSON Output (for analysis)

```bash
k6 run script.js --out json=results.json
```

### HTML Report (via xk6)

```bash
# Install xk6-html
go install github.com/grafana/xk6-html@latest

# Generate HTML report
xk6 run -o html=report.html script.js
```

### InfluxDB / Grafana (production)

```bash
# Configure k6 to send to InfluxDB
k6 run \
  --out influxdb=http://localhost:8086 \
  script.js
```

## GitHub Actions Integration

Manual workflow dispatch with options for:
- **Environment:** dev, staging, preprod, prod
- **Test Type:** smoke, loan-application, repayment-processing, graphql-queries, tenant-isolation, sla-validation
- **Profile:** smoke, load, stress, soak, spike

### Run from GitHub UI

1. Go to Actions → Load Test Suite
2. Click "Run workflow"
3. Select environment and test type
4. Monitor progress
5. Download results artifact

### Example: Nightly SLA Validation

Create `.github/workflows/nightly-load-test.yml`:

```yaml
name: Nightly SLA Validation

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily

jobs:
  load_test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          k6 run scripts/load-tests/sla-validation.js \
            -e ENVIRONMENT=preprod
```

## Best Practices

### Test Design

1. **Ramp gradually** - Avoid thundering herd; use stages
2. **Test realistic scenarios** - Match actual user behavior
3. **Validate waterfall** - Repayment allocation must balance
4. **Multi-tenant verification** - Zero tolerance for cross-contamination
5. **Stress test past capacity** - Find breaking point for capacity planning

### Test Execution

1. **Start with smoke** - Quick sanity check before full suite
2. **Run against staging first** - Never prod without staging validation
3. **Collect baseline** - Run tests weekly to detect regressions
4. **Monitor third-party services** - Check wallet/bureau/SMS adapters
5. **Document results** - Keep test history for trend analysis

### Troubleshooting

**High response times**
- Check database slow query logs
- Verify caching (Redis) is working
- Look for N+1 query patterns
- Check CPU/memory on servers

**High error rate**
- Review application error logs
- Check third-party service health
- Verify database connections aren't exhausted
- Look for rate limiting

**Cross-tenant contamination**
- Verify RLS policies are enabled
- Check tenant context is set in session vars
- Ensure all queries filter by tenant
- Review WHERE clauses in critical queries

**Unrealistic results**
- Verify test data distribution matches production
- Check if caches are warmed appropriately
- Confirm database has sufficient indexes
- Review pagination cursor implementation

## Files Structure

```
scripts/
├── load-test.js                  # Smoke test (basic 2-min check)
├── load-tests/
│   ├── config.js                 # Shared configuration
│   ├── loan-application.js        # Full application flow (10min)
│   ├── repayment-processing.js    # Throughput test (5min)
│   ├── graphql-queries.js         # Read performance (8min)
│   ├── graphql-mutations.js       # Mutation performance (5min)
│   ├── tenant-isolation.js        # Multi-tenant verification (2min)
│   ├── sla-validation.js          # Full SLA suite (14min)
│   ├── helpers/
│   │   ├── auth.js                # JWT token management
│   │   └── data-generators.js     # Test data factories
│   ├── README.md                  # This file
│   └── SLA-MAPPING.md             # SLA requirements mapping
└── ../.github/workflows/
    └── load-test.yml              # GitHub Actions CI/CD
```

## Links

- [k6 Documentation](https://k6.io/docs/)
- [k6 Best Practices](https://k6.io/docs/test-types/load-test/)
- [Lōns Docs/12-non-functional.md](../Docs/12-non-functional.md)
- [Lōns Docs/07-api-specifications.md](../Docs/07-api-specifications.md)
