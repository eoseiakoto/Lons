# CloudFront CDN & Rate Limiting Deployment Guide

Complete guide for deploying CloudFront CDN infrastructure and verifying rate limiting configuration on Lōns platform.

## Overview

This guide covers:
1. CloudFront distribution deployment for admin portal
2. Route53 DNS alias configuration
3. Rate limiting verification across 3 layers
4. Security considerations and origin verification

## Prerequisites

### Required AWS Resources
- Route53 hosted zone for lons.io (already exists)
- ACM wildcard certificate for *.lons.io **in us-east-1 region** (required for CloudFront)
- ALB with WAF enabled (already deployed)
- VPC with public subnets (already deployed)

### Required Information
- CloudFront ACM certificate ARN (us-east-1)
  ```bash
  # Find existing or create new:
  aws acm list-certificates --region us-east-1
  ```
- ALB DNS name (output from ALB module)
  ```bash
  terraform output alb_dns_name
  ```

## Architecture

```
CloudFront (edge locations worldwide)
  ↓ (HTTPS)
  ├─ Static assets (_next/static/*) → cached 7 days
  ├─ Fonts (*.woff*) → cached 30 days
  └─ Dynamic content → forwarded to ALB
      ↓
      ALB (rate limiting: 2000 req/5min)
      ├─ /graphql → GraphQL server (3000)
      ├─ /v1/* → REST API (3001)
      └─ / → Admin portal (3100) ← CloudFront origin
```

## Deployment Steps

### Step 1: Prepare Variables

Create or update your Terraform variables file:

```hcl
# terraform.tfvars or terraform.prod.tfvars
environment                 = "prod"
cloudfront_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Get the certificate ARN:
```bash
aws acm describe-certificate \
  --certificate-arn <your-cert-arn> \
  --region us-east-1
```

### Step 2: Validate Terraform Plan

```bash
cd infrastructure/terraform

# Generate plan
terraform plan \
  -var="environment=prod" \
  -var="cloudfront_certificate_arn=arn:aws:acm:us-east-1:..." \
  -out=tfplan

# Review changes
terraform show tfplan
```

Expected resources to create:
- aws_cloudfront_distribution (admin_portal)
- aws_route53_record (admin_cloudfront_alias)
- random_password (cdn_origin_secret)

### Step 3: Deploy Infrastructure

```bash
# Apply Terraform changes
terraform apply tfplan

# Capture outputs
terraform output cloudfront_distribution_id
terraform output cloudfront_domain_name
terraform output cloudfront_zone_id
```

CloudFront deployment takes 10-15 minutes to propagate globally.

### Step 4: Verify DNS Propagation

```bash
# Check Route53 records
aws route53 list-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --query 'ResourceRecordSets[?Name==`admin.lons.io.`]'

# Test DNS resolution
dig admin.lons.io
nslookup admin.lons.io

# Expected: CNAME or A record pointing to CloudFront
```

### Step 5: Verify SSL/TLS Certificate

```bash
# Check certificate is properly configured
openssl s_client -connect admin.lons.io:443 -showcerts

# Verify certificate CN or SAN
#   Subject: CN=*.lons.io
#   SubjectAltName: DNS:*.lons.io, DNS:lons.io
```

### Step 6: Test CloudFront Distribution

```bash
# Test HTTPS access
curl -I https://admin.lons.io/

# Check CloudFront headers
curl -I https://admin.lons.io/ | grep -i "x-cache\|age\|cloudfront"

# Expected: x-cache: Hit from cloudfront (after first request)
# or: x-amzn-requestid header indicating CloudFront processing
```

### Step 7: Rate Limiting Verification

Run the comprehensive E2E verification script:

```bash
./scripts/rate-limit-test.sh https://admin.lons.io

# Expected output:
# - All 6 tests pass
# - WAF allows normal traffic (≥95 successful requests)
# - Security headers present
# - CloudFront cache headers present
```

Run against API endpoints too:
```bash
./scripts/rate-limit-test.sh https://api.lons.io
./scripts/rate-limit-test.sh https://api.lons.io/graphql
```

## Post-Deployment Configuration

### Configure ALB Origin Verification (Recommended)

To prevent direct ALB access bypassing CloudFront, configure ALB listener rules:

```hcl
# In infrastructure/terraform/modules/alb/main.tf
# Update admin portal listener rule:

condition {
  http_header {
    http_header_name = "X-Origin-Verify"
    values           = [random_password.cdn_origin_secret.result]
  }
}
```

This forces all admin traffic through CloudFront.

### Monitor CloudFront Metrics

```bash
# View CloudFront distribution status
aws cloudfront get-distribution-config \
  --id E1234567890ABC \
  --query 'Distribution.Status'

# Monitor cache hit rate
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=E1234567890ABC \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

### Set Up CloudWatch Alarms

```bash
# High error rate alarm (>5% 4xx/5xx)
aws cloudwatch put-metric-alarm \
  --alarm-name lons-cloudfront-error-rate \
  --alarm-description "CloudFront error rate > 5%" \
  --namespace AWS/CloudFront \
  --metric-name ErrorRate \
  --dimensions Name=DistributionId,Value=E1234567890ABC \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --period 300
```

