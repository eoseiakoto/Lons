# Lōns Platform — Operational Inventory

**Document Version:** 1.0
**Last Updated:** March 2026
**Author:** Infrastructure & Operations Team
**Status:** Active

---

## Table of Contents

1. [TLS Certificate Inventory](#tls-certificate-inventory)
2. [Secrets Inventory (Master List)](#secrets-inventory-master-list)
3. [Environment Promotion Playbook](#environment-promotion-playbook)
4. [Rollback Playbook](#rollback-playbook)
5. [Deployment Infrastructure Matrix](#deployment-infrastructure-matrix)
6. [Access Control Matrix](#access-control-matrix)
7. [Rotation & Renewal Schedule](#rotation--renewal-schedule)

---

## TLS Certificate Inventory

### Current Certificates

| Certificate | Type | Domains | Issuer | Valid From | Expiry | Auto-Renewal | Location | Status |
|-------------|------|---------|--------|------------|--------|--------------|----------|--------|
| **ACM Wildcard (Production)** | Wildcard | `*.lons.io`, `lons.io`, `api.lons.io`, `admin.lons.io`, `status.lons.io` | AWS ACM | 2026-03-29 | 2027-03-29 | Yes (automatic, 60 days pre) | ACM console (eu-west-1) | Active ✅ |
| **cert-manager TLS (Production)** | Managed | `api.lons.io`, `admin.lons.io` | Let's Encrypt (prod) | 2026-03-29 | 2026-06-27 | Yes (30 days pre) | K8s secret `lons-tls` (ns: lons-production) | Active ✅ |
| **cert-manager TLS (Staging)** | Managed | `api-staging.lons.io`, `admin-staging.lons.io` | Let's Encrypt (staging) | 2026-03-29 | 2026-06-27 | Yes (30 days pre) | K8s secret `lons-tls-staging` (ns: lons-staging) | Active ✅ |
| **cert-manager TLS (Dev)** | Managed | `api-dev.lons.io`, `admin-dev.lons.io` | Let's Encrypt (staging) | 2026-03-29 | 2026-06-27 | Yes (30 days pre) | K8s secret `lons-tls-dev` (ns: lons-dev) | Active ✅ |
| **Linkerd mTLS (All Envs)** | Internal | Service-to-service | Linkerd CA | Auto-generated | 24 hours | Yes (automatic) | K8s secret in `linkerd` namespace | Active ✅ |
| **GitHub OIDC (All Envs)** | OIDC | `token.actions.githubusercontent.com` | GitHub | Managed by GitHub | Managed | Managed by GitHub | AWS IAM OIDC Provider (arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com) | Active ✅ |

### Certificate Management Notes

**ACM (Recommended for Primary):**
- AWS-managed, no manual renewal needed
- Automatic renewal 60 days before expiry
- DNS validation (CNAME record in Route53)
- Free for AWS resources
- Used for ALB listener (HTTPS)

**cert-manager (Backup/Secondary):**
- Kubernetes-native certificate management
- Uses Let's Encrypt (free, widely trusted)
- Automatic renewal 30 days before expiry
- ACME DNS challenge (creates temporary TXT records)
- Used for Ingress TLS

**Linkerd mTLS (Service Mesh):**
- 24-hour certificate rotation (automatic)
- No action required
- Not exposed externally

### Certificate Renewal Checklist

Every **60 days** or when cert expires within 7 days:

- [ ] Check cert expiry: `kubectl get certificate -n lons-production`
- [ ] Verify cert-manager is running: `kubectl get deploy -n cert-manager`
- [ ] Check ACME order status: `kubectl describe order -n lons-production`
- [ ] Verify DNS records are updated: `nslookup _acme-challenge.api.lons.io`
- [ ] Confirm new cert installed: `echo | openssl s_client -servername api.lons.io -connect api.lons.io:443 | openssl x509 -noout -dates`

### Emergency Certificate Renewal

If cert expires or cert-manager fails:

```bash
# Force renewal immediately
kubectl delete certificate lons-tls-cert -n lons-production
# cert-manager will recreate and renew within 2 minutes

# Monitor renewal
kubectl get certificate lons-tls-cert -n lons-production -w

# If still fails, use manual ACM or Let's Encrypt emergency cert
# See Docs/INCIDENT-RESPONSE.md § RB-8 Certificate Emergency
```

---

## Secrets Inventory (Master List)

### Storage Locations

All secrets use **AWS Secrets Manager** as primary storage, with optional replication to GitHub Actions (for CI/CD).

**No long-lived credentials** are stored in GitHub; OIDC federation is used instead.

### Master Secrets Catalog

#### **1. Database Credentials**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/database` | Production | `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | AWS Lambda (automatic) | 90 days | DE | Multi-AZ RDS PostgreSQL 16+ |
| `/lons/staging/database` | Staging | `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | AWS Lambda (automatic) | 90 days | DE | Single-AZ RDS PostgreSQL 16+ |
| `/lons/preprod/database` | Preprod | `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | AWS Lambda (automatic) | 90 days | DE | Multi-AZ RDS PostgreSQL 16+ |
| `/lons/dev/database` | Dev | `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | Manual | 30 days | DE | RDS or local PostgreSQL |

**Rotation Method:** AWS Lambda + EventBridge (Secrets Manager built-in rotation)

**Access:** Only services with IAM role `lons-secrets-reader` can access

#### **2. Redis Credentials**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/redis` | Production | `REDIS_URL`, `REDIS_AUTH_TOKEN` | Manual | 90 days | DE | ElastiCache (Multi-AZ) |
| `/lons/staging/redis` | Staging | `REDIS_URL`, `REDIS_AUTH_TOKEN` | Manual | 90 days | DE | ElastiCache (Single-AZ) |
| `/lons/preprod/redis` | Preprod | `REDIS_URL`, `REDIS_AUTH_TOKEN` | Manual | 90 days | DE | ElastiCache (Multi-AZ) |
| `/lons/dev/redis` | Dev | `REDIS_URL`, `REDIS_AUTH_TOKEN` | Manual | 30 days | DE | Local Redis or ElastiCache |

**Rotation Method:** Manual (run `aws secretsmanager rotate-secret`)

**Access:** Only services with IAM role `lons-secrets-reader`

#### **3. JWT Keypair (RS256)**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/jwt-keys` | Production | `JWT_PRIVATE_KEY` (base64), `JWT_PUBLIC_KEY` (base64) | Manual (manual trigger) | 180 days | DE | 4096-bit RSA keypair |
| `/lons/staging/jwt-keys` | Staging | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | Manual | 180 days | DE | Can share with preprod for testing |
| `/lons/preprod/jwt-keys` | Preprod | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | Manual | 180 days | DE | Can share with staging |
| `/lons/dev/jwt-keys` | Dev | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | Manual | 90 days | DE | For local/dev only |

**Rotation Method:** Manual (generate new keypair, update secret, restart API servers)

**Impact:** Existing JWT tokens become invalid; users must re-login after rotation

**Alert:** Remind team 14 days before rotation deadline

#### **4. Data Encryption Keys (AES-256)**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/encryption` | Production | `ENCRYPTION_KEY_CURRENT` (base64, 32 bytes), `ENCRYPTION_KEY_PREVIOUS` (base64, optional for backward compatibility) | Manual | 180 days | DE | AES-256-GCM for PII encryption |
| `/lons/staging/encryption` | Staging | `ENCRYPTION_KEY_CURRENT`, `ENCRYPTION_KEY_PREVIOUS` | Manual | 180 days | DE | Can be same as preprod |
| `/lons/preprod/encryption` | Preprod | `ENCRYPTION_KEY_CURRENT`, `ENCRYPTION_KEY_PREVIOUS` | Manual | 180 days | DE | — |
| `/lons/dev/encryption` | Dev | `ENCRYPTION_KEY_CURRENT` | Manual | 90 days | DE | Can be shared |

**Rotation Method:** Manual (generate new key, store with `_CURRENT` and `_PREVIOUS`)

**Impact:** New records encrypted with new key; old records decrypted with previous key (read-only)

**Data Re-encryption:** Run migration batch job after rotation to re-encrypt all sensitive data

#### **5. Integration API Keys (Third-Party)**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/integrations` | Production | `MTN_MOMO_API_KEY`, `MTN_MOMO_API_SECRET`, `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_USERNAME`, etc. | Per provider | Per provider contract | DE | Store multiple provider keys in single secret |
| `/lons/staging/integrations` | Staging | Same structure, sandbox/test keys | Per provider | Per provider | DE | — |
| `/lons/preprod/integrations` | Preprod | Same structure, production-like keys | Per provider | Per provider | DE | — |
| `/lons/dev/integrations` | Dev | Sandbox keys | Per provider | Per provider | DE | — |

**Rotation:** Depends on provider policy
- **MTN MoMo:** Rotate every 90 days (or per MTN requirements)
- **Africa's Talking:** Rotate every 180 days (or per provider requirements)

**Process:** Contact integration provider for new keys, update secret, restart integration service

#### **6. AWS IAM Keys (For Cross-Account Access)**

| Secret ID | Environment | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------------|----------|----------|----------|-------|-------|
| `/lons/production/aws-iam-keys` | Production | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credential rotation (automatic via Lambda) | 90 days | DE | For integration service (if needed) |
| `/lons/staging/aws-iam-keys` | Staging | Same structure | Automatic | 90 days | DE | — |
| `/lons/preprod/aws-iam-keys` | Preprod | Same structure | Automatic | 90 days | DE | — |
| `/lons/dev/aws-iam-keys` | Dev | Same structure | Automatic | 30 days | DE | — |

**Note:** Prefer OIDC + AssumeRole over static IAM keys. Only use if absolutely necessary.

#### **7. GitHub Secrets (CI/CD Only)**

| Secret ID | Scope | Contents | Rotation | Schedule | Owner | Notes |
|-----------|-------|----------|----------|----------|-------|-------|
| `GHCR_TOKEN` | Repository-level | GitHub Container Registry Personal Access Token | Manual | 90 days | DE | Scopes: `write:packages`, `delete:packages`, `read:packages` |
| `GHCR_USERNAME` | Repository-level | GitHub username | N/A | Static | DE | Used for Docker login |
| `AWS_ROLE_ARN_DEV` | Environment (dev) | OIDC role ARN for dev | N/A | Auto-managed (Terraform) | DE | Set by Terraform after infrastructure deployment |
| `AWS_ROLE_ARN_STAGING` | Environment (staging) | OIDC role ARN for staging | N/A | Auto-managed | DE | — |
| `AWS_ROLE_ARN_PREPROD` | Environment (preprod) | OIDC role ARN for preprod | N/A | Auto-managed | DE | — |
| `AWS_ROLE_ARN_PRODUCTION` | Environment (production) | OIDC role ARN for production | N/A | Auto-managed | DE | **Requires approval for deployments** |

**GitHub Secrets Documentation:** See `Docs/GITHUB-SECRETS-INVENTORY.md`

### Secrets Access Control

**Who can access what?**

| Role | Access | Environment |
|------|--------|-------------|
| **Service pods (Kubernetes)** | Via ExternalSecrets operator (ESO) | Own environment only (dev/staging/preprod/prod) |
| **GitHub Actions** | Via OIDC + AssumeRole (no static credentials) | Own environment only |
| **Developers** | Only read-only, via AWS CLI (with MFA) | Own environment + staging (no prod) |
| **Deployment Engineer** | Full read/write via AWS CLI or Terraform | All environments |
| **On-call Engineer** | Read-only for troubleshooting | All environments (with MFA) |

**How to access secrets locally:**

```bash
# Requires AWS credentials configured + MFA
aws secretsmanager get-secret-value \
  --secret-id /lons/dev/database \
  --region eu-west-1

# Extract just the value
aws secretsmanager get-secret-value \
  --secret-id /lons/dev/database \
  --query SecretString \
  --output text | jq .DATABASE_URL
```

### Secrets Rotation Automation

**AWS Lambda Function (Automatic Rotation)**

Configured for database passwords + AWS IAM keys:

```bash
# Lambda function: lons-secrets-rotation
# Triggers every 90 days (configurable per secret)
# Rotates database credentials, AWS keys automatically

# To verify rotation status
aws secretsmanager list-secret-version-ids \
  --secret-id /lons/production/database \
  --region eu-west-1
```

**Manual Rotation (for keys that need manual intervention)**

Calendar reminders set for:
- JWT keys: 14 days before 180-day rotation
- Encryption keys: 14 days before 180-day rotation
- Integration API keys: Per provider schedule

---

## Environment Promotion Playbook

### Promotion Path

```
Local Dev → GitHub (develop branch)
              ↓
           CI Pipeline
              ↓
          dev environment (auto)
              ↓
        staging environment (auto)
              ↓
        preprod environment (manual dispatch)
              ↓
       production environment (manual + approval)
```

### Stage 1: Dev → Staging (Automatic)

**Trigger:** Merge to `main` branch (or `develop` branch, TBD)

**What happens:**
1. GitHub Actions workflow starts
2. Runs: `pnpm build`, `pnpm test`, `pnpm lint`
3. Builds Docker images → ECR
4. Runs smoke tests against dev environment
5. If green: Auto-promotes to staging

**Example workflow:**

```yaml
name: Auto-Deploy to Staging

on:
  push:
    branches:
      - main  # or 'develop' depending on git strategy

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Lint
        run: pnpm lint

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test

      - name: Assume AWS role (dev)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_DEV }}
          aws-region: eu-west-1

      - name: Build & push Docker images to ECR
        run: |
          aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t $ECR_REGISTRY/lons:${{ github.sha }} -f apps/graphql-server/Dockerfile .
          docker push $ECR_REGISTRY/lons:${{ github.sha }}

      - name: Deploy to staging
        run: |
          helm upgrade lons ./helm/lons \
            --namespace lons-staging \
            --values helm/lons/values-staging.yaml \
            --set image.tag=${{ github.sha }}
          kubectl rollout status deployment/graphql-server -n lons-staging --timeout=5m

  smoke-tests:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke tests against staging
        run: |
          npm run test:smoke -- --env staging
        continue-on-error: true  # Non-blocking
```

**Verification:**
- CI pipeline must pass all tests
- Smoke tests against staging environment pass (or warning logged)
- Helm deployment succeeds
- All pods are Ready

**Rollback:** Auto-rollback if deployment fails:
```bash
helm rollout undo lons -n lons-staging
```

### Stage 2: Staging → Preprod (Manual Dispatch)

**Trigger:** Manual GitHub Actions dispatch (PM or Deployment Engineer)

**UI:** GitHub Actions → "Deploy Preprod" workflow → Run workflow

**What happens:**
1. Fetches latest image from ECR
2. Runs full E2E test suite against preprod
3. Verifies metrics baseline (compares to previous runs)
4. Deploys to preprod if all green
5. Monitors for 30 minutes for errors/alerts

**Example workflow:**

```yaml
name: Deploy to Preprod

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Docker image tag (default: latest from staging)'
        required: false
        default: 'latest-staging'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: preprod
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Assume AWS role (preprod)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PREPROD }}
          aws-region: eu-west-1

      - name: Deploy to preprod
        run: |
          helm upgrade lons ./helm/lons \
            --namespace lons-preprod \
            --values helm/lons/values-preprod.yaml \
            --set image.tag=${{ github.event.inputs.image_tag || 'latest-staging' }}

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/graphql-server -n lons-preprod --timeout=10m

      - name: Run E2E tests against preprod
        run: |
          npm run test:e2e -- --env preprod

      - name: Verify metrics (P95 latency, error rate)
        run: |
          npm run check:metrics -- --env preprod --baseline historic
```

**Approval:**
- Deployment Engineer reviews test results
- PM approves if changes are business-critical
- Notify on Slack `#lons-deployments`

**Verification Checklist:**
- [ ] All pods Running and Ready
- [ ] E2E tests pass (loan origination → repayment flow)
- [ ] Metrics baseline acceptable (latency <1s, error rate <0.1%)
- [ ] No new alerts firing
- [ ] Logs clean (no error spikes)

**Rollback:**
```bash
helm rollout undo lons -n lons-preprod
```

**Monitoring:** Watch metrics for 24+ hours before promoting to production

### Stage 3: Preprod → Production (Manual + Protected)

**Trigger:** Manual GitHub Actions dispatch + **Environment Protection Approval**

**Requirements:**
- Preprod ran successfully for ≥24 hours with no errors
- Deployment Engineer + PM approval required
- Changes must have change request in Monday
- Scheduled during maintenance window (Saturdays 02:00–06:00 UTC)

**Example workflow:**

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Docker image tag (must be from preprod)'
        required: true
      reason:
        description: 'Reason for deployment'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      # Protection rules configured in GitHub:
      # - Require deployment branches: main only
      # - Require reviewers: 1 (PM or Deployment Engineer)
      # - Wait timer: 0 (no delay)
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Assume AWS role (production)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PRODUCTION }}
          aws-region: eu-west-1

      - name: Create RDS snapshot (backup before deployment)
        run: |
          aws rds create-db-snapshot \
            --db-instance-identifier lons-production \
            --db-snapshot-identifier lons-production-pre-deploy-${{ github.run_number }} \
            --region eu-west-1

      - name: Deploy to production (blue-green)
        run: |
          helm upgrade lons ./helm/lons \
            --namespace lons-production \
            --values helm/lons/values-production.yaml \
            --set image.tag=${{ github.event.inputs.image_tag }} \
            --wait \
            --timeout 30m

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/graphql-server -n lons-production --timeout=15m
          # Run quick smoke tests
          curl -X POST https://api.lons.io/graphql \
            -H "Content-Type: application/json" \
            -d '{"query":"{ __typename }"}'

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "🚀 Production Deployment Complete",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Deployed to production\nImage: ${{ github.event.inputs.image_tag }}\nReason: ${{ github.event.inputs.reason }}"
                  }
                }
              ]
            }

      - name: Monitor for 30 min
        run: |
          # Wait 30 minutes and check for alerts/errors
          sleep 1800
          # Check CloudWatch metrics
          aws cloudwatch get-metric-statistics \
            --namespace AWS/ApplicationELB \
            --metric-name TargetResponseTime \
            --dimensions Name=LoadBalancer,Value=lons-alb \
            --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
            --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
            --period 300 \
            --statistics Average,Maximum
```

**Approval Workflow:**
1. Engineer clicks "Run workflow" in GitHub Actions
2. Fills in image tag + reason
3. GitHub requires approval from 1 designated reviewer (PM)
4. PM reviews in GitHub UI, clicks "Approve and deploy"
5. Deployment proceeds automatically

**Environment Protection Rules (GitHub):**
```
Settings → Environments → production
  ✓ Require reviewers (at least 1)
  ✓ Restrict who can deploy to this environment
    - Allow list: PM, Deployment Engineer
  ✓ Required deployment branches: main only
  ✓ Wait timer: 0 (no delay)
```

**Pre-Deployment Checklist:**
- [ ] Preprod running cleanly for ≥24 hours
- [ ] Change request in Monday approved
- [ ] Maintenance window scheduled (Saturday 02:00–06:00 UTC)
- [ ] Tenants notified 24 hours in advance
- [ ] Runbook prepared + reviewed
- [ ] Rollback plan tested (not actually executed)
- [ ] On-call engineer on standby

**Post-Deployment Checklist:**
- [ ] All pods Running and Ready
- [ ] Health check endpoint returning 200
- [ ] Smoke tests passing
- [ ] Metrics normal (latency <1s, error rate <0.1%)
- [ ] Logs clean
- [ ] No alerts firing
- [ ] Monitor for 30+ minutes

### Rollback Procedures

**For Any Environment:**

#### **Option A: Helm Rollback (Fastest)**

```bash
# List previous revisions
helm history lons -n lons-production

# Rollback to previous revision
helm rollback lons -n lons-production

# Specify exact revision
helm rollback lons 5 -n lons-production

# Verify rollback
helm status lons -n lons-production
kubectl rollout status deployment/graphql-server -n lons-production
```

**Time to restore:** 2-5 minutes

#### **Option B: Manual Deployment (If Helm fails)**

```bash
# Get previous image tag from ECR or Git history
git log -1 --oneline

# Re-apply previous Helm values
helm upgrade lons ./helm/lons \
  --namespace lons-production \
  --values helm/lons/values-production.yaml \
  --set image.tag={PREVIOUS_TAG} \
  --wait
```

**Time to restore:** 5-15 minutes

#### **Option C: Database Rollback (If data issue)**

Only if the deployment included a database migration that caused data corruption:

```bash
# Restore from pre-deployment snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-production-restored \
  --db-snapshot-identifier lons-production-pre-deploy-XXX \
  --region eu-west-1

# Update Secrets Manager with new DB endpoint
aws secretsmanager update-secret \
  --secret-id /lons/production/database \
  --secret-string '{"DATABASE_URL":"postgresql://...new-endpoint..."}'

# Restart all services
kubectl rollout restart deployment/graphql-server -n lons-production
```

**Time to restore:** 30-60 minutes (RDS restore takes time)

**IMPORTANT: Only rollback database if absolutely necessary.** If data has already been modified, rollback may cause issues. Consult with data team before rolling back RDS.

### When NOT to Rollback

- **Data migrations that have already executed:** Rolling back code won't undo database changes. Manual data fixes may be required.
- **If issue is only in a specific tenant:** Don't rollback entire platform. Fix specific tenant instead.
- **If issue is not reproducible:** Rollback may mask the problem. Investigate first.

---

## Rollback Playbook

### Decision Tree: Should We Rollback?

```
Issue detected after deployment
       ↓
Is the platform completely broken?
  YES → Rollback immediately (SEV1)
  NO  → Investigate further
         ↓
    Is the error in new code (not database)?
      YES → Rollback (code fix)
      NO  → Is it a database migration that can't be undone?
              YES → Fix forward (add hotfix, don't rollback)
              NO  → Rollback (migration can be reversed)
```

### Rapid Rollback Process (SEV1)

If platform is down and cause is known to be new deployment:

1. **Declare incident SEV1** → Page on-call → War room
2. **Stop monitoring noise:** Update AlertManager to suppress non-critical alerts
3. **Execute Helm rollback:**
   ```bash
   helm rollback lons -n lons-production
   ```
4. **Monitor for recovery:** Wait 5 minutes for pods to redeploy
5. **Verify traffic returning:** Check ALB target health, request rate
6. **Update Slack:** `✅ ROLLBACK COMPLETE — services recovering`
7. **Investigate root cause:** What was wrong with deployment?
8. **Re-deploy with fix:** Once issue is resolved

### Controlled Rollback Process (SEV2/3)

If issue is confirmed but platform is partially working:

1. **Assess impact:** How many tenants/features affected?
2. **Option A: Rollback code only** (if database is fine)
   ```bash
   helm rollout undo deployment/graphql-server -n lons-production
   ```
3. **Option B: Fix forward with hotfix** (if rollback is risky)
   - Create hotfix branch
   - Deploy hotfix to preprod first
   - Then promote to production
4. **Monitor for recurrence:** Watch metrics closely

### Post-Rollback Actions

1. **Root cause analysis:** Why did deployment break?
2. **Blame-free post-incident review:** What can we prevent this?
3. **Update tests:** Add test case that would have caught this
4. **Update runbooks:** Document the issue + recovery steps
5. **Schedule re-deployment:** Fix issue, then re-deploy

---

## Deployment Infrastructure Matrix

### Infrastructure per Environment

| Component | Development | Staging | Preprod | Production |
|-----------|-------------|---------|---------|------------|
| **EKS Cluster** | lons-dev | lons-staging | lons-preprod | lons-production |
| **Region** | eu-west-1 | eu-west-1 | eu-west-1 | eu-west-1 (primary) eu-west-2 (DR) |
| **Cluster Size** | 1–2 nodes (t3.medium) | 2–3 nodes (t3.large) | 3 nodes (t3.xlarge) | 6–10 nodes (c5.2xlarge, Multi-AZ) |
| **RDS Instance** | db.t3.micro | db.t3.small | db.r5.large | db.r5.xlarge (Multi-AZ) |
| **RDS Backup** | None / Manual | 7 days | 7 days | 30 days |
| **ElastiCache** | cache.t3.micro | cache.t3.small | cache.r5.large | cache.r5.xlarge (Multi-AZ) |
| **ALB** | Shared / simple | Dedicated | Dedicated | Dedicated (Multi-AZ) |
| **WAF** | None | Optional | Optional | Required (OWASP CRS) |
| **NAT Gateway** | None (public) | 1 | 2 | 2 (Multi-AZ) |
| **VPC** | Single AZ | Multi-AZ (optional) | Multi-AZ | Multi-AZ (required) |
| **Cost** | ~$100/month | ~$500/month | ~$1500/month | ~$5000+/month |

### Service Deployment Configuration

| Service | Dev | Staging | Preprod | Production |
|---------|-----|---------|---------|------------|
| **graphql-server** | 1 replica, 250m CPU, 256Mi RAM | 2 replicas | 3 replicas | 5–10 (HPA: 5–20, target 70% CPU) |
| **rest-server** | 1 replica | 2 replicas | 2 replicas | 3–5 (HPA: 3–10) |
| **notification-worker** | 1 replica | 2 replicas | 2 replicas | 3–5 (HPA: 3–10) |
| **scheduler** | 1 replica | 1 replica | 1 replica | 1 replica (no HPA, singletons) |
| **admin-portal** (Next.js) | 1 replica | 1 replica | 2 replicas | 3 replicas (HPA: 2–5) |
| **All other services** | 1 replica | 1–2 replicas | 2 replicas | 3 replicas (HPA as needed) |

### Database Connection Pooling

| Environment | Pool Size | Max Connections | Timeout |
|-------------|-----------|-----------------|---------|
| Development | 5 | 10 | 30s |
| Staging | 10 | 25 | 30s |
| Preprod | 20 | 50 | 30s |
| Production | 25 | 100 | 30s |

---

## Access Control Matrix

### AWS IAM Roles & Permissions

| Role | Development | Staging | Preprod | Production | Notes |
|------|-------------|---------|---------|------------|-------|
| **Developer** | Read/Write | Read only | None | None | Can deploy to dev, read staging metrics |
| **Deployment Engineer** | Read/Write | Read/Write | Read/Write | Read/Write + Approve | Full access to all environments |
| **On-Call Engineer** | Read only | Read only | Read only | Read only + MFA | Troubleshooting access, no deployments |
| **GitHub Actions (CI)** | OIDC assume role | OIDC assume role | OIDC assume role | OIDC assume role + Approval | Temporary credentials, no static keys |
| **Service Pods** | K8s ServiceAccount | K8s ServiceAccount | K8s ServiceAccount | K8s ServiceAccount | Via IRSA (IAM Roles for Service Accounts) |

### Kubernetes RBAC

| Role | Development | Staging | Preprod | Production |
|------|-------------|---------|---------|------------|
| **admin** | Developers | Deployment Engineer | Deployment Engineer | Deployment Engineer (MFA required) |
| **edit** | None | None | None | None |
| **view** | On-call engineer | On-call engineer | On-call engineer | On-call engineer |

### Secret Access Permissions

| Group | Dev Secrets | Staging Secrets | Preprod Secrets | Prod Secrets |
|-------|-------------|-----------------|-----------------|-------------|
| **Developers** | Read | Read | None | None |
| **Deployment Engineer** | Read/Write | Read/Write | Read/Write | Read/Write |
| **Service Pods** | Read (ESO) | Read (ESO) | Read (ESO) | Read (ESO) |
| **CI/CD Pipeline** | Read (OIDC) | Read (OIDC) | Read (OIDC) | Read (OIDC) |

---

## Rotation & Renewal Schedule

### Master Rotation Calendar

| Item | Interval | Due Date | Responsible | Status |
|------|----------|----------|-------------|--------|
| **Database Credentials** | 90 days | Q1: 2026-06-29, Q2: 2026-09-29, Q3: 2026-12-29, Q4: 2027-03-29 | DE | Auto-rotated via Lambda |
| **Redis Auth Token** | 90 days | Same as above | DE | Manual (need reminder) |
| **JWT Private Keys** | 180 days | 2026-09-29, 2027-03-29 | DE | Manual (14-day warning) |
| **Encryption Keys** | 180 days | 2026-09-29, 2027-03-29 | DE | Manual (14-day warning) |
| **API Integration Keys** | Per provider | MTN: 90d (2026-06-29), Africa's Talking: 180d (2026-09-29) | DE | Manual |
| **GHCR Token** | 90 days | 2026-06-29, 2026-09-29, 2026-12-29, 2027-03-29 | DE | Manual (calendar reminder) |
| **TLS Certs (ACM)** | Automatic (60d pre-expiry) | N/A | Automatic | ✅ Auto-renewed |
| **TLS Certs (cert-manager)** | Automatic (30d pre-expiry) | N/A | Automatic | ✅ Auto-renewed |

### Rotation Reminders

**Set calendar alerts for:**
- 14 days before: JWT key rotation
- 14 days before: Encryption key rotation
- 30 days before: Integration API key rotation (per provider)
- 30 days before: GHCR token rotation
- 60 days before: Database password rotation (optional, auto-rotated)

**Process for Manual Rotation:**
1. Set reminder 14 days before due date
2. Generate new key/credential
3. Update AWS Secrets Manager
4. Document change in Jira/Monday
5. Verify old credential is no longer used
6. Schedule service restart (during maintenance window if possible)

---

## Appendix A: Useful Links

| Item | Link | Status |
|------|------|--------|
| AWS Console | https://console.aws.amazon.com | TBD |
| ECR Repository | https://eu-west-1.console.aws.amazon.com/ecr | TBD |
| Secrets Manager | https://eu-west-1.console.aws.amazon.com/secretsmanager | TBD |
| RDS Console | https://eu-west-1.console.aws.amazon.com/rds | TBD |
| EKS Cluster (Prod) | https://eu-west-1.console.aws.amazon.com/eks/clusters/lons-production | TBD |
| GitHub Actions | https://github.com/lons-org/lons/actions | TBD |
| PagerDuty | https://lons.pagerduty.com | To be provisioned |
| Grafana | https://grafana.lons.io | TBD |
| Prometheus | https://prometheus.lons.io | TBD |
| Status Page | https://status.lons.io | To be provisioned |

---

## Appendix B: Quick Reference — Rotation Checklist

### Database Credentials (90-day rotation)

```bash
# 1. Generate new credentials (RDS auto-rotates or run manual rotation)
aws secretsmanager rotate-secret --secret-id /lons/production/database

# 2. Verify rotation completed
aws secretsmanager list-secret-version-ids --secret-id /lons/production/database

# 3. Test new credentials
psql postgresql://user:pass@{DB_ENDPOINT}:5432/lons -c "SELECT 1"

# 4. Restart services if needed
kubectl rollout restart deployment/graphql-server -n lons-production
```

### JWT Keys (180-day rotation)

```bash
# 1. Generate new RSA keypair
openssl genrsa -out private-key.pem 4096
openssl rsa -in private-key.pem -pubout -out public-key.pem

# 2. Update secret
aws secretsmanager update-secret \
  --secret-id /lons/production/jwt-keys \
  --secret-string "$(jq -n \
    --arg pk "$(cat private-key.pem | base64)" \
    --arg pub "$(cat public-key.pem | base64)" \
    '{jwt_private_key: $pk, jwt_public_key: $pub}')"

# 3. Restart API servers
kubectl rollout restart deployment/graphql-server -n lons-production
kubectl rollout restart deployment/rest-server -n lons-production

# 4. Force user re-login (revoke old tokens)
# psql: UPDATE refresh_tokens SET revoked_at = NOW();
```

### Encryption Keys (180-day rotation)

```bash
# 1. Generate new AES-256 key
NEW_KEY=$(openssl rand 32 | base64)

# 2. Get current key (backup)
CURRENT_KEY=$(aws secretsmanager get-secret-value \
  --secret-id /lons/production/encryption \
  --query 'SecretString' | jq -r .encryption_key_current)

# 3. Update secret with new current + old as previous
aws secretsmanager update-secret \
  --secret-id /lons/production/encryption \
  --secret-string "$(jq -n \
    --arg current "$NEW_KEY" \
    --arg previous "$CURRENT_KEY" \
    '{encryption_key_current: $current, encryption_key_previous: $previous}')"

# 4. Schedule data re-encryption (batch job in next maintenance window)
kubectl run re-encrypt-job \
  --image lons:latest \
  --command -- node scripts/re-encrypt-pii.js \
  -n lons-production
```

---

**Document Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-29 | Infrastructure Team | Initial version |
