# Sprint 7 — Final DE Fix Prompt (BA Comments + PM Findings)

**Priority: CRITICAL — These are the last 3 items blocking staging accessibility**
**Owner: Deployment Engineer**
**Date: 2026-03-31**

DE-09 is the ONLY Sprint 7 task still at "To Do". Emmanuel (project owner) has personally tried to access `platform.staging.lons.io` and it does not resolve. The Grafana dashboard at `grafana.staging.lons.io` also does not resolve. All code, Dockerfiles, Helm templates, CI/CD workflows, and staging values are verified correct — these are purely infrastructure provisioning gaps.

---

## Fix 1: Add Route53 DNS Record for platform.staging.lons.io

**Source:** BA Review on DE-09
**File:** `infrastructure/terraform/modules/dns/main.tf`

**Problem:** DNS A records exist for `api.${var.subdomain}` (line 98) and `admin.${var.subdomain}` (lines 113 and 130), but there is NO record for `platform.${var.subdomain}`. The domain `platform.staging.lons.io` does not resolve.

**Fix:** Add a new `aws_route53_record` for `platform.${var.subdomain}` as an ALB alias. Follow the exact same pattern as `admin_alb_alias` (lines 130-143) since staging does not use CloudFront.

Add this block after the `admin_alb_alias` resource (after line 143):

```hcl
# Alias A record for platform.{subdomain} pointing to CloudFront (when CDN is enabled)
resource "aws_route53_record" "platform_cloudfront_alias" {
  count   = var.cloudfront_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "platform.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}

# Alias A record for platform.{subdomain} pointing to ALB (when CDN is not enabled)
# Used for staging and dev environments
resource "aws_route53_record" "platform_alb_alias" {
  count   = var.cloudfront_enabled ? 0 : 1
  zone_id = local.zone_id
  name    = "platform.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}
```

Also add the output in `infrastructure/terraform/modules/dns/outputs.tf`:

```hcl
output "platform_domain_name" {
  description = "The platform portal domain name (platform.{subdomain})"
  value       = "platform.${var.subdomain}"
}
```

**After code change:** Run `terraform plan` to verify, then `terraform apply` to create the DNS record.

**Verification:**
- `dig platform.staging.lons.io` returns an A record pointing to the ALB
- `curl -s -o /dev/null -w "%{http_code}" https://platform.staging.lons.io` returns a response (200 or 308)

---

## Fix 2: Add ECR Repository for platform-portal

**Source:** BA Review on DE-09
**File:** `infrastructure/scripts/create-ecr-repos.sh`

**Problem:** The SERVICES array (lines 33-40) lists 6 services but does NOT include `platform-portal`:
```bash
SERVICES=(
  "graphql-server"
  "rest-server"
  "scheduler"
  "notification-worker"
  "admin-portal"
  "scoring-service"
)
```

Without the ECR repository `lons-platform-portal`, the CI/CD pipeline cannot push the platform-portal Docker image, and Helm cannot pull it.

**Fix:** Add `"platform-portal"` to the SERVICES array:

```bash
SERVICES=(
  "graphql-server"
  "rest-server"
  "scheduler"
  "notification-worker"
  "admin-portal"
  "platform-portal"
  "scoring-service"
)
```

**After code change:** Re-run the script: `./infrastructure/scripts/create-ecr-repos.sh --region eu-west-1`

**Verification:**
- `aws ecr describe-repositories --repository-names lons-platform-portal --region eu-west-1` returns successfully
- Repository has scan-on-push enabled and lifecycle policy applied

---

## Fix 3: Add Route53 DNS Record for grafana.staging.lons.io

**Source:** PM Finding (not in BA comments — identified during cross-check)
**File:** `infrastructure/terraform/modules/dns/main.tf`

**Problem:** DE-10 (Grafana ingress) was marked Done because the Helm ingress template (`templates/monitoring/grafana-ingress.yaml`) and staging values (`monitoring.grafana.ingress.host: grafana.staging.lons.io`) are both correct. However, there is NO Route53 DNS record for `grafana.${var.subdomain}` in the Terraform DNS module. The domain `grafana.staging.lons.io` does not resolve — same gap as Fix 1.

**Fix:** Add a Route53 record for `grafana.${var.subdomain}`. Since Grafana is always served via ALB (never CloudFront), this only needs the ALB alias variant:

```hcl
# Alias A record for grafana.{subdomain} pointing to ALB
# Grafana monitoring dashboard — always via ALB, never CDN
resource "aws_route53_record" "grafana_alb_alias" {
  count   = var.grafana_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "grafana.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}
```

Add the variable to `infrastructure/terraform/modules/dns/variables.tf`:

```hcl
variable "grafana_enabled" {
  description = "Whether to create DNS record for Grafana dashboard"
  type        = bool
  default     = false
}
```

Pass `grafana_enabled = true` from the staging environment's Terraform configuration.

Also add the output in `infrastructure/terraform/modules/dns/outputs.tf`:

```hcl
output "grafana_domain_name" {
  description = "The Grafana dashboard domain name (grafana.{subdomain})"
  value       = var.grafana_enabled ? "grafana.${var.subdomain}" : ""
}
```

**After code change:** Run `terraform plan` to verify, then `terraform apply` to create the DNS record.

**Verification:**
- `dig grafana.staging.lons.io` returns an A record pointing to the ALB
- `curl -s -o /dev/null -w "%{http_code}" https://grafana.staging.lons.io` returns 200
- Log in with credentials: admin / LonsStaging2026!

---

## Post-Fix: Full Deployment Verification Checklist

After all 3 fixes are applied and `terraform apply` + ECR script have been run:

1. **Trigger CI/CD pipeline** — Push to main or manually dispatch deploy workflow for staging
2. **Verify platform-portal image** — `aws ecr list-images --repository-name lons-platform-portal --region eu-west-1` shows at least one image
3. **Verify Helm deployment** — `kubectl get pods -n lons-staging | grep platform-portal` shows running pod(s)
4. **Verify DNS resolution:**
   - `dig platform.staging.lons.io` → ALB IP
   - `dig grafana.staging.lons.io` → ALB IP
5. **Verify HTTPS access:**
   - `https://platform.staging.lons.io/login` loads Platform Portal login (email + password only, NO organization field)
   - `https://grafana.staging.lons.io` loads Grafana login
6. **Verify Platform Portal login:**
   - Credentials: admin@lons.io / AdminPass123!@#
   - Should redirect to /dashboard with cross-tenant metrics
7. **Verify Grafana login:**
   - Credentials: admin / LonsStaging2026!
   - All 3 dashboards visible: Platform Overview, Per-Tenant Metrics, Integration Health

---

## Summary

| # | Fix | File | Owner | Urgency |
|---|-----|------|-------|---------|
| 1 | Route53 DNS for platform.staging.lons.io | `modules/dns/main.tf` | DE | CRITICAL |
| 2 | ECR repository for platform-portal | `scripts/create-ecr-repos.sh` | DE | CRITICAL |
| 3 | Route53 DNS for grafana.staging.lons.io | `modules/dns/main.tf` | DE | HIGH |

No Claude Code (DEV) fixes needed this round. All application code, Dockerfiles, Helm templates, CI/CD workflows, and staging values are verified correct.