## Troubleshooting

### CloudFront Distribution Status: InProgress

**Cause**: Distribution is still propagating to edge locations
**Fix**: Wait 10-15 minutes. Propagation is normal.
**Verify**: 
```bash
aws cloudfront get-distribution \
  --id E1234567890ABC \
  --query 'Distribution.Status'
```

### 403 Access Denied

**Cause 1**: SSL certificate not validated
**Fix**: Verify ACM certificate is in us-east-1 and validated
```bash
aws acm describe-certificate \
  --certificate-arn <arn> \
  --region us-east-1 \
  --query 'Certificate.Status'
```

**Cause 2**: Origin returns 403
**Fix**: Verify ALB is responding to HTTPS requests
```bash
curl -I https://api.lons.io/v1/health
```

### Cache Not Working

**Symptoms**: X-Cache header shows "Miss from cloudfront" every request
**Cause**: Cache TTL may be set to 0 or headers prevent caching
**Fix**: Check CloudFront cache behavior in AWS Console
```bash
# Verify static asset paths are cached
curl -H "Accept-Encoding: gzip" -I https://admin.lons.io/_next/static/test.js
# Should show: x-cache: Hit from cloudfront (after second request)
```

### Rate Limiting Not Working

**Symptoms**: All requests succeed even with >2000 req/5min
**Cause**: WAF may be disabled or misconfigured
**Fix**: Verify ALB WAF is attached
```bash
aws wafv2 list-web-acls \
  --scope REGIONAL \
  --region eu-west-1 \
  --query 'WebACLs[?Name==`lons-alb-waf-prod`]'
```

### Origin Verification Header Missing

**Symptoms**: Direct ALB access possible without CloudFront
**Cause**: Origin verification not yet implemented
**Fix**: Add http_header condition to ALB listener rule (see section above)

## Rate Limiting Layers

### Layer 1: AWS WAF (ALB)
- **Limit**: 2000 requests per 5 minutes per IP
- **Response**: 403 Forbidden
- **Config**: infrastructure/terraform/modules/alb/waf.tf

### Layer 2: Application (NestJS)
- **Limit**: Per-endpoint throttling
- **Response**: 429 Too Many Requests
- **Config**: apps/rest-server/src/middleware/throttler.ts

### Layer 3: GraphQL
- **Limit**: Query complexity/depth limits
- **Response**: 400 Bad Request (validation)
- **Config**: apps/graphql-server/src/app.module.ts

## Monitoring & Alerts

### Key Metrics to Monitor

```bash
# CloudFront cache hit ratio
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=<dist-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average

# ALB request count
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCount \
  --dimensions Name=LoadBalancer,Value=<alb-name> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 300 \
  --statistics Sum

# WAF blocked requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=WebACL,Value=<waf-name> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 300 \
  --statistics Sum
```

## Rollback Plan

If CloudFront needs to be disabled:

```bash
# Update environment variable to dev/staging (not prod)
terraform plan -var="environment=staging"
terraform apply -var="environment=staging"

# Or manually remove:
terraform destroy -target module.cdn
```

This will:
1. Remove CloudFront distribution
2. Remove Route53 alias for admin.lons.io
3. Route53 will need manual update to point to ALB (if needed)

## Cost Optimization Tips

1. **PriceClass_100 vs 200**
   - PriceClass_100: Fewer edge locations, lower cost
   - PriceClass_200: Africa + Europe coverage (recommended for lons)
   - PriceClass_All: All regions (expensive, not needed)

2. **Cache Optimization**
   - Aggressive TTL for static assets (_next/static/*)
   - No caching for dynamic content (HTML, JSON)
   - Compression enabled (gzip)

3. **Monitoring**
   - Cache hit ratio target: >80% for static content
   - Origin error rate: <1%
   - Latency: <100ms p99

## Deployment Checklist

- [ ] CloudFront ACM certificate verified (us-east-1)
- [ ] Route53 hosted zone confirmed (lons.io)
- [ ] ALB deployment complete and healthy
- [ ] WAF enabled on ALB
- [ ] Terraform plan reviewed and approved
- [ ] Terraform apply successful
- [ ] CloudFront distribution reached "Deployed" status
- [ ] DNS propagated (dig/nslookup verification)
- [ ] HTTPS certificate validated (openssl check)
- [ ] CloudFront access test successful
- [ ] Rate limiting verification script passed
- [ ] ALB origin verification configured (optional but recommended)
- [ ] CloudWatch alarms created
- [ ] Monitoring dashboard set up
- [ ] Documentation updated
- [ ] Team notified of deployment

## Next Steps

1. **Enable ALB Origin Verification** (security hardening)
2. **Implement Lambda@Edge** for custom headers
3. **Set up CloudFront logging** to S3
4. **Configure geographic restrictions** if needed
5. **Enable field-level encryption** for sensitive data
6. **Load test** with realistic traffic patterns

## Support & References

- Terraform CDN Module: infrastructure/terraform/modules/cdn/README.md
- Rate Limiting Script: scripts/RATE-LIMIT-TEST.md
- AWS CloudFront: https://docs.aws.amazon.com/cloudfront/
- ALB WAF Rules: infrastructure/terraform/modules/alb/waf.tf
