# DNS & TLS Setup for Lōns Platform (DE-03)

## Overview

This document describes the DNS and TLS certificate configuration for the Lōns fintech platform across all environments (dev, staging, preprod, prod).

## Architecture

### Domain Structure

All environments use subdomains under the root domain `lons.io`:

| Environment | Subdomain | API Domain | Admin Portal Domain |
|---|---|---|---|
| Development | `dev.lons.io` | `api.dev.lons.io` | `admin.dev.lons.io` |
| Staging | `staging.lons.io` | `api.staging.lons.io` | `admin.staging.lons.io` |
| Preprod | `preprod.lons.io` | `api.preprod.lons.io` | `admin.preprod.lons.io` |
| Production | `lons.io` | `api.lons.io` | `admin.lons.io` |

### DNS Management

DNS records are managed via **AWS Route53** in the `infrastructure/terraform/modules/dns/` module.

**Key features:**
- **Route53 Hosted Zone**: Created only in production (prod), referenced via data source in other environments
- **A Records**: Alias records point each domain to the Application Load Balancer (ALB)
  - `{subdomain}` → ALB
  - `api.{subdomain}` → ALB
  - `admin.{subdomain}` → ALB (non-CloudFront envs) or CloudFront (prod/preprod)
- **ACM Certificates**: Wildcard certificates `*.lons.io` and root `lons.io` created in ACM for AWS services (ALB, CloudFront)

### TLS Certificates

TLS certificates are provisioned and managed using **cert-manager** in Kubernetes.

#### Staging Environment

- **ClusterIssuer**: `letsencrypt-staging`
  - Uses Let's Encrypt staging environment (for testing, self-signed warning is normal)
  - HTTP-01 validation via NGINX Ingress
  - Endpoint: `https://acme-staging-v02.api.letsencrypt.org/directory`

- **Certificate Resource**: Issued for:
  - `api.staging.lons.io`
  - `admin.staging.lons.io`
  - Configured via `cert-manager.issuer` annotation in Helm values
  - Secret name: `lons-staging-tls`

#### Production Environment

- **ClusterIssuer**: `letsencrypt-prod`
  - Uses Let's Encrypt production environment
  - HTTP-01 validation via NGINX Ingress
  - DNS-01 validation via Route53 (optional, for wildcard renewal)
  - Endpoint: `https://acme-v02.api.letsencrypt.org/directory`

- **Certificate Resource**: Issued for:
  - `api.lons.io`
  - `admin.lons.io`
  - Secret name: `lons-production-tls`

### Ingress Configuration

The NGINX Ingress controller is configured with:

**Security Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Traffic Control:**
- SSL redirect enforced (HTTP → HTTPS)
- Rate limiting: 100-500 requests/min (environment-dependent)
- Proxy body size: 10MB max
- Force SSL redirect: enabled

## File Locations

### Terraform Modules

```
infrastructure/terraform/
├── main.tf                          # DNS module instantiation
├── locals.tf                        # Domain mapping by environment
├── modules/dns/
│   ├── main.tf                      # Route53 zone, records, ACM certs
│   ├── variables.tf                 # Input variables (subdomain, ALB, etc.)
│   └── outputs.tf                   # Zone ID, cert ARN, domain names
└── variables.tf                     # Root variables (domain_name, etc.)
```

### Helm Charts

```
infrastructure/helm/lons/
├── values.yaml                      # Base values (ingress, TLS defaults)
├── values-staging.yaml              # Staging overrides
├── values-production.yaml           # Production overrides
└── templates/
    ├── ingress.yaml                 # Ingress resource with TLS
    └── cert-manager/
        ├── cluster-issuer-staging.yaml    # Staging ClusterIssuer
        ├── cluster-issuer-prod.yaml       # Prod ClusterIssuer
        └── certificate.yaml               # Certificate resource
```

### Verification Tools

```
infrastructure/scripts/
└── verify-dns-tls.sh               # Comprehensive DNS & TLS verification script
```

## Deployment Workflow

### 1. Terraform: Provision DNS & ACM

```bash
cd infrastructure/terraform
terraform init
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

**Outputs:**
- `zone_id`: Route53 hosted zone ID
- `certificate_arn`: ACM certificate ARN (for ALB/CloudFront)
- `api_domain_name`: `api.staging.lons.io`
- `admin_domain_name`: `admin.staging.lons.io`

### 2. Kubernetes: Deploy cert-manager & Ingress

```bash
# Install cert-manager (if not already installed)
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# Deploy Lōns Helm chart with TLS
helm upgrade --install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-staging.yaml \
  --namespace lons-staging \
  --create-namespace
