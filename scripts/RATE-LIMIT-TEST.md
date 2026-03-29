# Rate Limiting E2E Verification Script

End-to-end test suite for verifying rate limiting configuration across all layers of the Lōns platform.

## Purpose

Validates that rate limiting is properly configured at three layers:
1. **WAF** (AWS WAF on ALB) — 2000 requests per 5 minutes per IP
2. **Application** (NestJS throttler) — Rate limiting on specific endpoints
3. **GraphQL** (Query complexity/depth limits) — Prevent malicious queries

## Usage

```bash
./scripts/rate-limit-test.sh <base-url>
```

### Example

```bash
# Test staging environment
./scripts/rate-limit-test.sh https://api.staging.lons.io

# Test production
./scripts/rate-limit-test.sh https://api.lons.io

# Test admin portal
./scripts/rate-limit-test.sh https://admin.lons.io
```

## Tests Performed

### Test 1: WAF Rate Limiting
- **Action**: Sends 100 rapid requests to `/v1/health`
- **Expected**: At least 95 succeed (WAF limit is 2000/5min)
- **Pass Criteria**: ≥95 successful responses

### Test 2: Application Rate Limiting
- **Action**: Sends 50 rapid requests to `/v1/health`
- **Expected**: Some requests may be throttled by application
- **Pass Criteria**: Test completes without errors

### Test 3: GraphQL Query Depth
- **Action**: Sends a deeply nested GraphQL introspection query
- **Expected**: Rejected with 400 or 422 status
- **Pass Criteria**: Deep queries are blocked

### Test 4: Security Headers
- **Action**: Checks for presence of critical security headers
- **Expected Headers**:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
- **Pass Criteria**: All three headers present

### Test 5: CDN Cache Headers
- **Action**: Checks for CloudFront cache indicators
- **Expected**: `X-Cache` or `Age` header present
- **Pass Criteria**: CloudFront is active (if CDN enabled)

### Test 6: CORS Headers
- **Action**: Sends request with `Origin` header
- **Expected**: CORS headers in response
- **Pass Criteria**: Cross-origin requests are properly configured

## Output Example

```
=== Lōns Rate Limiting E2E Verification ===
Target: https://api.staging.lons.io

--- Test 1: WAF Rate Limit (burst test) ---
Sending 100 rapid requests...
  Successful: 98 / 100
  Rate limited (429/403): 2 / 100
  ✓ WAF allows normal traffic

--- Test 2: Application Rate Limiting ---
Sending 50 rapid requests to rate-limited endpoint...
  Successful responses: 48 / 50
  Rate limited responses (429): 2 / 50
  ✓ Application rate limiting check complete

--- Test 3: GraphQL Query Depth ---
  ✓ Deep GraphQL queries rejected (400)

--- Test 4: Security Headers Verification ---
  ✓ strict-transport-security present
  ✓ x-content-type-options present
  ✓ x-frame-options present

--- Test 5: CDN Cache Headers ---
  ✓ CloudFront X-Cache header present

--- Test 6: CORS Verification ---
  ✓ CORS headers configured

=== Results ===
Passed: 12
Failed: 0
ALL CHECKS PASSED
```

## Exit Codes

- **0**: All checks passed
- **1**: One or more checks failed

## Requirements

- `curl` (for HTTP requests)
- `grep` (for header parsing)
- Bash 4+

## Deployment Integration

This script should be run as part of the deployment verification pipeline:

```bash
#!/bin/bash
set -e

echo "Running rate limit verification..."
./scripts/rate-limit-test.sh "https://api.${ENVIRONMENT}.lons.io"

if [ $? -eq 0 ]; then
  echo "Rate limiting verification passed!"
else
  echo "Rate limiting verification failed!"
  exit 1
fi
```

## Troubleshooting

### All requests return 429 immediately
- **Cause**: WAF or application throttler may be too strict
- **Fix**: Check WAF rules and application throttler configuration
- **Verify**: Check ALB security group allows your IP

### Tests fail with 000 HTTP code
- **Cause**: Network timeout or connectivity issue
- **Fix**: Verify base URL is correct and reachable
- **Verify**: `curl -I https://your-domain.com` manually

### Security headers missing
- **Cause**: Headers not configured in ALB or application
- **Fix**: Check ALB listener rules and NestJS middleware
- **Verify**: Run with verbose curl: `curl -I -v https://your-domain.com`

### GraphQL test returns 200 (deep query not rejected)
- **Cause**: GraphQL depth/complexity limiting not configured
- **Fix**: Implement GraphQL directive in NestJS resolvers
- **Status**: Not a critical failure, depends on configuration

## Performance Expectations

- Script runtime: 30-60 seconds (depends on network latency)
- Request rate: ~5-10 requests per second
- No payload data (HTTP 200/429/400/422 status only)

## Related Documentation

- Rate limiting rules: `infrastructure/terraform/modules/alb/waf.tf`
- Application throttler: `apps/rest-server/src/middleware/throttler.ts`
- GraphQL configuration: `apps/graphql-server/src/app.module.ts`
- Security headers: `apps/*/src/main.ts`
