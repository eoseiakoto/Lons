# Staging Environment Deployment Scripts

This document describes the deployment automation scripts for the Lōns staging environment on AWS EKS.

## Overview

The staging deployment consists of two main scripts:

1. **setup-staging.sh** — Complete staging environment provisioning
2. **verify-staging.sh** — Post-deployment verification and health checks

Together, they implement the DE-01 task: Deploy Staging EKS Namespace.

## Files

| Script | Size | Lines | Purpose |
|--------|------|-------|---------|
| `setup-staging.sh` | 24 KB | 625 | Full infrastructure provisioning and operator installation |
| `verify-staging.sh` | 24 KB | 588 | Comprehensive health checks and verification |
| `STAGING_DEPLOYMENT.md` | — | — | This documentation |

## Prerequisites

### System Requirements

- macOS, Linux, or WSL2
- Bash 4.0+
- 2GB free disk space for Terraform cache

### Required CLI Tools

| Tool | Version | Purpose |
|------|---------|---------|
| `aws` | v2.13+ | AWS API and EKS management |
| `terraform` | 1.3+ | Infrastructure-as-Code provisioning |
| `kubectl` | 1.28+ | Kubernetes cluster management |
| `helm` | 3.12+ | Kubernetes package manager |
| `jq` | 1.6+ | JSON parsing and formatting |

Install missing tools:

```bash
# macOS (with Homebrew)
brew install awscli terraform kubectl helm jq

# Ubuntu/Debian
apt-get install -y awscli terraform kubectl helm jq

# Verify installations
aws --version
terraform version
kubectl version --client --short
helm version --short
jq --version
```

### AWS Configuration

```bash
# Configure AWS credentials (interactive)
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_DEFAULT_REGION="eu-west-1"

# Verify credentials
aws sts get-caller-identity
```

### Pre-Setup Checklist

Before running setup-staging.sh, ensure:

- [ ] AWS credentials configured and tested
- [ ] AWS account has EKS, RDS, ElastiCache, and ALB permissions
- [ ] Terraform state S3 bucket exists (or will be created)
- [ ] Route53 hosted zone exists for `lons.io` domain
- [ ] VPC CIDR does not conflict with existing networks
- [ ] SSL certificate available or can be issued by cert-manager

## Quick Start

### 1. Initial Setup (Full Deployment)

```bash
cd infrastructure/scripts

# Full setup with all infrastructure and operators
./setup-staging.sh
```

Expected time: 15-25 minutes

### 2. Verify Deployment

```bash
# Comprehensive health check
./verify-staging.sh
```

Expected time: 2-3 minutes

### 3. Monitor Progress

```bash
# Watch deployment rollout
kubectl get pods -n lons-staging -w
kubectl get pods -A  # All namespaces

# Check operator status
kubectl get deployments -n external-secrets
kubectl get deployments -n cert-manager
kubectl get deployments -n ingress-nginx
kubectl get deployments -n monitoring
```

## Setup Script Details

### Command-Line Options

```bash
./setup-staging.sh [OPTIONS]
```

| Option | Effect | Default |
|--------|--------|---------|
| `--dry-run` | Run terraform plan only (no infrastructure changes) | Apply infrastructure |
| `--skip-operators` | Skip Helm operator installations | Install operators |
| `--skip-namespace` | Assume namespace exists (skip creation) | Create namespace |
| `--debug` | Enable verbose debug output | Info level logging |
| `-h, --help` | Show usage information | — |

### Examples

```bash
# Dry-run: Plan only, no changes
./setup-staging.sh --dry-run

# Skip operator installation if already done
./setup-staging.sh --skip-operators

# Debug mode with verbose output
./setup-staging.sh --debug

# Combined: Dry-run + skip existing operators
./setup-staging.sh --dry-run --skip-operators
```

### Execution Flow

```
1. Parse Arguments
   └─ Validate command-line flags

2. Check Prerequisites
   ├─ Verify CLI tools (aws, terraform, kubectl, helm, jq)
   ├─ Test AWS credentials
   ├─ Verify Terraform configuration
   └─ Check environment variables file exists

3. Initialize Terraform
   ├─ Configure S3 backend with DynamoDB locking
   ├─ Create or select workspace (staging)
   └─ Run terraform init

4. Plan & Apply Terraform
   ├─ Run terraform plan -var-file=staging.tfvars
   ├─ Review changes
   └─ Run terraform apply (unless --dry-run)

5. Retrieve Infrastructure Outputs
   ├─ VPC ID, subnets
   ├─ EKS cluster endpoint
   ├─ RDS endpoint
   ├─ Redis endpoint
   └─ ALB DNS name

6. Configure Kubernetes Access
   ├─ Update kubeconfig for EKS cluster
   ├─ Verify cluster connectivity
   └─ Test kubectl commands

7. Create Kubernetes Namespace
   ├─ Create lons-staging namespace
   ├─ Apply labels:
   │  ├─ environment=staging
   │  ├─ team=engineering
   │  └─ app.kubernetes.io/part-of=lons
   └─ Verify namespace exists

8. Install Helm Operators
   ├─ Add Helm repositories
   ├─ Update Helm cache
   └─ Install 4 operators:
      ├─ External Secrets Operator (v0.9.9)
      ├─ cert-manager (v1.13.3)
      ├─ NGINX Ingress Controller (v4.8.3)
      └─ kube-prometheus-stack (v55.8.2)

9. Verify Operators
   ├─ Check each operator namespace
   ├─ Verify Helm releases
   ├─ Check deployment readiness
   └─ Display status summary

10. Print Summary
    ├─ Show infrastructure details
    ├─ List operators installed
    └─ Display next steps
```

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Deployment complete |
| 1 | Prerequisites failed | Install missing tools |
| 2 | Terraform init failed | Check Terraform/AWS config |
| 3 | Terraform plan/apply failed | Review terraform output |
| 4 | kubeconfig update failed | Check AWS/EKS access |
| 5 | Namespace creation failed | Check cluster/RBAC |
| 6 | Operator installation failed | Check Helm/internet access |

