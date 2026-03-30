# GitHub Secrets Inventory

This document catalogs all GitHub repository secrets needed for CI/CD pipelines across all four environments (dev, staging, preprod, production). Secrets are synchronized from AWS Secrets Manager using GitHub's OIDC federation.

**Last Updated:** 2026-03-29

---

## Secret Management Architecture

### Overview

- **No long-lived credentials:** OIDC federation is used to authenticate GitHub Actions to AWS without storing access keys in GitHub
- **Centralized storage:** All secrets (DB credentials, JWT keys, encryption keys) are stored in AWS Secrets Manager
- **Environment-based secrets:** Each environment (dev, staging, preprod, production) has its own AWS account or partition
- **Automated rotation:** Database passwords and API keys are rotated automatically (see AWS Secrets Manager policies)

### OIDC Federation Flow

```
GitHub Actions Workflow
  ↓
GitHub Issues OIDC Token (signed JWT)
  ↓
AWS STS AssumeRoleWithWebIdentity
  ↓
Temporary IAM Credentials (5–60 min)
  ↓
Access AWS Secrets Manager / ECR
```

**Advantage:** No static credentials stored in GitHub; credentials are temporary and scoped to the workflow.

---

## Repository-Level Secrets

Repository-level secrets apply to all workflows and are used by CI jobs that don't target a specific environment.

| Secret | Description | Type | Source | Rotation |
|--------|-------------|------|--------|----------|
| `GHCR_TOKEN` | GitHub Container Registry Personal Access Token | PAT | GitHub Settings → Developer Settings | 90 days |
| `GHCR_USERNAME` | GitHub username for GHCR login | String | GitHub account | Static |

### Setup Instructions

**GHCR_TOKEN:**
```bash
# 1. Go to GitHub Settings → Developer settings → Personal access tokens (classic)
# 2. Create new token with scopes: write:packages, delete:packages, read:packages
# 3. Copy token value
# 4. Go to Repo Settings → Secrets and variables → Actions
# 5. Create secret GHCR_TOKEN and paste token
# 6. Rotate every 90 days
```

---

## Environment: Development

**AWS Account:** `lons-dev` (or dev partition in main account)
**AWS Role ARN:** `arn:aws:iam::ACCOUNT_ID:role/github-actions-lons-dev`
**Cluster:** `lons-dev` (EKS)

### Secrets to Populate

| Secret | Environment Variable | Description | Source | Scope |
|--------|----------------------|-------------|--------|-------|
| `AWS_ROLE_ARN_DEV` | (used in workflow) | OIDC role for dev environment | Terraform output: `aws_role_arn_dev` | Workflow environment |
| `KUBE_CONFIG_DEV` | (deprecated) | Use OIDC + AWS role instead | — | — |

### Post-Terraform Setup

After running `terraform apply` for dev environment:

```bash
# 1. Get the role ARN from Terraform output
cd infrastructure/terraform/environments/dev
terraform output aws_role_arn_dev
# Output: arn:aws:iam::111111111111:role/github-actions-lons-dev

# 2. Create GitHub secret (or use GitHub CLI)
gh secret set AWS_ROLE_ARN_DEV --body "arn:aws:iam::111111111111:role/github-actions-lons-dev" --env "dev"

# Or manually:
# Go to Repo Settings → Environments → dev → Secrets
# Create secret: AWS_ROLE_ARN_DEV = arn:aws:iam::111111111111:role/github-actions-lons-dev
```

### GitHub Actions Workflow Usage

```yaml
name: Deploy Dev

on:
  push:
    branches: [develop]

env:
  AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN_DEV }}
  AWS_SESSION_NAME: github-actions-dev

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: dev
    permissions:
      id-token: write  # Required for OIDC
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Assume AWS Role (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ env.AWS_ROLE_ARN }}
          aws-region: eu-west-1

      - name: Fetch secrets from AWS Secrets Manager
        run: |
          # Fetch DATABASE_URL, REDIS_URL, JWT keys, encryption key, etc.
          aws secretsmanager get-secret-value --secret-id /lons/dev/database \
            --query SecretString --output text | jq '.DATABASE_URL'
```

