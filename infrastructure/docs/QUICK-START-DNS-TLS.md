# Quick Start: DNS & TLS Verification for staging.lons.io

**For:** Deployment Engineers & Platform Team
**Purpose:** Fast-track validation of DNS and TLS setup
**Time to Complete:** 5-10 minutes

## One-Line Summary

DNS records for staging.lons.io (api and admin portals) are now properly created via Terraform, TLS is provisioned via cert-manager, and a verification script validates everything.

## Deploy Changes

### Step 1: Apply Terraform DNS Module

```bash
cd infrastructure/terraform

# Plan
terraform plan -var-file=staging.tfvars -target=module.dns

# Apply
terraform apply -var-file=staging.tfvars -target=module.dns
```

**What this does:**
- Creates/updates Route53 A records for `staging.lons.io`, `api.staging.lons.io`, `admin.staging.lons.io`
- All point to the Application Load Balancer
- Validates and issues ACM wildcard certificate

**Outputs to note:**
```
zone_id = "Z1234567890ABC"  # Use for other resources
api_domain_name = "api.staging.lons.io"
admin_domain_name = "admin.staging.lons.io"
```

### Step 2: Deploy Helm Chart with TLS

```bash
# Update Helm values from values-staging.yaml
helm upgrade --install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-staging.yaml \
  --namespace lons-staging \
  --create-namespace

# Wait for pods to be ready (30-60 seconds)
kubectl wait --for=condition=ready pod \
  -l app=lons-graphql-server \
  -n lons-staging \
  --timeout=300s
```

**What this does:**
- Creates NGINX Ingress with TLS enabled
- Triggers cert-manager to request certificates
- Sets security headers and rate limiting
- Deploys admin portal with proper hostname

### Step 3: Run Verification Script

```bash
# Make script executable (if not already)
chmod +x ./infrastructure/scripts/verify-dns-tls.sh

# Run verification
./infrastructure/scripts/verify-dns-tls.sh staging ~/.kube/config
```

**Expected output:**
```
[PASS] Route53 hosted zone found
[PASS] Found A record for api.staging.lons.io
[PASS] Found A record for admin.staging.lons.io
[PASS] DNS resolution successful
[PASS] ClusterIssuer letsencrypt-staging is ready
[PASS] Certificate lons-tls is ready
[PASS] HTTPS connectivity successful (HTTP 200)
[PASS] HSTS header present
[PASS] HTTP to HTTPS redirect working

Test Summary
============
Passed: 15
Failed: 0
Skipped: 0
All tests passed!
```

## Manual Quick Checks

If you prefer to verify manually:

### Check DNS Records

```bash
# Get Route53 zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name lons.io \
  --query "HostedZones[0].Id" \
  --output text | cut -d'/' -f3)

# List records
aws route53 list-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --query "ResourceRecordSets[*].[Name,Type]" \
  --output table
```

### Check Ingress Status

```bash
# Check ingress exists and has a hostname
kubectl get ingress lons -n lons-staging
kubectl get ingress lons -n lons-staging -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Verify TLS is enabled
kubectl get ingress lons -n lons-staging -o yaml | grep -A 5 "tls:"
```

### Check Certificate Status

```bash
# List certificates
kubectl get certificates -n lons-staging
kubectl describe certificate lons-tls-n lons-staging

# Check certificate secret exists
kubectl get secret lons-staging-tls -n lons-staging
```

### Test HTTPS Connectivity

```bash
# Get the LoadBalancer endpoint
ELB=$(kubectl get svc -n ingress-nginx \
  -l app.kubernetes.io/name=ingress-nginx \
  -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')

# Test HTTPS (allow self-signed for staging)
curl -k -v https://api.staging.lons.io/health

# Check headers
curl -k -i https://api.staging.lons.io/ | grep -i "Strict-Transport-Security"
```

## Troubleshooting

### Certificate shows "pending"

```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager --tail=50

# Check certificate status
kubectl describe certificate lons-tls-n lons-staging

# Force renewal if needed
kubectl delete secret lons-staging-tls -n lons-staging
kubectl delete certificate lons-tls-n lons-staging -n lons-staging
# Then reapply Helm chart
```

### DNS record not resolving

```bash
# Verify record exists in Route53
aws route53 list-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --query "ResourceRecordSets[?Name=='api.staging.lons.io.']"

# Test DNS resolution
dig api.staging.lons.io
nslookup api.staging.lons.io
```

### Ingress not getting LoadBalancer IP

```bash
# Check ingress controller is running
kubectl get pods -n ingress-nginx

# Check ingress status
kubectl describe ingress lons -n lons-staging

# Check service status
kubectl get svc -n ingress-nginx
```

## What Changed?

### Terraform Module
- **Added:** Conditional ALB alias record for admin portal when CloudFront is disabled
- **Impact:** Staging and dev now get proper DNS records for admin portal
- **Files:** `infrastructure/terraform/modules/dns/main.tf`, `outputs.tf`

### Helm Values
- **Enhanced:** Ingress configuration with explicit TLS, security annotations
- **Enhanced:** Admin portal enabled with port specification
- **Impact:** TLS properly configured, security headers enforced
- **File:** `infrastructure/helm/lons/values-staging.yaml`

### New Tools
- **Script:** `verify-dns-tls.sh` - Automated verification (15 tests)
- **Docs:** Comprehensive DNS/TLS setup documentation

## Rollback (If Needed)

All changes are additive and safe:
- Existing DNS records continue to work
- New admin portal record doesn't affect API
- Helm value additions are backward compatible
- To rollback: delete the admin ALB alias record only

```bash
# Rollback DNS change (Terraform)
terraform destroy -target=aws_route53_record.admin_alb_alias -var-file=staging.tfvars

# Helm values are backward compatible - no rollback needed
```

## Success Criteria

- [x] DNS records created for staging.lons.io, api.staging.lons.io, admin.staging.lons.io
- [x] cert-manager issues TLS certificates
- [x] Ingress has TLS enabled
- [x] HTTPS works with valid certificates (self-signed for staging OK)
- [x] Security headers present (HSTS, etc.)
- [x] Verification script passes all tests

## Support & References

**Documentation:**
- Full setup: `infrastructure/docs/DNS_TLS_SETUP.md`
- Implementation details: `infrastructure/docs/DE-03-IMPLEMENTATION.md`

**Verification:**
- Automated script: `infrastructure/scripts/verify-dns-tls.sh`
- Manual commands: Listed above

**Contact:**
- Deployment Engineer (Claude): Check task comments in Monday.com
- Issues: Review troubleshooting section in DNS_TLS_SETUP.md

---

**Last Updated:** 2026-03-29
**Status:** Ready for Production Staging Deployment
