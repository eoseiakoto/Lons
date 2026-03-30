# CI/CD & Backup Scripts

Production-ready scripts for managing Lōns staging CI/CD pipeline and backup operations.

## Overview

These scripts automate critical infrastructure operations with comprehensive error handling, colored output, and proper validation.

## Scripts

### 1. verify-cicd.sh

Verifies CI/CD staging readiness before enabling auto-deploy.

**Features:**
- GitHub environment 'staging' exists
- ECR repositories exist for all 6 services
- Recent deploy workflow runs
- STAGING_URL variable configured
- OIDC role configuration
- Workflow file validation
- Dry-run trigger validation

**Usage:**
```bash
./verify-cicd.sh
```

**Example Output:**
```
════════════════════════════════════════════════════════════════
  CI/CD Staging Readiness Verification
════════════════════════════════════════════════════════════════

✓ All required commands available
✓ GitHub environment 'staging' exists
✓ ECR repository 'lons-graphql-server' exists
...
```

### 2. create-ecr-repos.sh

Creates ECR repositories for all 6 Lōns services with automated configuration.

**Features:**
- Idempotent (safe to re-run)
- Enables image scanning on push
- Sets lifecycle policy (keep 20 images, expire untagged after 7 days)
- Enables image tag immutability
- Encrypts repositories with AES
- Proper error handling for existing repos

**Services:**
- graphql-server
- rest-server
- scheduler
- notification-worker
- admin-portal
- scoring-service

**Usage:**
```bash
./create-ecr-repos.sh [--region eu-west-1]
```

**Example:**
```bash
./create-ecr-repos.sh --region eu-west-1
```

### 3. reset-staging.sh

Safely resets the staging environment to a clean state.

**Features:**
- Confirmation prompt (requires typing 'reset-staging')
- Scales down all services gracefully
- Drops and recreates database schema
- Runs database migrations
- Executes seed data jobs
- Flushes Redis cache
- Scales services back up
- Waits for pod readiness
- Verifies completion within 30-minute NFR-ENV-005 limit
- Comprehensive timing report

**Usage:**
```bash
./reset-staging.sh
```

**Workflow:**
1. User confirms with "reset-staging" prompt
2. Scales down deployments
3. Drops/recreates database schema
4. Runs Helm upgrade with migration hook
5. Waits for migrations to complete
6. Executes seed job
7. Flushes Redis
8. Scales services back up
9. Waits for all pods to be ready
10. Reports total elapsed time

### 4. snapshot-staging.sh

Creates on-demand snapshots of staging infrastructure.

**Features:**
- Creates RDS database snapshots with timestamp
- Optional Redis snapshot creation
- Shows real-time monitoring commands
- Estimates database size
- Displays snapshot creation status
- Provides restore procedures

**Usage:**
```bash
./snapshot-staging.sh [--include-redis] [--region eu-west-1]
```

**Examples:**
```bash
# RDS snapshot only
./snapshot-staging.sh

# Include Redis snapshot
./snapshot-staging.sh --include-redis

# Specific region
./snapshot-staging.sh --region us-east-1
```

### 5. verify-backups.sh

Verifies backup and disaster recovery readiness.

**Features:**
- Lists AWS Backup plans and vaults
- Shows recent RDS snapshots
- Verifies backup job history
- Checks cross-region replication
- Validates retention policies
- Provides recovery procedures
- Shows configuration details

**Usage:**
```bash
./verify-backups.sh [--region eu-west-1]
```

**Coverage:**
- Daily backups (2 AM UTC)
- Monthly backups (3 AM UTC on 1st)
- Cross-region replication to DR
- 30-day retention (daily)
- 90-day retention (monthly)
- KMS encryption
- SNS notifications
- EventBridge integration

## Requirements

### System Commands
- `aws` - AWS CLI v2+
- `kubectl` - Kubernetes CLI
- `helm` - Helm package manager
- `jq` - JSON query tool
- `gh` - GitHub CLI (for verify-cicd.sh)

### AWS Permissions

Scripts require these IAM permissions:

**verify-cicd.sh:**
- `sts:GetCallerIdentity`
- `ecr:DescribeRepositories`
- `ecr:DescribeRegistry`
- `iam:ListOpenIDConnectProviders`