---

## Environment: Staging

**AWS Account:** `lons-staging` (or staging partition in main account)
**AWS Role ARN:** `arn:aws:iam::ACCOUNT_ID:role/github-actions-lons-staging`
**Cluster:** `lons-staging` (EKS)

### Secrets to Populate

| Secret | Environment Variable | Description | Source |
|--------|----------------------|-------------|--------|
| `AWS_ROLE_ARN_STAGING` | (used in workflow) | OIDC role for staging environment | Terraform output: `aws_role_arn_staging` |

### Post-Terraform Setup

```bash
cd infrastructure/terraform/environments/staging
terraform output aws_role_arn_staging

# Create GitHub secret in staging environment
gh secret set AWS_ROLE_ARN_STAGING --body "arn:aws:iam::222222222222:role/github-actions-lons-staging" --env "staging"
```

---

## Environment: Preprod

**AWS Account:** `lons-preprod` (or preprod partition in main account)
**AWS Role ARN:** `arn:aws:iam::ACCOUNT_ID:role/github-actions-lons-preprod`
**Cluster:** `lons-preprod` (EKS)

### Secrets to Populate

| Secret | Environment Variable | Description | Source |
|--------|----------------------|-------------|--------|
| `AWS_ROLE_ARN_PREPROD` | (used in workflow) | OIDC role for preprod environment | Terraform output: `aws_role_arn_preprod` |

### Post-Terraform Setup

```bash
cd infrastructure/terraform/environments/preprod
terraform output aws_role_arn_preprod

gh secret set AWS_ROLE_ARN_PREPROD --body "arn:aws:iam::333333333333:role/github-actions-lons-preprod" --env "preprod"
```

---

## Environment: Production

**AWS Account:** `lons-prod` (or production partition in main account)
**AWS Role ARN:** `arn:aws:iam::ACCOUNT_ID:role/github-actions-lons-production`
**Cluster:** `lons-production` (EKS)

### Secrets to Populate

| Secret | Environment Variable | Description | Source | Notes |
|--------|----------------------|-------------|--------|-------|
| `AWS_ROLE_ARN_PRODUCTION` | (used in workflow) | OIDC role for production environment | Terraform output: `aws_role_arn_prod` | Requires approval for deploys |

### Post-Terraform Setup

```bash
cd infrastructure/terraform/environments/production
terraform output aws_role_arn_prod

# Production secrets require explicit approval in GitHub settings
gh secret set AWS_ROLE_ARN_PRODUCTION --body "arn:aws:iam::444444444444:role/github-actions-lons-production" --env "production"
```

### Production-Only Policies

**GitHub environment protection:**
- Require approval from designated reviewers before production deployment
- Set required reviewers in: Repo Settings → Environments → production → Deployment branches and secrets

---

## Secrets Stored in AWS Secrets Manager

The following secrets are **NOT** stored in GitHub; they are fetched at runtime from AWS Secrets Manager:

### Shared Secrets (All Environments)

| Secret Name | Type | Rotation | Used By |
|-------------|------|----------|---------|
| `/lons/{env}/database` | JSON | 90 days | All services |
| `/lons/{env}/redis` | JSON | 90 days | All services |
| `/lons/{env}/jwt-keys` | JSON | 180 days | API servers, auth service |
| `/lons/{env}/encryption` | JSON | Quarterly | Entity service, repayment service |
| `/lons/{env}/aws-iam-keys` | JSON | 90 days | Integration service (wallet, bureau) |

### Fetching Secrets at Runtime

**Example NestJS ConfigService:**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class ConfigService {
  async getDatabaseUrl(): Promise<string> {
    const client = new SecretsManagerClient({ region: 'eu-west-1' });
    const command = new GetSecretValueCommand({ SecretId: `/lons/${process.env.NODE_ENV}/database` });
    const response = await client.send(command);
    const secret = JSON.parse(response.SecretString);
    return secret.DATABASE_URL;
  }
}
```

**Using ESO (External Secrets Operator) in Kubernetes:**

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: lons-db-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: lons-db-credentials
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: /lons/production/database
        property: DATABASE_URL
```

