# Lōns Platform — Disaster Recovery Plan

**Document Version:** 1.0
**Last Updated:** March 2026
**Author:** Cloud Infrastructure Team
**Status:** Active

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Recovery Objectives](#recovery-objectives)
3. [Backup Inventory & Strategy](#backup-inventory--strategy)
4. [Infrastructure Overview](#infrastructure-overview)
5. [Failure Scenarios & Recovery Procedures](#failure-scenarios--recovery-procedures)
6. [DR Runbook](#dr-runbook)
7. [Testing Schedule & Validation](#testing-schedule--validation)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Communication Plan](#communication-plan)
10. [Post-Incident Review](#post-incident-review)

---

## Executive Summary

This document outlines the disaster recovery (DR) strategy for the Lōns fintech platform, a multi-tenant loan origination system deployed on AWS (eu-west-1, primary; eu-west-2, DR region). The platform serves mission-critical financial services across African markets and must maintain high availability and data integrity.

**Key Commitments:**
- **RPO (Recovery Point Objective):** < 1 hour
- **RTO (Recovery Time Objective):** < 4 hours
- **Availability Target:** 99.9% (9.2 hours annual downtime)

---

## Recovery Objectives

### 1.1 Recovery Point Objective (RPO)

**Definition:** The maximum amount of data we can afford to lose.

| Component | RPO | Method |
|-----------|-----|--------|
| **RDS PostgreSQL** | < 1 hour | Continuous WAL archiving + daily snapshots |
| **ElastiCache Redis** | < 15 min | RDB snapshots + event sourcing (queues) |
| **S3 Documents** | < 1 hour | Cross-region replication (real-time) |
| **Secrets Manager** | Real-time | Multi-region secret replication |
| **Terraform State** | < 1 day | S3 versioning + cross-region replication |

**Justification:**
- Financial transactions require near-zero data loss.
- 1-hour RPO aligns with business day transactions (minimal active sessions during off-hours).
- Redis queues are rebuilt from database state if needed (not a system of record).

### 1.2 Recovery Time Objective (RTO)

**Definition:** The maximum acceptable downtime.

| Scenario | RTO | Effort | Automation |
|----------|-----|--------|------------|
| **Single AZ failure** | < 30 min | Low | Automatic (Multi-AZ failover) |
| **RDS failure** | < 2 hours | Medium | Semi-automated (snapshot restore) |
| **Region failure** | < 4 hours | High | Manual (DR activation) |
| **Data corruption** | < 4 hours | Medium | Manual (PITR recovery) |

**Justification:**
- Single AZ failures are handled by Multi-AZ infrastructure (RDS, EKS on 3 AZs).
- RDS snapshots can be restored in 30–45 minutes (depends on database size).
- Cross-region failover requires DNS cutover + pod rescheduling (45–60 minutes).

---

## Backup Inventory & Strategy

### 2.1 Backup Methods & Retention

| Component | Backup Method | Frequency | Retention | Cross-Region Copy | Automation |
|-----------|--------------|-----------|-----------|-------------------|-----------|
| **RDS PostgreSQL** | AWS Backup snapshots + WAL archiving | Daily (2 AM UTC) + Monthly (1st, 3 AM UTC) | 30 days daily, 365 days monthly | Yes (eu-west-2) | AWS Backup Plan |
| **RDS WAL Archive** | S3 (continuous streaming) | Continuous | 30 days | Yes (S3 replication) | RDS Enhanced Backup |
| **ElastiCache Redis** | RDB snapshots | Hourly (automatic) + Manual on-demand | 7 days (dev: 1, staging: 3) | No (rebuilt from DB) | Automatic |
| **S3 Documents** | Cross-region replication | Real-time | Same as source bucket | eu-west-2 | S3 replication rules |
| **Secrets Manager** | Multi-region replica | On creation + on rotation | N/A | Automatic | Secrets Manager replication |
| **Terraform State** | S3 versioning + cross-region replication | On every `apply` | 90 days (previous versions) | eu-west-2 | S3 lifecycle policies |
| **EKS Cluster Config** | GitOps (ArgoCD from Git) | On every commit | Unlimited (Git history) | GitHub (cloud-hosted) | Continuous deployment |
| **Application Database Schemas** | Prisma migrations (Git-tracked) | On every deploy | Unlimited (Git history) | GitHub (cloud-hosted) | Continuous deployment |

### 2.2 Backup Testing & Validation

- **RDS Snapshots:** Automatically copied to DR region (eu-west-2); copy failure triggers SNS alert.
- **WAL Archive:** Continuous streaming validated via CloudWatch Logs; missing WAL blocks trigger RTO escalation.
- **Redis Snapshots:** Captured automatically; restoration tested quarterly in staging.
- **S3 Replication:** Replication status monitored via S3 Replication Metrics; failures trigger immediate alert.

---

## Infrastructure Overview

### 3.1 Primary Region (eu-west-1, Ireland)

**Network:**
- VPC: `10.0.0.0/16`
- Public subnets: 3 AZs (for ALB, NAT Gateways)
- Private subnets: 3 AZs (for EKS nodes, RDS)
- Database subnets: 3 AZs (for RDS Multi-AZ)

**Compute:**
- **EKS Cluster:** 3–5 nodes (t4g/r6g instances) across 3 AZs
- **RDS PostgreSQL:** Multi-AZ (primary in 1a, standby in 1b), automated failover
- **ElastiCache Redis:** Primary + 2 replicas (Multi-AZ), automatic failover
- **ALB:** 2 instances across 2 AZs (automatic)

**Storage:**
- **RDS:** Encrypted with AWS Backup vault (daily + monthly snapshots)
- **S3:** Document storage with versioning + cross-region replication
- **EBS:** EKS node volumes (gp3, encrypted)

**Security:**
- All data encrypted at rest (RDS: KMS, ElastiCache: KMS, S3: KMS, EBS: KMS)
- All data encrypted in transit (TLS 1.2+)
- VPC Flow Logs enabled (30-day retention)

### 3.2 DR Region (eu-west-2, London)

**Replicated Backup Vault:**
- S3 bucket for RDS snapshot copies
- Secrets Manager replicas
- Terraform state backups

**Not Actively Running (Cold Standby):**
- No EKS cluster deployed in DR region (cost optimization)
- RDS snapshots can be restored to new instance on demand (30–60 minutes)
- Redis can be rebuilt from database source data

---

## Failure Scenarios & Recovery Procedures

### 4.1 Scenario 1: Single Availability Zone Failure

**Detection:**
- EKS node termination in one AZ
- RDS standby takes over (Multi-AZ failover) — typically < 30 seconds
- CloudWatch alerts: `RDSMultiAZFailoverDetected`, `EKSNodeGroupDegraded`

**Impact:**
- Zero data loss (standby is synchronous)
- ~30–60 second application pause (during failover)
- No manual intervention required

**Recovery Steps:**
1. **Automatic:** EKS Auto Scaling Group launches replacement node in another AZ.
2. **Automatic:** RDS standby becomes primary.
3. **Monitoring:** Verify pod rescheduling completes (~5 minutes).
4. **Validation:** Check all services are running in CloudWatch Dashboard.

**RTO:** < 30 minutes (mostly automatic)

---

### 4.2 Scenario 2: RDS Primary Failure (Data Corruption or Hardware)

**Detection:**
- RDS Multi-AZ failover triggered automatically.
- If standby is also affected: CloudWatch alert `RDSFailoverFailed`.
- Application logs show connection errors.

**Impact:**
- Potential data loss if last backup is > 1 hour old.
- Services remain available on standby (but degraded if standby also fails).
- Manual intervention required if full restoration needed.

**Recovery Steps:**

#### 4.2.1 Automatic Standby Takeover (Primary Failure Only)
```bash
# CloudWatch monitors this automatically
# RDS Multi-AZ failover occurs within 60–120 seconds
# Services reconnect automatically (connection pool retry logic)
```

**Expected Duration:** 2–5 minutes

#### 4.2.2 Manual Restoration from Snapshot (If Standby Also Affected)

**Step 1: Notify Team**
```bash
# Escalate to on-call DBA
# Post to incident channel: "RDS primary + standby failure, initiating restoration"
```

**Step 2: Restore RDS from Latest Snapshot**
```bash
# Go to AWS Console → RDS → Snapshots → Automated snapshots
# Select most recent snapshot tagged with Backup=true

# Or via AWS CLI:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-${ENVIRONMENT}-restored \
  --db-snapshot-identifier arn:aws:rds:eu-west-1:546854093923:snapshot:lons-postgres-prod-20260329-0200 \
  --db-instance-class db.r6g.xlarge \
  --multi-az \
  --publicly-accessible false

# Wait for restoration to complete (~10–15 minutes for medium DB)
aws rds describe-db-instances --db-instance-identifier lons-postgres-${ENVIRONMENT}-restored \
  --query 'DBInstances[0].DBInstanceStatus'
# Output should be: "available"
```

**Step 3: Restore from WAL Archive (Point-in-Time Recovery)**
```bash
# If you need data after the last snapshot (up to 1 hour ago):
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-${ENVIRONMENT}-pitr \
  --db-snapshot-identifier <snapshot-arn> \
  --restore-time 2026-03-29T15:45:00Z  # Within backup retention window

# This restores to the exact point in time using WAL logs
```

**Step 4: Update Connection Strings**
```bash
# Get new RDS endpoint:
aws rds describe-db-instances --db-instance-identifier lons-postgres-${ENVIRONMENT}-restored \
  --query 'DBInstances[0].Endpoint.Address' --output text

# Update Secrets Manager:
aws secretsmanager update-secret \
  --secret-id lons-postgres-prod-credentials \
  --secret-string '{
    "username": "lonsadmin",
    "password": "'"$(aws secretsmanager get-random-password --query 'RandomPassword' --output text)"'",
    "host": "<new-endpoint>",
    "port": 5432,
    "dbname": "lons"
  }'

# Restart application pods to pick up new connection string:
kubectl rollout restart deployment/graphql-server \
  deployment/rest-server \
  deployment/scheduler \
  -n lons-${ENVIRONMENT}
```

**Step 5: Verify Data Integrity**
```bash
# Check row counts match pre-failure state:
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM loan_requests;
SELECT COUNT(*) FROM ledger_entries;

# Verify no truncated transactions:
SELECT COUNT(*) FROM ledger_entries WHERE status = 'incomplete';
# Should be 0

# Check application can connect:
curl -X GET http://lons-api.${ENVIRONMENT}.lons.io/health
# Should return 200 OK
```

**Step 6: Switch to New RDS Instance**
```bash
# Once validated, rename the restored instance to the original name:
# In AWS Console: Modify instance → Rename
# Or keep both and update connection string to point to restored instance
# Then delete original instance after 24-hour observation period

aws rds delete-db-instance \
  --db-instance-identifier lons-postgres-${ENVIRONMENT} \
  --final-db-snapshot-identifier lons-postgres-${ENVIRONMENT}-final-${DATE}

# Rename restored instance:
aws rds modify-db-instance \
  --db-instance-identifier lons-postgres-${ENVIRONMENT}-restored \
  --new-db-instance-identifier lons-postgres-${ENVIRONMENT} \
  --apply-immediately
```

**RTO:** 15–30 minutes (snapshot restore + DNS update)

---

### 4.3 Scenario 3: ElastiCache Redis Failure

**Detection:**
- Redis connection errors in application logs.
- CloudWatch alerts: `RedisConnectionFailure`, `RedisEvictions`.
- ALB health checks start failing for services.

**Impact:**
- BullMQ job queue becomes unavailable (~1 minute of job processing delay).
- Application can function without Redis (stateless read operations work; async jobs queue locally in application memory).
- No data loss (Redis is ephemeral; state is in PostgreSQL).

**Recovery Steps:**

#### 4.3.1 Automatic Failover (Primary Node Failure)
```bash
# ElastiCache Multi-AZ with automatic failover enabled
# Replica automatically promoted to primary within 60 seconds
# Application connection pool reconnects automatically (with retry logic)
```

**Expected Duration:** 1–2 minutes

#### 4.3.2 Manual Restoration (Complete Cluster Failure)

**Step 1: Stop the Failed Cluster**
```bash
# Go to AWS Console → ElastiCache → Redis → Replication Groups
# Select the failed group, click "Delete"

# Or via CLI (skip final snapshot if not needed):
aws elasticache delete-replication-group \
  --replication-group-id lons-redis-${ENVIRONMENT} \
  --skip-final-snapshot
```

**Step 2: Create New Cluster**
```bash
# Terraform will handle this; run:
cd infrastructure/terraform
terraform apply -target module.elasticache

# Or manually (not recommended):
aws elasticache create-replication-group \
  --replication-group-description "Redis for lons-${ENVIRONMENT}" \
  --replication-group-id lons-redis-${ENVIRONMENT}-restored \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r6g.xlarge \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --subnet-group-name lons-elasticache-${ENVIRONMENT}
```

**Step 3: Update Application Configuration**
```bash
# Get new Redis endpoint:
aws elasticache describe-replication-groups \
  --replication-group-id lons-redis-${ENVIRONMENT}-restored \
  --query 'ReplicationGroups[0].PrimaryEndpoint.Address'

# Update Kubernetes secret:
kubectl create secret generic redis-auth \
  --from-literal=redis-url="redis://${NEW_REDIS_ENDPOINT}:6379" \
  -n lons-${ENVIRONMENT} \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart application:
kubectl rollout restart deployment -n lons-${ENVIRONMENT}
```

**Step 4: Validate**
```bash
# Check Redis connectivity:
redis-cli -h ${NEW_REDIS_ENDPOINT} -p 6379 PING
# Should return: PONG

# Verify BullMQ queues are processing:
curl -X GET http://lons-api.${ENVIRONMENT}.lons.io/queues
# Should return queue status
```

**RTO:** 5–10 minutes (new cluster creation + restart)

---

### 4.4 Scenario 4: Complete Region Failure (eu-west-1 Unavailable)

**Detection:**
- All services unreachable (ALB, EKS, RDS, Redis down).
- CloudWatch regional metrics stop reporting.
- AWS Health Dashboard shows region-wide outage.
- Escalate immediately to Level 2 / On-Call Manager.

**Impact:**
- Complete platform outage.
- Data is safe in cross-region backups (S3, RDS snapshots, Secrets Manager).
- RTO: < 4 hours (full recovery in DR region).

**Recovery Steps:**

#### 4.4.1 Initial Assessment (10 minutes)
```bash
# 1. Confirm region is down (not just local ISP issue):
curl -X HEAD https://ec2.eu-west-1.amazonaws.com
# Should fail with timeout or 5xx

# 2. Check AWS Status:
# https://status.aws.amazon.com → Look for eu-west-1 status

# 3. Verify backups in DR region (eu-west-2) are current:
aws s3 ls s3://lons-rds-backups-eu-west-2 --recursive --human-readable --summarize
# Look for recent snapshots

# 4. Notify stakeholders:
# - Post incident to #outages-lons Slack channel
# - Notify SMS alert subscribers
# - Post status update: "Platform unavailable, initiating failover to DR region"
```

#### 4.4.2 Activate DR Infrastructure in eu-west-2 (60 minutes)

**Step 1: Create VPC and Subnets in DR Region**
```bash
# Deploy VPC infrastructure to eu-west-2:
cd infrastructure/terraform
export ENVIRONMENT=prod
export REGION=eu-west-2

# Create a new workspace for DR region:
terraform workspace new eu-west-2-${ENVIRONMENT}

# Or manually (if not using Terraform):
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region eu-west-2
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.1.0/24 \
  --availability-zone eu-west-2a --region eu-west-2
# ... (repeat for all subnets)
```

**Step 2: Restore RDS from Snapshot (Copied to eu-west-2)**
```bash
# List available snapshots in DR region:
aws rds describe-db-snapshots \
  --region eu-west-2 \
  --db-instance-identifier lons-postgres-prod \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'

# Restore from most recent snapshot:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-prod-dr \
  --db-snapshot-identifier lons-postgres-prod-20260329-0200 \
  --db-instance-class db.r6g.xlarge \
  --multi-az \
  --region eu-west-2

# Wait for restoration (~15–30 minutes):
aws rds wait db-instance-available \
  --db-instance-identifier lons-postgres-prod-dr \
  --region eu-west-2
```

**Step 3: Restore ElastiCache Redis**
```bash
# Create new Redis cluster in DR region:
aws elasticache create-replication-group \
  --replication-group-description "Redis DR lons-prod" \
  --replication-group-id lons-redis-prod-dr \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r6g.xlarge \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --region eu-west-2

# Wait for creation (~10–15 minutes):
aws elasticache wait replication-group-available \
  --replication-group-id lons-redis-prod-dr \
  --region eu-west-2
```

**Step 4: Deploy EKS Cluster (or activate standby)**
```bash
# If standby cluster is running:
# Scale up node groups:
aws eks update-nodegroup-config \
  --cluster-name lons-eks-prod \
  --nodegroup-name lons-prod-nodegroup \
  --scaling-config minSize=3,desiredSize=5,maxSize=20 \
  --region eu-west-2

# If no standby cluster exists:
# Run Terraform to create EKS:
cd infrastructure/terraform
terraform apply -target module.eks -var region=eu-west-2

# Wait for cluster creation (~20–30 minutes):
aws eks describe-cluster \
  --name lons-eks-prod \
  --region eu-west-2 \
  --query 'cluster.status'
```

**Step 5: Deploy Application to EKS (DR Region)**
```bash
# Configure kubectl to use DR cluster:
aws eks update-kubeconfig \
  --name lons-eks-prod \
  --region eu-west-2

# Create namespaces and secrets:
kubectl create namespace lons-prod
kubectl create secret generic db-credentials \
  --from-literal=DATABASE_URL="postgresql://lonsadmin:...@lons-postgres-prod-dr.c123456.eu-west-2.rds.amazonaws.com:5432/lons" \
  -n lons-prod
kubectl create secret generic redis-auth \
  --from-literal=redis-url="redis://${REDIS_ENDPOINT}:6379" \
  -n lons-prod

# Deploy applications via ArgoCD or kubectl:
helm install lons-platform infrastructure/helm/lons \
  --namespace lons-prod \
  --values values-prod-dr.yaml

# Wait for all pods to be ready (~5–10 minutes):
kubectl wait --for=condition=ready pod -l app=graphql-server -n lons-prod --timeout=300s
```

**Step 6: Update DNS to Point to DR Region**
```bash
# Update Route53 record:
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "lons.io",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z12345678ABCDE",
            "DNAMEName": "lons-alb-prod-dr-12345.eu-west-2.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'

# DNS propagation: 5–60 minutes (typically 5–10 minutes)
# Clients will start connecting to DR region once propagated
```

**Step 7: Validate DR Platform**
```bash
# Test connectivity (wait for DNS propagation):
curl -X GET https://lons.io/health
# Should return 200 OK

# Verify database data:
curl -X POST https://lons.io/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ customers(first: 1) { totalCount } }"}'
# Should return customer count

# Monitor logs for errors:
kubectl logs -n lons-prod deployment/graphql-server --tail=50
```

**Step 8: Run Smoke Tests**
```bash
# Test critical flows:
# - Customer signup
# - Loan request creation
# - Repayment submission
# - Report generation

# If all tests pass: declare DR activation complete
# Post to Slack: "DR activation complete, platform now running in eu-west-2"
```

**RTO:** 45–120 minutes (depends on whether standby EKS exists)
- **With standby EKS:** ~45 minutes (RDS + Redis restoration + DNS)
- **Without standby EKS:** ~120 minutes (add 30–45 minutes for cluster creation)

---

### 4.5 Scenario 5: Data Corruption or Accidental Deletion

**Detection:**
- Data validation check fails (row counts, checksums).
- Application reports inconsistent state (e.g., ledger entries don't balance).
- Customer complaint: "Missing transaction" or "Duplicate charge".

**Impact:**
- Data integrity compromised.
- Potential financial impact (incorrect balances, missing payments).
- Must recover to last known-good point in time (< 1 hour old).

**Recovery Steps:**

**Step 1: Identify Corruption Time Window**
```bash
# Query transaction log for anomalies:
SELECT operation, timestamp, user_id, table_name, row_count
FROM audit_log
WHERE timestamp > '2026-03-29 14:00:00'
ORDER BY timestamp DESC
LIMIT 20;

# Determine last known-good state:
# If corruption discovered at 15:30, use 14:30 as recovery point (1 hour back)
```

**Step 2: Enable Read-Only Mode (Prevent Further Writes)**
```bash
# Block application writes immediately:
# Kill all write transactions:
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'lonsadmin'  -- Only kill app connections, not your session
AND query_start < now() - interval '1 minute';

# Set database to read-only:
ALTER DATABASE lons SET default_transaction_read_only = on;
```

**Step 3: Point-in-Time Recovery (PITR)**
```bash
# Use RDS automated backup to restore to a specific point in time:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-prod-pitr \
  --db-snapshot-identifier lons-postgres-prod-20260329-1400 \
  --restore-time "2026-03-29T14:30:00Z" \
  --db-instance-class db.r6g.xlarge \
  --multi-az

# WAL logs must be available for PITR to work
# If WAL logs are not retained, restore to last snapshot (may lose ~1 hour of data)
```

**Step 4: Verify Recovered Data**
```bash
# Connect to PITR instance:
psql -h lons-postgres-prod-pitr.c123456.eu-west-1.rds.amazonaws.com \
  -U lonsadmin -d lons

# Run integrity checks:
SELECT COUNT(*) FROM customers;  -- Should match known count
SELECT COUNT(*) FROM loan_requests;
SELECT COUNT(*) FROM ledger_entries;

-- Verify ledger balance (all entries should sum to 0):
SELECT SUM(debit - credit) FROM ledger_entries;  -- Should be 0

-- Check for duplicate transactions:
SELECT transaction_id, COUNT(*)
FROM ledger_entries
GROUP BY transaction_id
HAVING COUNT(*) > 1;  -- Should return empty
```

**Step 5: Swap PITR as Primary**
```bash
# Once verified, rename PITR instance to original name:
aws rds modify-db-instance \
  --db-instance-identifier lons-postgres-prod-pitr \
  --new-db-instance-identifier lons-postgres-prod \
  --apply-immediately

# Or keep both and update connection string:
aws secretsmanager update-secret \
  --secret-id lons-postgres-prod-credentials \
  --secret-string '{...,"host":"lons-postgres-prod-pitr.c123456.eu-west-1.rds.amazonaws.com",...}'

# Restart application:
kubectl rollout restart deployment -n lons-prod
```

**Step 6: Delete Corrupted Instance**
```bash
# After 24-hour observation period:
aws rds delete-db-instance \
  --db-instance-identifier lons-postgres-prod-old \
  --final-db-snapshot-identifier lons-postgres-prod-corruption-final-${DATE}
```

**RTO:** 10–30 minutes (PITR restore + verification)

---

## DR Runbook

### 5.1 Quick Reference: Decision Tree

```
Is the platform down?
├─ No → Monitor and alert on slowness
└─ Yes
   ├─ Is the primary region reachable?
   │  ├─ No → Region failure (Scenario 4)
   │  │      └─ Activate DR region (see 4.4)
   │  │
   │  └─ Yes → Service failure
   │     ├─ Can RDS be reached?
   │     │  ├─ No → RDS failure (Scenario 2)
   │     │  │      └─ Restore from snapshot (see 4.2)
   │     │  │
   │     │  └─ Yes → Can Redis be reached?
   │     │     ├─ No → Redis failure (Scenario 3)
   │     │     │      └─ Create new Redis cluster (see 4.3)
   │     │     │
   │     │     └─ Yes → EKS or application issue
   │     │            └─ Restart pods / Redeploy (standard ops)
   │
   ├─ Is data valid?
   │  ├─ No → Data corruption (Scenario 5)
   │  │      └─ Point-in-time recovery (see 4.5)
   │  │
   │  └─ Yes → Proceed with recovery for underlying failure
```

### 5.2 Escalation Path

**L1 (Immediate, On-Call SRE):**
- Verify outage (not local ISP)
- Check AWS Status dashboard
- Verify backups are current
- Initiate L2 escalation if RDS or region failure

**L2 (On-Call DBA + Platform Lead):**
- Assess recovery vs. waiting for AWS repair
- Decide: restore RDS snapshot, activate DR, or PITR
- Execute recovery procedure
- Notify leadership and customers

**L3 (CTO + AWS Support):**
- Open AWS Support case (if infrastructure issue)
- Coordinate with AWS Account Manager
- Track recovery progress
- Post-incident review

### 5.3 Contact Information

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| On-Call SRE | TBD | +1-XXX-XXX-XXXX | @oncall-sre |
| On-Call DBA | TBD | +1-XXX-XXX-XXXX | @oncall-dba |
| Platform Lead | Emmanuel | +233-XXX-XXX-XXXX | @emmanuel |
| AWS Account Manager | [AWS Contact] | [AWS Phone] | N/A |

---

## Testing Schedule & Validation

### 6.1 Quarterly RDS Snapshot Restore Test

**Objective:** Verify RDS snapshots are valid and data integrity is intact.

**Procedure (45 minutes):**
```bash
# 1. Identify most recent snapshot:
aws rds describe-db-snapshots \
  --db-instance-identifier lons-postgres-${ENVIRONMENT} \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,SnapshotCreateTime]'

# 2. Restore to test environment:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-test-restore \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t4g.medium

# 3. Wait for restoration:
aws rds wait db-instance-available --db-instance-identifier lons-postgres-test-restore

# 4. Run integrity checks:
psql -h <test-endpoint> -U lonsadmin -d lons -c "
  SELECT 'Customers' as table_name, COUNT(*) as row_count FROM customers
  UNION ALL
  SELECT 'Loan Requests', COUNT(*) FROM loan_requests
  UNION ALL
  SELECT 'Ledger Entries', COUNT(*) FROM ledger_entries
  UNION ALL
  SELECT 'Repayments', COUNT(*) FROM repayments;
"

# 5. Compare against production row counts (document expected values):
# Customers: ~10,000
# Loan Requests: ~50,000
# Ledger Entries: ~150,000
# Repayments: ~100,000

# 6. Verify ledger balance:
psql -h <test-endpoint> -U lonsadmin -d lons -c "
  SELECT SUM(debit - credit) as ledger_balance FROM ledger_entries;
"
# Should return 0 or very small variance (< 0.01)

# 7. Delete test instance:
aws rds delete-db-instance \
  --db-instance-identifier lons-postgres-test-restore \
  --skip-final-snapshot

# 8. Document results in test log
```

**Acceptance Criteria:**
- Restoration completes without errors
- Row counts match expected ranges (within 5%)
- Ledger balance is 0 or < 0.01
- No data corruption detected

**Failure Action:**
- If restoration fails, investigate snapshot validity
- If row counts are wrong, check backup log for truncation
- If ledger doesn't balance, escalate to data integrity team

---

### 6.2 Semi-Annual Full DR Drill (Simulated Region Failure)

**Objective:** Validate end-to-end DR activation, including EKS failover, DNS cutover, and application recovery.

**Procedure (4 hours, in staging environment):**

```bash
# 1. Notify team: "Starting DR drill in staging, expect staging outage for 4 hours"

# 2. Snapshot current staging RDS:
aws rds create-db-snapshot \
  --db-instance-identifier lons-postgres-staging \
  --db-snapshot-identifier lons-postgres-staging-dr-drill-$(date +%Y%m%d)

# 3. Copy snapshot to DR region:
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:eu-west-1:546854093923:snapshot:lons-postgres-staging-dr-drill-20260329 \
  --target-db-snapshot-identifier lons-postgres-staging-dr-drill-20260329 \
  --target-region eu-west-2

# 4. Deploy RDS to DR region from snapshot:
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-staging-dr \
  --db-snapshot-identifier arn:aws:rds:eu-west-2:546854093923:snapshot:lons-postgres-staging-dr-drill-20260329 \
  --region eu-west-2

# 5. Create Redis in DR region:
terraform apply -target module.elasticache -var region=eu-west-2

# 6. Deploy EKS in DR region (if not already standing):
terraform apply -target module.eks -var region=eu-west-2

# 7. Deploy application:
helm install lons-staging infrastructure/helm/lons -f values-staging-dr.yaml

# 8. Test application:
curl -X GET https://staging-dr.lons.io/health
# Should return 200

# 9. Run smoke tests:
# - Create customer
# - Submit loan request
# - Process payment
# Document results

# 10. Run performance tests:
# Load test with 100 concurrent users for 10 minutes
# Target: < 500ms p99 latency, > 95% success rate

# 11. Cleanup:
terraform destroy -target module.elasticache -var region=eu-west-2
terraform destroy -target module.eks -var region=eu-west-2
aws rds delete-db-instance --db-instance-identifier lons-postgres-staging-dr --skip-final-snapshot

# 12. Document results and lessons learned
```

**Acceptance Criteria:**
- RDS restoration: < 20 minutes
- EKS cluster creation: < 30 minutes
- Application deployment: < 10 minutes
- Application health checks pass
- Smoke tests complete successfully
- Performance meets SLA (p99 < 500ms)

**Failure Actions:**
- If RDS restore fails: investigate snapshot integrity
- If EKS deploy fails: check subnet/security group config
- If app fails to start: verify secrets and configs
- If tests fail: identify and fix issues before next quarter

---

### 6.3 Annual Tabletop Exercise

**Objective:** Test team coordination, communication, and decision-making during a major outage.

**Scenario:** Complete region failure, simulated via communications only (no actual outage).

**Participants:** Incident Commander, SREs, DBAs, Platform Lead, Comms Lead

**Procedure (2 hours):**

1. **Incident Commander** announces: "Region eu-west-1 is down, all services unavailable."
2. **Comms Lead** posts status updates to customers.
3. **L1 SRE** assesses situation (simulated).
4. **L2 DBA** initiates RDS restore from snapshot.
5. **L3 Platform Lead** makes decision: restore vs. wait for AWS repair.
6. **Team** coordinates DNS cutover, application deployment.
7. **Validation:** Team verifies platform is operational in DR region.
8. **Post-Mortem:** Discuss what went well, what to improve.

**Expected Outcomes:**
- Team can execute full DR activation in < 4 hours
- Communication is clear and timely
- Decision-making process is defined and followed
- Gaps identified and added to backlog

---

## Monitoring & Alerting

### 7.1 Backup Monitoring

**CloudWatch Alarms:**
- `lons-${ENVIRONMENT}-backup-job-failed`: AWS Backup job failed
- `lons-${ENVIRONMENT}-rds-snapshot-copy-failed`: RDS snapshot copy to DR region failed
- `lons-${ENVIRONMENT}-rds-backup-overdue`: No backup created in 25 hours

**Validation:**
- Daily: Check AWS Backup console for successful backups
- Weekly: Verify snapshot copies to DR region (check copy completion)
- Monthly: Restore snapshot to test environment

### 7.2 RDS Monitoring

**CloudWatch Metrics:**
- `CPUUtilization`: Alert if > 85% for > 5 min
- `DatabaseConnections`: Alert if > 80 for > 5 min
- `FreeStorageSpace`: Alert if < 5 GB
- `RDSEvents`: Monitor for failover, patch, maintenance

**Custom Metrics:**
- Slow queries (log metric filter): Alert if > 50 in 5 min
- Replication lag (if read replicas): Alert if > 1 second
- Transaction duration (p99): Alert if > 5 seconds

### 7.3 Redis Monitoring

**CloudWatch Metrics:**
- `CPUUtilization`: Alert if > 75%
- `DatabaseMemoryUsagePercentage`: Alert if > 90%
- `Evictions`: Alert if > 0
- `ReplicationLag`: Alert if > 10 ms

**Custom Metrics:**
- Queue depth (BullMQ): Alert if > 10,000 jobs
- Job processing time: Alert if p99 > 30 seconds

### 7.4 Backup Notification Configuration

```bash
# Subscribe to SNS topic for backup alerts:
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:546854093923:lons-prod-backup-notifications \
  --protocol email \
  --notification-endpoint on-call-sre@lons.io

# Also subscribe via SMS for critical failures:
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:546854093923:lons-prod-backup-notifications \
  --protocol sms \
  --notification-endpoint +233XXXXXXXXX
```

---

## Communication Plan

### 8.1 Outage Notification Sequence

| Time | Channel | Message |
|------|---------|---------|
| T+0 | Slack #outages-lons | "🚨 Platform outage detected, investigating" |
| T+5 | Status Page | "We're investigating platform unavailability" |
| T+10 | Email + SMS | "Platform outage affecting all services" |
| T+30 | Status Page | "Estimated recovery: 2 hours, restore in progress" |
| T+60 | Slack + Email | "DR activation in progress, expect failover" |
| T+120 | Slack + Status Page | "Platform recovered in DR region" |
| T+Recovery | Status Page | "All systems operational, running in DR region" |

### 8.2 Customer Communication Template

```
Subject: [RESOLVED] Platform Outage — Service Restored

Dear Valued Customers,

We experienced a brief platform outage on [DATE] from [TIME] to [TIME] UTC,
affecting all Lōns services. We sincerely apologize for the disruption.

WHAT HAPPENED:
[Brief description of root cause, without technical jargon]

RESOLUTION:
[We restored service from backups / Failed over to DR region]

IMPACT:
[~1 hour of downtime, no data loss, all transactions recovered]

NEXT STEPS:
[We conducted a post-mortem and identified improvements to prevent recurrence]

If you have questions, please contact support@lons.io or your account manager.

Thank you for your patience.
— The Lōns Team
```

---

## Post-Incident Review

### 9.1 Post-Mortem Process

Within **24 hours** of incident resolution:

1. **Document Timeline:**
   - Detection time (T+0)
   - Escalation times
   - Recovery steps and duration
   - Resolution time

2. **Root Cause Analysis:**
   - What failed?
   - Why did it fail?
   - What was the impact?

3. **Lessons Learned:**
   - What went well?
   - What could be improved?
   - Were runbooks accurate?

4. **Action Items:**
   - Automation opportunities
   - Documentation gaps
   - Process improvements
   - Training needs

5. **Metrics:**
   - Incident duration
   - Data loss (if any)
   - Customer impact
   - MTTR (mean time to recovery)

### 9.2 Post-Mortem Template

```
# Incident Post-Mortem: [Incident Name]

**Date:** 2026-03-29
**Duration:** 45 minutes
**Severity:** Critical
**Attendees:** [Names]

## Timeline
- 14:30 UTC: Monitoring alert triggered (RDS CPU spike)
- 14:35 UTC: L1 SRE escalates to L2 DBA
- 14:40 UTC: RDS failover initiated
- 14:45 UTC: Services recovered, no data loss
- 15:00 UTC: All health checks passing

## Root Cause
[What happened and why]

## Lessons Learned
- [What went well]
- [What could be improved]

## Action Items
- [ ] [Action 1] — Due: [Date]
- [ ] [Action 2] — Due: [Date]
- [ ] [Action 3] — Due: [Date]

## Metrics
- **MTTR:** 15 minutes
- **Data Loss:** 0 bytes
- **Customer Impact:** 500 active users, ~100 transactions affected
```

---

## Appendix: Contact Information & Resources

### A.1 Important Links

- **AWS Console:** https://console.aws.amazon.com (Account: 546854093923)
- **CloudWatch Dashboard:** https://console.aws.amazon.com/cloudwatch/home?region=eu-west-1#dashboards:name=lons-prod-database
- **AWS RDS Console:** https://console.aws.amazon.com/rds/home?region=eu-west-1
- **AWS Backup Console:** https://console.aws.amazon.com/backup/home?region=eu-west-1
- **Kubernetes Dashboard:** https://console.aws.amazon.com/eks/home?region=eu-west-1#/clusters
- **Status Page:** https://status.lons.io
- **GitHub Repo:** https://github.com/lons/platform

### A.2 Emergency Contacts

| Role | Name | Email | Phone | Slack |
|------|------|-------|-------|-------|
| CTO | Emmanuel | emmanuel@lons.io | +233-XXX-XXXX | @emmanuel |
| Head of Infrastructure | [Name] | [Email] | [Phone] | @infra-lead |
| On-Call SRE | [Rotation] | [Email] | [Phone] | @oncall-sre |
| On-Call DBA | [Rotation] | [Email] | [Phone] | @oncall-dba |
| AWS Account Manager | [Name] | [Email] | [Phone] | N/A |

### A.3 Runbook Commands (Copy-Paste Ready)

See sections 4.1–4.5 for full runbooks with commands.

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-29 | Cloud Team | Initial draft |

---

**Last Updated:** March 29, 2026
**Next Review Date:** June 29, 2026 (Quarterly)
**Document Owner:** Cloud Infrastructure Team
**Approval:** CTO (Emmanuel)
