# Lōns Load Testing Quick Reference

Complete guide to running load tests for the Lōns fintech platform.

## Installation (First Time Only)

```bash
# macOS
brew install k6

# Ubuntu/Debian
curl https://dl.k6.io/release/keyring.gpg | sudo apt-key add -
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows
choco install k6
```

## Common Commands

### Smoke Test (2 minutes)
Quick sanity check of basic endpoints.

```bash
k6 run scripts/load-test.js
```

### Full SLA Validation (14 minutes)
Production-like load test validating all SLAs. Run before deployments.

```bash
k6 run scripts/load-tests/sla-validation.js -e ENVIRONMENT=dev
```

### Loan Application Flow (10 minutes)
Tests request → disbursement pipeline with product-specific SLAs.

```bash
k6 run scripts/load-tests/loan-application.js -e ENVIRONMENT=dev
```

### Repayment Throughput (5 minutes)
Sustained 500 txn/min repayment processing test.

```bash
k6 run scripts/load-tests/repayment-processing.js -e ENVIRONMENT=dev
```

### GraphQL Query Performance (8 minutes)
Read query performance: P95 <200ms, P99 <500ms.

```bash
k6 run scripts/load-tests/graphql-queries.js -e ENVIRONMENT=dev
```

### Tenant Isolation (2 minutes)
Zero-tolerance multi-tenant data segregation test.

```bash
k6 run scripts/load-tests/tenant-isolation.js \
  -e ENVIRONMENT=dev \
  -e TENANT_A_ID=tenant-a-uuid \
  -e TENANT_A_EMAIL=admin-a@example.com \
  -e TENANT_A_PASSWORD=password-a \
  -e TENANT_B_ID=tenant-b-uuid \
  -e TENANT_B_EMAIL=admin-b@example.com \
  -e TENANT_B_PASSWORD=password-b
```

## Environment Variables

| Variable | Values | Default |
|----------|--------|---------|
| ENVIRONMENT | dev, staging, preprod, prod | dev |
| PROFILE | smoke, load, stress, soak, spike | load |

**Example:**
```bash
k6 run scripts/load-tests/sla-validation.js \
  -e ENVIRONMENT=staging \
  -e PROFILE=stress
```

## Test Durations

| Test | Duration | Peak VUs |
|------|----------|----------|
| smoke | 2 min | 50 |
| loan-application | 10 min | 200 |
| repayment-processing | 5 min | 100 |
| graphql-queries | 8 min | 1000 |
| tenant-isolation | 2 min | 50 |
| sla-validation | 14 min | 5000 |

**Total Combined:** 41 minutes

## SLA Thresholds (from Docs/12-non-functional.md)

| Metric | P95 | P99 |
|--------|-----|-----|
| Overdraft Application | 5s | — |
| Micro-Loan Application | 5s | — |
| BNPL Application | 8s | — |
| Factoring Application | 10s | — |
| GraphQL Queries | 200ms | 500ms |
| Scoring Service | 3s | — |
| Repayment Processing | 2s | — |
| Error Rate | <0.1% | — |
| Concurrent Users | 5000 | — |

## Pre-Deployment Checklist

Before deploying to production, run in this order:

```bash
# 1. Quick smoke (2 min)
k6 run scripts/load-test.js -e ENVIRONMENT=dev

# 2. Full suite (14 min) on staging/preprod
k6 run scripts/load-tests/sla-validation.js -e ENVIRONMENT=preprod

# 3. Verify tenant isolation (2 min) - ZERO TOLERANCE
k6 run scripts/load-tests/tenant-isolation.js -e ENVIRONMENT=preprod \
  -e TENANT_A_ID=... -e TENANT_A_EMAIL=... -e TENANT_A_PASSWORD=... \
  -e TENANT_B_ID=... -e TENANT_B_EMAIL=... -e TENANT_B_PASSWORD=...
```

**Total:** ~18 minutes
**Success:** All tests pass with exit code 0

## Understanding Results