---

## Secret Creation Checklist

Use this checklist when deploying a new environment:

### 1. Run Terraform

```bash
cd infrastructure/terraform/environments/{env}
terraform init
terraform apply -var-file="{env}.tfvars"
```

### 2. Capture Terraform Outputs

```bash
terraform output aws_role_arn_{env}
terraform output aws_account_id_{env}
```

### 3. Create AWS Secrets Manager Entries

```bash
aws secretsmanager create-secret \
  --name /lons/{env}/database \
  --secret-string '{"DATABASE_URL":"postgresql://..."}'

aws secretsmanager create-secret \
  --name /lons/{env}/redis \
  --secret-string '{"REDIS_URL":"redis://..."}'

# ... repeat for jwt-keys, encryption, aws-iam-keys
```

### 4. Create GitHub Secrets

```bash
# Via GitHub CLI
gh secret set AWS_ROLE_ARN_{ENV_UPPER} \
  --body "arn:aws:iam::ACCOUNT_ID:role/github-actions-lons-{env}" \
  --env "{env}"

# Or manually in Repo Settings → Environments → {env} → Secrets
```

### 5. Verify OIDC Configuration

In AWS IAM:

```bash
# Check OIDC Provider exists
aws iam list-open-id-connect-providers

# Verify trust relationship includes GitHub
aws iam get-role --role-name github-actions-lons-{env} --query Role.AssumeRolePolicyDocument
```

Expected trust policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:lons-org/lons:environment:{env}"
        }
      }
    }
  ]
}
```

---

## Secrets Audit & Rotation Schedule

| Secret | Rotation Interval | Last Rotated | Next Rotation |
|--------|-------------------|--------------|---------------|
| GHCR_TOKEN | 90 days | TBD | TBD |
| AWS credentials (in Secrets Manager) | 90 days | TBD | TBD |
| JWT private keys | 180 days | TBD | TBD |
| Encryption keys | Quarterly (90+ days) | TBD | TBD |

**Automation:** Use AWS Lambda + EventBridge to auto-rotate secrets (see Terraform module: `aws_secretsmanager_secret_rotation`).

---

## Troubleshooting

### OIDC Token Validation Fails

**Error:** `Invalid token signature` or `Token not valid`

**Solution:**
1. Verify OIDC provider is registered in AWS IAM
2. Check GitHub organization is correct (case-sensitive)
3. Verify role trust relationship includes current GitHub repo

```bash
# List OIDC providers
aws iam list-open-id-connect-providers

# Get OIDC provider details
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com
```

### Secrets Not Found in AWS Secrets Manager

**Error:** `ResourceNotFoundException: Secrets Manager can't find the specified secret`

**Solution:**
1. Verify secret name matches environment: `/lons/{env}/database`
2. Check secret is in correct AWS region (eu-west-1)
3. Verify IAM role has `secretsmanager:GetSecretValue` permission

```bash
# List all secrets in region
aws secretsmanager list-secrets --region eu-west-1

# Get secret value (requires permission)
aws secretsmanager get-secret-value --secret-id /lons/dev/database
```

### Workflow Fails with Permission Denied

**Error:** `AccessDenied: User is not authorized to perform: sts:AssumeRoleWithWebIdentity`

**Solution:**
1. Verify AWS_ROLE_ARN secret is set in GitHub environment
2. Check IAM role trust relationship (see above)
3. Verify workflow has `id-token: write` permission

```yaml
jobs:
  deploy:
    permissions:
      id-token: write  # Required for OIDC
      contents: read
```

---

## References

- **GitHub OIDC Docs:** [Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- **AWS Secrets Manager:** [User Guide](https://docs.aws.amazon.com/secretsmanager/latest/userguide/)
- **Terraform AWS Provider:** [OIDC Configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_openid_connect_provider)
- **Deployment Runbook:** `Docs/13-deployment.md`
- **AWS Account Setup:** `Docs/RUNBOOK-AWS-ACCOUNT-SETUP.md`
