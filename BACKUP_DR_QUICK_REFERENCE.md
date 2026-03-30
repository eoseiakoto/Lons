# Lōns Backup & DR — Quick Reference Guide

**For Emergency Use — Keep Accessible**

---

## Emergency Contacts (Section 8.2 of DR Plan)

| Role | Contact | Backup |
|------|---------|--------|
| On-Call SRE | @oncall-sre | [Phone] |
| On-Call DBA | @oncall-dba | [Phone] |
| CTO | @emmanuel | [Phone] |

---

## Decision Tree: What to Do When Platform is Down

```
Is platform down?
├─ Can you SSH to an EKS node?
│  └─ Yes → It's an application issue, restart pods
│     kubectl rollout restart deployment -n lons-${ENV}
│
└─ No → Infrastructure failure
   ├─ Can you reach AWS Console?
   │  ├─ No → Region failure (Scenario 4, see below)
   │
   │  └─ Yes → Check CloudWatch
   │     ├─ RDS status = down → RDS failure (Scenario 2)
   │     ├─ Redis status = down → Redis failure (Scenario 3)
   │     └─ Both down → Check for data corruption (Scenario 5)
```

---

## Scenario 1: Single AZ Failure — Automatic

**Duration:** 2–5 minutes (automatic)

- EKS Auto Scaling Group launches replacement node
- RDS Multi-AZ failover occurs automatically
- No action required
- Monitor CloudWatch dashboard for pod rescheduling

---

## Scenario 2: RDS Failure — Manual Snapshot Restore

**Duration:** 15–30 minutes

```bash
# 1. Get the latest snapshot
aws rds describe-db-snapshots \
  --db-instance-identifier lons-postgres-${ENV} \
  --query 'DBSnapshots[0].DBSnapshotIdentifier'

# 2. Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-${ENV}-restored \
  --db-snapshot-identifier <snapshot-arn> \
  --db-instance-class db.r6g.xlarge \
  --multi-az

# 3. Wait for restoration (10–15 minutes)
aws rds wait db-instance-available --db-instance-identifier lons-postgres-${ENV}-restored

# 4. Update connection string in Secrets Manager
aws secretsmanager update-secret \
  --secret-id lons-postgres-${ENV}-credentials \
  --secret-string '{"host":"<new-endpoint>","password":"<new-pass>",...}'

# 5. Restart application pods
kubectl rollout restart deployment -n lons-${ENV}

# 6. Verify database is accessible
curl -X GET http://lons-api.${ENV}.lons.io/health
```

---

## Scenario 3: Redis Failure — Manual Cluster Restore

**Duration:** 5–10 minutes

```bash
# 1. Delete failed cluster
aws elasticache delete-replication-group \
  --replication-group-id lons-redis-${ENV} \
  --skip-final-snapshot

# 2. Create new cluster
terraform apply -target module.elasticache -var environment=${ENV}

# 3. Update Redis connection in Kubernetes
kubectl create secret generic redis-auth \
  --from-literal=redis-url="redis://<new-endpoint>:6379" \
  -n lons-${ENV} --dry-run=client -o yaml | kubectl apply -f -

# 4. Restart application
kubectl rollout restart deployment -n lons-${ENV}
```

---

## Scenario 4: Complete Region Failure — DR Activation

**Duration:** 45–120 minutes (manual coordination required)

### Quick Steps (High-Level)

```bash
# Phase 1: Restore Database (15–20 min)
aws rds restore-db-instance-from-db-snapshot \
  --region eu-west-2 \
  --db-instance-identifier lons-postgres-${ENV}-dr \
  --db-snapshot-identifier <snapshot-in-eu-west-2>

# Phase 2: Create Redis (10–15 min)
aws elasticache create-replication-group \
  --region eu-west-2 \
  --replication-group-id lons-redis-${ENV}-dr \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r6g.xlarge \
  --num-cache-clusters 3 \
  --automatic-failover-enabled

# Phase 3: Deploy EKS (20–30 min) or scale existing
terraform apply -target module.eks -var region=eu-west-2

# Phase 4: Deploy Application (5–10 min)
helm install lons-platform infrastructure/helm/lons \
  -f values-${ENV}-dr.yaml -n lons-${ENV}

# Phase 5: Update DNS (5–10 min, but DNS propagation takes 5–60 min)
# Go to Route53 console and update lons.io A record to point to eu-west-2 ALB

# Phase 6: Verify Application
curl -X GET https://lons.io/health  # After DNS propagates
```

### Full Runbook
See **Docs/DISASTER-RECOVERY-PLAN.md § 4.4** for detailed steps with commands.

---

## Scenario 5: Data Corruption — Point-in-Time Recovery

**Duration:** 10–30 minutes

```bash
# 1. Enable read-only mode (prevent writes)
ALTER DATABASE lons SET default_transaction_read_only = on;

# 2. Restore to point in time (up to 1 hour ago)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-${ENV}-pitr \
  --db-snapshot-identifier <recent-snapshot> \
  --restore-time "2026-03-29T14:30:00Z"

# 3. Verify data integrity
psql -h lons-postgres-${ENV}-pitr.c123456.eu-west-1.rds.amazonaws.com \
  -U lonsadmin -d lons -c "SELECT SUM(debit - credit) FROM ledger_entries;"
# Should return 0

# 4. Swap as primary
aws rds modify-db-instance \
  --db-instance-identifier lons-postgres-${ENV}-pitr \
  --new-db-instance-identifier lons-postgres-${ENV} \
  --apply-immediately

# 5. Restart application
kubectl rollout restart deployment -n lons-${ENV}
```