### Success Example
```
     data_received..: 1.2 MB
     data_sent......: 456 kB
     http_req_duration..: avg=142ms, p(95)=189ms, p(99)=245ms
     http_req_failed: 0.08%
     ✓ overdraft_p95: 4823ms < 5000ms
     ✓ graphql_p95: 156ms < 200ms
     ✓ repayment_p95: 1845ms < 2000ms
     ✓ overall_error_rate: 0.08% < 0.1%

Exit Code: 0 (SUCCESS)
```

### Failure Example
```
     ✗ bnpl_p95: 8456ms < 8000ms ← EXCEEDS SLA by 456ms
     ✗ overall_error_rate: 0.15% < 0.1% ← ERROR RATE HIGH

Exit Code: 1 (FAILURE) - DO NOT DEPLOY
```

## Troubleshooting

### High Response Times?
1. Check database indexes: `scripts/setup-test-env.sh`
2. Monitor slow queries in PostgreSQL
3. Verify Redis caching is working
4. Check third-party API latency (wallet, scoring)

### High Error Rate?
1. Check application logs: `docker logs graphql-server`
2. Verify database connections: `SELECT count(*) FROM pg_stat_activity`
3. Check rate limiting config
4. Review recent code changes

### Cross-Tenant Data Leak?
1. CRITICAL: Do not deploy
2. Verify RLS policies: `\d+ table_name` in psql
3. Check tenant context in session vars
4. Audit recent SQL changes
5. Run `scripts/setup-test-env.sh` to reset

## Output Formats

### Default (stdout)
```bash
k6 run script.js
```

### JSON (for analysis tools)
```bash
k6 run script.js --out json=results.json
```

### CSV (for spreadsheets)
```bash
k6 run script.js --out csv=results.csv
```

### InfluxDB (for dashboards)
```bash
k6 run script.js \
  --out influxdb=http://localhost:8086/k6
```

## Test Data

Tests generate realistic data:
- **Customers:** Ghana (+233), Kenya (+254), Nigeria (+234) phone formats
- **Loans:** 40% overdraft, 30% micro-loan, 20% BNPL, 10% factoring
- **Amounts:** Realistic ranges per product type
- **Repayments:** Full, partial, early settlement, penalty scenarios

## Continuous Testing

### GitHub Actions Workflow

Manual dispatch from GitHub UI:
1. Go to **Actions** → **Load Test Suite**
2. Click **Run workflow**
3. Select environment and test type
4. Monitor in GitHub Actions
5. Download results artifact

### Nightly Automation (Optional)

Add to `.github/workflows/nightly-load-test.yml`:

```yaml
name: Nightly SLA Check
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

## Key Files

| File | Purpose |
|------|---------|
| `scripts/load-test.js` | Quick smoke test |
| `scripts/load-tests/config.js` | Shared configuration |
| `scripts/load-tests/loan-application.js` | Full app flow |
| `scripts/load-tests/repayment-processing.js` | Throughput test |
| `scripts/load-tests/graphql-queries.js` | Read performance |
| `scripts/load-tests/tenant-isolation.js` | Multi-tenant check |
| `scripts/load-tests/sla-validation.js` | Full SLA suite |
| `scripts/load-tests/helpers/auth.js` | JWT token mgmt |
| `scripts/load-tests/helpers/data-generators.js` | Test data factories |
| `scripts/load-tests/README.md` | Detailed documentation |
| `scripts/load-tests/SLA-MAPPING.md` | SLA mapping & strategy |
| `.github/workflows/load-test.yml` | GitHub Actions CI/CD |

## Documentation

For detailed information:
- **README.md** - Complete reference guide, all scenarios, best practices
- **SLA-MAPPING.md** - SLA requirements, test mapping, failure analysis
- **Docs/12-non-functional.md** - Original non-functional requirements

## Support

For questions or issues:
1. Check README.md troubleshooting section
2. Review recent code changes with `git log`
3. Profile database with slow query logs
4. Check third-party API status pages
5. Run `scripts/setup-test-env.sh` to verify test environment

## Next Steps

1. **Install k6** if not already installed
2. **Run smoke test** to verify setup
3. **Check baseline** on your environment
4. **Set up nightly runs** for continuous monitoring
5. **Document results** for trend analysis

Good luck!