## Verify Script Details

### Command-Line Options

```bash
./verify-staging.sh [OPTIONS]
```

| Option | Effect |
|--------|--------|
| `--verbose` | Print detailed output for each check |
| `--check-endpoints` | Attempt service endpoint connectivity tests |
| `-h, --help` | Show usage information |

### Examples

```bash
# Standard verification
./verify-staging.sh

# Verbose output for debugging
./verify-staging.sh --verbose

# Check endpoint connectivity (requires network access to services)
./verify-staging.sh --check-endpoints

# Combined
./verify-staging.sh --verbose --check-endpoints
```

### Checks Performed

The script validates 4 categories of infrastructure:

#### 1. Prerequisites (3 checks)
- AWS CLI configured
- kubectl available
- Cluster connectivity

#### 2. AWS Infrastructure (4 checks)
- EKS cluster exists and is ACTIVE
- EKS nodes are ready
- RDS instance exists and is available
- ElastiCache Redis exists and is available
- ALB exists and is active

#### 3. Kubernetes Cluster (5 checks)
- API server accessible
- API health endpoint responding
- Namespace `lons-staging` exists
- Namespace labels correct:
  - `environment=staging`
  - `team=engineering`
  - `app.kubernetes.io/part-of=lons`
- Operators running (4 operators)

#### 4. Terraform State (2 checks)
- Terraform state directory exists
- Outputs accessible
- Workspace matches environment

### Output Format

```
✓ Passed checks    (green)
✗ Failed checks    (red)
⚠ Warning checks   (yellow)
ℹ Info messages    (blue)
```

### Result Summary

The script displays:
- Total checks performed
- Pass/fail/warn counts
- Overall status (HEALTHY or FAILED)
- Actionable next steps

## Infrastructure Details

### Deployed Resources

#### AWS Infrastructure

| Resource | Type | Staging Config |
|----------|------|----------------|
| VPC | Network | 10.0.0.0/16 |
| NAT Gateway | Network | Single (staging only) |
| EKS Cluster | Container | v1.28, 3 nodes (on-demand) |
| RDS PostgreSQL | Database | db.t4g.small, Multi-AZ |
| ElastiCache Redis | Cache | cache.t4g.small, 2 nodes |
| ALB | Load Balancer | With WAF enabled |
| Route53 | DNS | staging.lons.io |

#### Kubernetes Namespaces

| Namespace | Purpose | Operators |
|-----------|---------|-----------|
| `lons-staging` | Application workloads | — |
| `external-secrets` | Secret injection | External Secrets Operator |
| `cert-manager` | SSL/TLS certificates | cert-manager |
| `ingress-nginx` | Ingress routing | NGINX Ingress Controller |
| `monitoring` | Prometheus + Grafana | kube-prometheus-stack |

### Helm Charts Installed

| Chart | Version | Namespace | Purpose |
|-------|---------|-----------|---------|
| `external-secrets/external-secrets` | 0.9.9 | external-secrets | Secure credential injection |
| `jetstack/cert-manager` | v1.13.3 | cert-manager | SSL/TLS certificates |
| `ingress-nginx/ingress-nginx` | 4.8.3 | ingress-nginx | Ingress routing |
| `prometheus-community/kube-prometheus-stack` | 55.8.2 | monitoring | Monitoring and alerting |

## Operational Workflows

### New Staging Deployment

```bash
# 1. Fresh deployment
./setup-staging.sh

# 2. Verify success
./verify-staging.sh

# 3. Check operator status
kubectl get pods -A | grep -E "external-secrets|cert-manager|ingress-nginx|kube-prometheus"
```

### Re-running Setup (Idempotent)

```bash
# Safe to re-run — will detect existing resources
./setup-staging.sh

# Check what changed
./verify-staging.sh
```

### Updating Operators

```bash
# Update specific operator
helm upgrade --install nginx-ingress ingress-nginx/ingress-nginx \
  -n ingress-nginx \
  --version 4.9.0

# Verify update
./verify-staging.sh --verbose
```

### Debugging Issues