---

## Monitoring — What to Watch

### Daily
- [ ] Check AWS Backup console — backups completed?
- [ ] Check CloudWatch dashboard — slow queries < 10?
- [ ] Check SNS — any alerts overnight?

### Weekly
- [ ] Verify RDS snapshot copy to eu-west-2 completed
- [ ] Check RDS CPU/connections/storage metrics
- [ ] Check Redis memory and evictions

### Monthly
- [ ] Restore RDS snapshot to staging, run integrity checks
- [ ] Test slow query alert (manually execute slow query)

### Quarterly (Scheduled Test)
- [ ] Full RDS restore test
- [ ] Verify data integrity
- [ ] Document results

---

## Key Commands (Copy-Paste)

### Get Latest RDS Snapshot
```bash
aws rds describe-db-snapshots \
  --db-instance-identifier lons-postgres-${ENV} \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --region eu-west-1
```

### Restore RDS from Snapshot
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-postgres-${ENV}-restored \
  --db-snapshot-identifier <snapshot-arn> \
  --db-instance-class db.r6g.xlarge \
  --multi-az \
  --region eu-west-1
```

### Check Restoration Progress
```bash
aws rds describe-db-instances \
  --db-instance-identifier lons-postgres-${ENV}-restored \
  --query 'DBInstances[0].[DBInstanceStatus,PercentProgress]' \
  --region eu-west-1
```

### Get RDS Endpoint
```bash
aws rds describe-db-instances \
  --db-instance-identifier lons-postgres-${ENV}-restored \
  --query 'DBInstances[0].Endpoint.Address' \
  --region eu-west-1
```

### Update Secrets Manager
```bash
aws secretsmanager update-secret \
  --secret-id lons-postgres-${ENV}-credentials \
  --secret-string $(cat <<EOF
{
  "username": "lonsadmin",
  "password": "$(aws secretsmanager get-random-password --query 'RandomPassword' --output text)",
  "host": "$(aws rds describe-db-instances --db-instance-identifier lons-postgres-${ENV}-restored --query 'DBInstances[0].Endpoint.Address' --output text)",
  "port": 5432,
  "dbname": "lons"
}
EOF
)
```

### Restart Kubernetes Deployment
```bash
kubectl rollout restart deployment/graphql-server \
  deployment/rest-server \
  deployment/scheduler \
  -n lons-${ENV}
```

### Check Pod Status
```bash
kubectl get pods -n lons-${ENV} -o wide
```

### Check Application Health
```bash
curl -X GET http://lons-api.${ENV}.lons.io/health -v
```

---

## SNS Topic Subscription (First-Time Setup)

```bash
# Subscribe yourself to alerts (you should already be subscribed)
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:546854093923:lons-${ENV}-db-alerts \
  --protocol email \
  --notification-endpoint your.email@lons.io

# Also add SMS for critical failure
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-1:546854093923:lons-${ENV}-db-alerts \
  --protocol sms \
  --notification-endpoint +233XXXXXXXXX
```

---

## Terraform Commands (Deployment)

```bash
# Initialize Terraform
cd infrastructure/terraform
terraform init

# Plan backup module
terraform plan -target module.backup -var environment=${ENV}

# Apply backup module
terraform apply -target module.backup -var environment=${ENV}

# Check outputs
terraform output backup_vault_arn
terraform output db_alerts_topic_arn
```

---

## Testing Checklist

### Before Going Live

- [ ] Backup module Terraform validates (no errors)
- [ ] AWS Backup vault created and accessible
- [ ] Backup plan has 2 rules (daily + monthly)
- [ ] RDS backup selection includes target RDS instance
- [ ] CloudWatch metric filter created for slow queries
- [ ] CloudWatch alarms created (3 alarms: warning, critical, CPU)
- [ ] SNS topic created and subscribed
- [ ] Slow query log streaming verified in CloudWatch Logs

### First Week

- [ ] Daily backup completes successfully
- [ ] SNS notification received when backup completes
- [ ] Slow query alarm triggered (run a test slow query)
- [ ] RDS CPU alarm triggered (run a test load)
- [ ] CloudWatch dashboard displays all metrics

### Monthly

- [ ] Restore RDS snapshot to test instance
- [ ] Verify data integrity (row counts, checksums)
- [ ] Delete test instance
- [ ] Document results

---

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Slow query alarm always fires | Increase threshold, or check query optimization |
| No backup created | Verify backup plan and IAM role permissions |
| RDS snapshot copy failed | Check DR region backup vault exists, KMS key accessible |
| Application can't connect after restore | Update connection string in Secrets Manager, restart pods |
| Data doesn't match after restore | Check WAL archive enabled, verify restore point in time |

---

## Links & References

- **AWS Backup Console:** https://console.aws.amazon.com/backup/home?region=eu-west-1
- **RDS Console:** https://console.aws.amazon.com/rds/home?region=eu-west-1
- **CloudWatch Dashboards:** https://console.aws.amazon.com/cloudwatch/home?region=eu-west-1#dashboards:
- **SNS Topics:** https://console.aws.amazon.com/sns/v3/home?region=eu-west-1#/topics
- **Full DR Plan:** `Docs/DISASTER-RECOVERY-PLAN.md`
- **Implementation Summary:** `BACKUP_DR_IMPLEMENTATION_SUMMARY.md`

---

**Keep this guide in Slack/Confluence for quick reference during incidents.**

Last Updated: 2026-03-29