**create-ecr-repos.sh:**
- `ecr:CreateRepository`
- `ecr:DescribeRepositories`
- `ecr:PutImageScanningConfiguration`
- `ecr:PutLifecyclePolicy`
- `ecr:PutImageTagMutability`

**reset-staging.sh:**
- `eks:UpdateKubeconfig`
- `rds:DescribeDBInstances` / `DescribeDBClusters`
- `elasticache:DescribeReplicationGroups`
- Kubernetes API access to `lons-staging` namespace

**snapshot-staging.sh:**
- `rds:CreateDBSnapshot` / `CreateDBClusterSnapshot`
- `rds:DescribeDBSnapshots` / `DescribeDBClusters`
- `elasticache:CreateSnapshot`
- `elasticache:DescribeReplicationGroups`

**verify-backups.sh:**
- `backup:ListBackupVaults`
- `backup:DescribeBackupVault`
- `backup:ListBackupPlans`
- `backup:GetBackupPlan`
- `backup:ListBackupSelections`
- `backup:ListBackupJobs`
- `rds:DescribeDBSnapshots` / `DescribeDBClusters`

## Environment Variables

```bash
# All scripts
export AWS_REGION=eu-west-1

# reset-staging.sh
export DATABASE_URL="postgresql://user:pass@host:5432/lons"
export REDIS_URL="redis://host:6379"

# verify-backups.sh
export DR_REGION=us-east-1
```

## Error Handling

All scripts include:
- `set -euo pipefail` for strict error handling
- Validation of prerequisites
- Graceful handling of missing commands
- Clear error messages with recovery suggestions
- Timeout protection for long-running operations

## Output

Scripts provide colored output:
- **Green** (✓): Successful operations
- **Red** (✗): Failures requiring attention
- **Yellow** (⚠): Warnings
- **Cyan**: Information headers
- **Magenta**: Status details

## Examples

### Complete Staging Reset
```bash
# Verify CI/CD first
./verify-cicd.sh

# Create ECR repos if needed
./create-ecr-repos.sh

# Create backup before reset
./snapshot-staging.sh

# Reset staging
./reset-staging.sh

# Verify backups after reset
./verify-backups.sh
```

### Pre-Deployment Checklist
```bash
# 1. Verify backup exists
./snapshot-staging.sh

# 2. Check CI/CD readiness
./verify-cicd.sh

# 3. Confirm recovery capability
./verify-backups.sh

# 4. Deploy to staging (manual via GitHub)
# 5. Run smoke tests
```

## Troubleshooting

### verify-cicd.sh Issues
- **ECR not found**: Run `./create-ecr-repos.sh`
- **OIDC provider missing**: Configure GitHub OIDC in AWS IAM
- **STAGING_URL not set**: Add variable to GitHub environment settings

### create-ecr-repos.sh Issues
- **Access denied**: Check AWS credentials and IAM permissions
- **Repository already exists**: Script handles this, continues safely

### reset-staging.sh Issues
- **Database connection failed**: Check DATABASE_URL and networking
- **Timeout**: Increase `RESET_TIMEOUT` if infrastructure is slow
- **Pods not ready**: Check resource requests/limits in Helm values

### snapshot-staging.sh Issues
- **Cluster not found**: Verify RDS cluster ID (lons-staging)
- **No snapshots**: This is OK on first run, backups will accumulate

### verify-backups.sh Issues
- **No backup plans**: Create AWS Backup plan in Terraform
- **DR region empty**: Copy snapshots manually or wait for schedule

## Maintenance

### Regular Tasks
- Run `verify-cicd.sh` weekly to catch configuration drift
- Run `verify-backups.sh` daily to monitor backup status
- Test restore procedures monthly (off-peak)

### Monitoring
- Set up CloudWatch alarms for backup job failures
- Subscribe to SNS backup notifications
- Monitor RDS disk space (triggers automatic scaling)

## NFR Compliance

- **NFR-ENV-005**: Reset completes in under 30 minutes
- **NFR-SEC-004**: Backups encrypted at rest (KMS)
- **NFR-REC-001**: Daily + monthly snapshots with cross-region replication
- **NFR-MON-004**: Backup job notifications via SNS + EventBridge

## Related Documentation

- `Docs/13-deployment.md` - Deployment & infrastructure
- `infrastructure/terraform/modules/backup/` - Backup Terraform configuration
- `.github/workflows/deploy.yml` - CI/CD workflow definition
- `infrastructure/helm/lons/` - Helm chart for staging