```

**What happens:**
1. cert-manager creates the ClusterIssuer (letsencrypt-staging)
2. cert-manager watches the Ingress and creates Certificate resources
3. Let's Encrypt issues certificates via HTTP-01 challenge
4. Certificates are stored in Secret: `lons-staging-tls`
5. NGINX Ingress uses the certificate for HTTPS

### 3. Verify Setup

```bash
# Run verification script
./infrastructure/scripts/verify-dns-tls.sh staging ~/.kube/config
```

**Script checks:**
- Route53 hosted zone exists
- DNS records resolve correctly
- cert-manager ClusterIssuers are ready
- Certificates are issued and valid
- HTTPS connectivity works
- Security headers are present
- HSTS is configured

## Manual Verification Commands

### Check DNS Records in Route53

```bash
aws route53 list-resource-record-sets \
  --hosted-zone-id Z123ABC456DEF \
  --query "ResourceRecordSets[*].[Name,Type,ResourceRecords]" \
  --output table
```

### Test DNS Resolution

```bash
dig api.staging.lons.io
dig admin.staging.lons.io
```

### Check cert-manager Status

```bash
kubectl get clusterissuer
kubectl get clusterissuer letsencrypt-staging -o yaml
kubectl get certificates -A
kubectl describe certificate lons-tls-n lons-staging
```

### Verify Certificate Content

```bash
openssl s_client -connect api.staging.lons.io:443 -servername api.staging.lons.io
```

### Check Ingress TLS Configuration

```bash
kubectl get ingress lons -o yaml
kubectl describe ingress lons
```

### Test HTTPS with curl

```bash
# Allow self-signed for staging
curl -k https://api.staging.lons.io/health
curl -k -i https://api.staging.lons.io/health  # Show headers

# Production (no -k flag)
curl https://api.lons.io/health
```

### Check Security Headers

```bash
curl -i https://api.staging.lons.io/ | grep -i "Strict-Transport-Security\|X-Content-Type-Options\|X-Frame-Options"
```

## Troubleshooting

### Issue: Certificate Not Issued

**Symptoms:**
- Ingress TLS section shows `<pending>`
- Certificate shows `status: False`

**Root causes:**
- HTTP-01 challenge failing (check NGINX Ingress can be reached)
- DNS not resolving (check Route53 records)
- Let's Encrypt rate limiting (wait 24 hours)

**Resolution:**
```bash
# Check certificate status
kubectl describe certificate lons-tls
kubectl logs -n cert-manager -l app=cert-manager

# Force renewal
kubectl delete secret lons-staging-tls
kubectl delete certificate lons-tls-n
# Recreate by reapplying Helm chart
```

### Issue: DNS Record Not Found

**Symptoms:**
- `dig api.staging.lons.io` returns no answer

**Root causes:**
- Route53 record not created by Terraform
- Subdomain variable misconfigured
- Zone ID incorrect

**Resolution:**
```bash
# Verify Route53 records
aws route53 list-resource-record-sets \
  --hosted-zone-id <ZONE_ID> \
  --query "ResourceRecordSets[?Name=='api.staging.lons.io.']"

# Check Terraform output
terraform output zone_id
terraform output api_domain_name
terraform output admin_domain_name

# Reapply Terraform DNS module
terraform apply -target=module.dns
```

### Issue: HTTPS Connection Refused

**Symptoms:**
- `curl: (35) SSL_ERROR_HANDSHAKE_FAILURE`
- `Connection reset by peer`

**Root causes:**
- Ingress not ready or misconfigured
- Certificate secret missing from Ingress
- NGINX Ingress not deployed

**Resolution:**
```bash
# Check Ingress status
kubectl get ingress lons
kubectl describe ingress lons

# Check certificate secret exists
kubectl get secret lons-staging-tls

# Check NGINX Ingress is deployed
kubectl get pods -n ingress-nginx
kubectl get ingressclass nginx
```

## Security Considerations

### HSTS (Strict-Transport-Security)

The platform uses HSTS with preload:
- Max-age: 31536000 seconds (1 year)
- Include subdomains: Yes
- Preload: Yes (domain listed on HSTS preload list)

**Important:** Once HSTS is enabled and preload is submitted, reverting requires careful planning.

### Certificate Validation

- **Staging**: Let's Encrypt staging certs (self-signed, for testing only)
- **Production**: Let's Encrypt production certs (publicly trusted)

For staging, browsers will show security warnings. This is expected.

### Let's Encrypt Rate Limits

- **Duplicate certificates**: 5 per week (identical domain set)
- **Renewal window**: 30 days before expiration
- **Wildcard certificates**: Counted separately

If rate-limited, use the staging environment and wait 24 hours.

## Renewal & Rotation

cert-manager automatically renews certificates 30 days before expiration.

**To monitor renewal:**
```bash
kubectl get certificates -A -w
kubectl logs -n cert-manager -f -l app=cert-manager | grep renewal
```

**Manual renewal (if needed):**
```bash
kubectl annotate certificate lons-tls -n lons-staging \
  cert-manager.io/issue-temporary-certificate=true \
  --overwrite
```

## References

- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [AWS Route53 Documentation](https://docs.aws.amazon.com/route53/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [HSTS Preload List](https://hstspreload.org/)

---

**Last Updated:** 2026-03-29
**Maintained By:** Deployment Engineer (DE)