```bash
# Verbose output
./setup-staging.sh --debug

# Check specific operator
kubectl get pods -n cert-manager -o wide
kubectl logs -n cert-manager -l app.kubernetes.io/name=cert-manager

# Check Terraform state
cd infrastructure/terraform
terraform plan -var-file=environments/staging.tfvars

# Check cluster access
kubectl cluster-info
kubectl auth can-i list pods --as=system:serviceaccount:default:default
```

## Troubleshooting

### Common Issues

#### "AWS credentials not configured"

```bash
# Fix: Configure AWS credentials
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="eu-west-1"

# Verify
aws sts get-caller-identity
```

#### "Terraform initialization failed"

```bash
# Likely cause: S3 state bucket doesn't exist
# Fix: Create the state bucket manually

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3api create-bucket \
  --bucket lons-terraform-state-${ACCOUNT_ID} \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Or let the script create it (may require S3FullAccess)
```

#### "kubeconfig update failed"

```bash
# Likely cause: EKS cluster not yet created
# Fix: Ensure terraform apply completed

cd infrastructure/terraform
terraform apply -var-file=environments/staging.tfvars

# Check cluster status
aws eks describe-cluster --name lons-eks-staging --region eu-west-1
```

#### "Operator deployment not ready"

```bash
# Operators take 2-5 minutes to initialize
# Re-run verification after waiting

sleep 180  # Wait 3 minutes
./verify-staging.sh --verbose

# Check operator logs
kubectl logs -n external-secrets -l app.kubernetes.io/name=external-secrets
kubectl logs -n cert-manager -l app.kubernetes.io/name=cert-manager
```

#### "Namespace creation failed"

```bash
# Likely cause: RBAC or service account issue
# Fix: Verify cluster and credentials

kubectl auth can-i create namespaces
kubectl get serviceaccounts -n default

# Try manual creation
kubectl create namespace lons-staging --dry-run=client -o yaml | kubectl apply -f -
```

## Security Considerations

### Terraform State

- Stored in S3 with encryption
- DynamoDB locking prevents concurrent modifications
- State contains sensitive data — restrict bucket access

```bash
# Limit bucket access
aws s3api put-bucket-policy \
  --bucket lons-terraform-state-${ACCOUNT_ID} \
  --policy '{...restrictive policy...}'
```

### Kubernetes RBAC

- Each namespace has own service accounts
- Operators run with minimal required permissions
- External Secrets Operator requires AWS IAM role

### Secrets Management

- Use External Secrets Operator for secret injection
- Never commit secrets to git
- Use AWS Secrets Manager for credential storage

## Monitoring

### Key Metrics

```bash
# Cluster health
kubectl get nodes -o wide

# Pod status
kubectl get pods -A

# Resource usage
kubectl top nodes
kubectl top pods -A

# Operator status
helm list -A
kubectl get deployments -A

# Logs
kubectl logs -n lons-staging -l app=<app-name> -f
```

### Grafana Access

```bash
# Port-forward to Grafana (password in Prometheus secret)
kubectl port-forward -n monitoring svc/kube-prometheus-grafana 3000:80

# Open browser
open http://localhost:3000

# Default credentials: admin / prom-operator
```

## Next Steps

After successful deployment:

1. **Deploy Application Services**
   ```bash
   helm install lons-app ./helm/charts/lons-app \
     -n lons-staging \
     -f ./helm/values/staging.yaml
   ```

2. **Configure External Secrets**
   ```bash
   kubectl apply -f ./helm/manifests/external-secrets-config.yaml
   ```

3. **Set Up Ingress Routes**
   ```bash
   kubectl apply -f ./helm/manifests/ingress-staging.yaml
   ```

4. **Verify Application Connectivity**
   ```bash
   kubectl get ingress -n lons-staging
   kubectl describe ingress -n lons-staging
   ```

5. **Monitor Deployment**
   ```bash
   ./verify-staging.sh --verbose
   kubectl logs -n lons-staging -f
   ```

## Support & Documentation

- **Deployment Guide**: See `Docs/13-deployment.md`
- **Infrastructure Design**: See `Docs/12-non-functional.md`
- **Architecture Overview**: See `Docs/00-overview.md`
- **Runbooks**: See `infrastructure/runbooks/`

## Script Development

### Adding New Checks to verify-staging.sh

```bash
check_my_resource() {
  log_section "Checking My Resource"

  if my_check_passes; then
    check_pass "My resource is healthy"
  else
    check_fail "My resource failed"
    return 1
  fi
}

# Add to main()
main() {
  # ... existing checks ...
  check_my_resource
  # ...
}
```

### Adding New Phases to setup-staging.sh

```bash
setup_my_component() {
  log_section "Setting up My Component"

  if ! my_setup; then
    die 7 "My component setup failed"
  fi

  log_info "My component ready"
}

# Add to main()
main() {
  # ... existing phases ...
  setup_my_component
  # ...
}
```

## License & Attribution

These scripts are part of the Lōns fintech platform.
Maintained by the Deployment Engineering team.

---

**Last Updated**: 2026-03-29
**Version**: 1.0
**Status**: Production Ready
