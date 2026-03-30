# Lōns Platform — Incident Response Procedure & Runbooks

**Document Version:** 1.0
**Last Updated:** March 2026
**Author:** Operations Team
**Status:** Active

---

## Table of Contents

1. [Severity Definitions](#severity-definitions)
2. [Escalation Path](#escalation-path)
3. [Communication Templates](#communication-templates)
4. [Incident Management Process](#incident-management-process)
5. [Runbooks](#runbooks)
   - [RB-1: Service Restart](#rb-1-service-restart)
   - [RB-2: RDS Failover](#rb-2-rds-failover)
   - [RB-3: Redis Failover](#rb-3-redis-failover)
   - [RB-4: Tenant Provisioning (Manual)](#rb-4-tenant-provisioning-manual)
   - [RB-5: Key Rotation (Emergency)](#rb-5-key-rotation-emergency)
   - [RB-6: Backup Restore](#rb-6-backup-restore)
   - [RB-7: Scaling Response](#rb-7-scaling-response)
   - [RB-8: Certificate Emergency](#rb-8-certificate-emergency)
6. [Maintenance Window Process](#maintenance-window-process)
7. [AlertManager Routing Configuration](#alertmanager-routing-configuration)
8. [Post-Incident Review](#post-incident-review)
9. [On-Call Rotation](#on-call-rotation)

---

## Severity Definitions

### Incident Severity Levels

| Level | Description | Response Time | Escalation | Example | Page On-Call? |
|-------|-------------|---------------|------------|---------|---------------|
| **SEV1** | Platform down, all tenants affected | 15 min | Immediate PagerDuty→Emmanuel | Complete EKS cluster failure, all RDS replicas down, database inaccessible | YES — Immediate |
| **SEV2** | Major feature degraded, >50% tenants | 30 min | PagerDuty→Emmanuel (via AlertManager) | Disbursement pipeline stuck, scoring service timeout, GraphQL API returning 5xx errors | YES — 30 min |
| **SEV3** | Minor feature degraded, <50% tenants | 2 hours | Slack #lons-incidents | Single tenant configuration error, slow dashboard queries (>5s), non-critical worker delayed | NO — Slack alert |
| **SEV4** | Cosmetic/low impact, no user impact | Next business day | Slack #lons-alerts | Dashboard rendering issue, typo in email, unused warning log | NO — Daily digest |

### Severity Assignment Rules

When an incident occurs, use this decision tree to assign severity:

1. **Is the platform completely down (no traffic flowing)?** → SEV1
2. **Can users not access any critical feature (login, apply for loan, repay)?** → SEV1
3. **Is >50% of tenants experiencing degradation or errors?** → SEV2
4. **Is <50% of tenants experiencing degradation?** → SEV3
5. **Is it a UX issue, typo, or non-critical alert?** → SEV4

**Note:** If unsure, escalate to SEV2 and de-escalate after investigation.

---

## Escalation Path

### Severity-Based Escalation Chain

**SEV4 (Low Priority):**
- Alert → Slack `#lons-alerts`
- Response: Investigate during next sprint, log as issue
- No escalation required

**SEV3 (Medium Priority):**
- Alert → Slack `#lons-incidents`
- On-duty engineer: Read message within 2 hours
- Response: Diagnose issue, implement fix or escalate to SEV2 within 4 hours
- If unresolved after 4 hours → escalate to SEV2

**SEV2 (High Priority):**
- Alert → PagerDuty (triggered by AlertManager on `critical` severity)
- On-call engineer: Acknowledge within 30 minutes
- Escalate to Emmanuel (project lead) if not resolved within 30 minutes
- War room: Slack call in `#lons-incidents` + conference bridge (details in on-call schedule)
- Target resolution: 4 hours from detection

**SEV1 (Critical/Platform Down):**
- Alert → PagerDuty (triggered immediately)
- On-call engineer: Acknowledge within 15 minutes
- Immediately page Emmanuel (project lead) + all on-call engineers
- War room: Video call + Slack `#lons-incidents` updates every 5 minutes
- Target resolution: Restore service within 30 minutes or initiate Disaster Recovery within 60 minutes

### Escalation Contacts (At Launch)

| Role | Contact | Status |
|------|---------|--------|
| **Project Lead (Emmanuel)** | TBD | To be provisioned |
| **On-Call Engineer** | PagerDuty rotation | Single on-call at launch |
| **Slack Workspace** | `#lons-incidents` | To be provisioned |
| **PagerDuty Service** | `lons-platform` | To be configured |
| **Conference Bridge** | TBD | To be provisioned (war room) |

---

## Communication Templates

### 1. Internal Incident Alert (Slack)

**Format for #lons-incidents channel:**

```
🚨 [SEV{X}] {SERVICE_NAME} — {BRIEF_DESCRIPTION}

Status: INVESTIGATING
Impact: {AFFECTED_TENANTS} tenant(s) / {AFFECTED_FEATURE}
Detection Time: {TIMESTAMP_UTC}
Owner: @{ENGINEER_NAME}

Latest Update: {UPDATE_TEXT}
ETA to Resolution: {ESTIMATE}

Runbook: {LINK_TO_RUNBOOK}
Dashboard: {GRAFANA_LINK}
Logs: {CLOUDWATCH_LINK}
```

**Update Pattern:** Post update every 10 minutes (SEV1/2) or 30 minutes (SEV3)

**Resolution Message:**

```
✅ [SEV{X}] {SERVICE_NAME} — RESOLVED

Resolution: {WHAT_WAS_DONE}
Duration: {TIME_FROM_START_TO_RESOLUTION}
Root Cause: {BRIEF_EXPLANATION}

Post-incident review scheduled: {DATE/TIME}
```

### 2. Tenant Notification Email (When Impacted Tenants < 100%)

**Subject:** `Lōns Platform Incident — Service Degradation (SEV{X})`

```
Dear {TENANT_NAME},

We are currently experiencing a service issue that may affect your loan origination and repayment operations.

Incident Details:
- Affected Feature: {FEATURE_NAME}
- Expected Impact: {DESCRIPTION}
- Status: {INVESTIGATING | RESOLVING}
- Expected Resolution Time: {TIMESTAMP_UTC}

What we're doing:
- Our team is actively investigating the root cause
- We are prioritizing restoration of your service
- We will provide updates every 15 minutes

What you can do:
- Monitor your dashboard at https://admin.lons.io
- Contact support: support@lons.io or WhatsApp +233XX-XXXX-XXX (pending)

We apologize for the inconvenience and appreciate your patience.

Best regards,
Lōns Operations Team
```

**SMS Option (if critical):**
```
Lōns: We're currently addressing an issue affecting loan processing. We're working to restore service. Next update in 15 min. https://status.lons.io
```

### 3. Platform-Wide Status Announcement (SEV1 or >50% tenants)

**To:** All tenants via email + SMS (if available)

```
PLATFORM-WIDE INCIDENT NOTIFICATION

We are currently experiencing a critical issue affecting all Lōns platform users.

Status: All features are temporarily unavailable
Expected Resolution Time: {ESTIMATE}

Workaround: {IF_AVAILABLE}

We sincerely apologize for this disruption. We are working urgently to restore service.

Next update: {TIME}
Status Page: https://status.lons.io
Support: support@lons.io
```

---

## Incident Management Process

### Phase 1: Detection & Initial Response (0-15 min)

1. **Alert fires** (automated or manual report)
2. **Severity assigned** (use decision tree above)
3. **On-call paged** (PagerDuty for SEV2+)
4. **Slack message posted** to #lons-incidents (all severities)
5. **War room initiated** (video call for SEV1/2, Slack thread for SEV3)
6. **Runbook selected** (matching the affected service)

### Phase 2: Investigation & Diagnosis (15-60 min)

1. **Confirm symptoms** (not a false alarm)
2. **Identify affected tenants/features**
3. **Check metrics dashboard** (Grafana)
4. **Review logs** (CloudWatch Logs / ELK)
5. **Identify root cause** (service crash, database error, quota, bug)
6. **Determine if DR required** (decision point at 30 min for SEV1)

### Phase 3: Resolution (60 min+)

1. **Execute runbook** (service restart, failover, rollback, etc.)
2. **Verify fix** (health checks, smoke tests, metrics baseline)
3. **Update stakeholders** (Slack message, tenant email if applicable)
4. **Monitor for recurrence** (watch metrics for 15 min post-fix)

### Phase 4: Post-Incident (Within 24 hours)

1. **Publish RCA** (root cause analysis, 1-2 page summary)
2. **Schedule PIR** (post-incident review, 30 min meeting)
3. **Assign follow-ups** (preventive fixes, monitoring improvements)
4. **Update runbooks** if lessons learned
5. **Close ticket** in Jira/Monday

### Incident Lifecycle States

```
OPEN → INVESTIGATING → RESOLVING → MONITORING → RESOLVED → CLOSED
         (15-30 min)   (30-120 min)  (15-60 min)
```

---

## Runbooks

Each runbook includes: **Trigger Conditions → Diagnostic Steps → Resolution Steps → Verification → Rollback Plan**

---

### RB-1: Service Restart

**Trigger Conditions:**
- Pod is CrashLooping (restart count > 3)
- Pod is OOMKilled (memory exhausted)
- Service is hanging/unresponsive (no traffic flowing)
- Worker is stuck processing single job (no progress for >10 min)

**Affected Services:** graphql-server, rest-server, entity-service, repayment-service, notification-worker, etc.

**Estimated Duration:** 2-5 minutes

#### Diagnostic Steps

1. **Check pod status:**
   ```bash
   kubectl get pods -n lons-production -o wide | grep {SERVICE_NAME}
   ```
   Look for: `CrashLoopBackOff`, `OOMKilled`, `Pending`, `NotReady`

2. **Review recent logs:**
   ```bash
   kubectl logs -n lons-production {POD_NAME} --tail=50
   # Or for crashed pod:
   kubectl logs -n lons-production {POD_NAME} --previous
   ```
   Look for: OutOfMemory errors, segfaults, unhandled exceptions, connection timeouts

3. **Check resource requests/limits:**
   ```bash
   kubectl describe pod -n lons-production {POD_NAME} | grep -A 5 "Limits\|Requests"
   ```
   If `memory: OOMKilled`, increase limits in Helm values

4. **Check dependency health:**
   - **Database:** `SELECT 1` (via CloudWatch/RDS console)
   - **Redis:** `redis-cli PING` (via ElastiCache console)
   - **Other services:** Check if upstream services are responding

#### Resolution Steps

**Option A: Rolling Restart (Preferred)**
```bash
# Restart deployment without downtime
kubectl rollout restart deployment/{SERVICE_NAME} -n lons-production

# Monitor restart progress
kubectl rollout status deployment/{SERVICE_NAME} -n lons-production -w
```

**Option B: Force Restart (If Rolling Fails)**
```bash
# Delete pod(s) to force restart
kubectl delete pod -n lons-production {POD_NAME}
# ReplicaSet will spawn replacement

# Monitor new pod:
kubectl get pods -n lons-production -w
```

**Option C: Scale Down & Up (Last Resort)**
```bash
# Scale deployment to 0
kubectl scale deployment/{SERVICE_NAME} --replicas=0 -n lons-production

# Wait 30 seconds
sleep 30

# Scale back up
kubectl scale deployment/{SERVICE_NAME} --replicas=3 -n lons-production
```

#### Verification Steps

1. **Check pod health:**
   ```bash
   kubectl get pods -n lons-production | grep {SERVICE_NAME}
   ```
   Expect: All pods in `Running` state, `READY 1/1`

2. **Verify service readiness:**
   ```bash
   kubectl logs -n lons-production -l app={SERVICE_NAME} --tail=20
   ```
   Look for: "Server listening on port 3000" or similar startup message

3. **Check metrics:**
   - Grafana dashboard for {SERVICE_NAME}
   - Look for: green health indicators, request rate returning to normal
   - Check: error rate is 0%, latency is <500ms

4. **Smoke test:**
   ```bash
   # For GraphQL:
   curl -X POST https://api.lons.io/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{ __typename }"}'

   # Should return: {"data": {"__typename": "Query"}}
   ```

5. **Monitor for recurrence:**
   - Watch logs for 10 minutes
   - Verify restart count stays low
   - If pod crashes again, escalate and move to root cause analysis

#### Rollback Plan

**No rollback needed for restart.** If restart causes new errors:
1. Check new pod logs: `kubectl logs -n lons-production {POD_NAME}`
2. If bad code: `kubectl rollout undo deployment/{SERVICE_NAME} -n lons-production`
3. If infrastructure issue: Scale to 0, investigate, then manually fix and scale back up

---

### RB-2: RDS Failover

**Trigger Conditions:**
- RDS primary database is unreachable
- All connection attempts return "connection timeout" or "connection refused"
- CloudWatch RDS console shows primary in "failed" state
- Failover light in status page is red

**Affected Services:** All (complete loss of data access)

**Severity:** SEV1 (no tenant can operate)

**Estimated Duration:** 5-15 minutes (RDS automated failover)

#### Diagnostic Steps

1. **Verify database is actually down:**
   ```bash
   # From bastion or pod:
   psql postgresql://user:password@lons-prod-primary.xxxxxx.eu-west-1.rds.amazonaws.com:5432/lons \
     -c "SELECT 1"
   ```
   Expect: Either immediate error (connection refused) or timeout

2. **Check RDS console:**
   - AWS Console → RDS → Databases → `lons-production`
   - Look for: Primary instance status, Multi-AZ enabled, failover status

3. **Check security groups:**
   ```bash
   # Verify EKS SG allows egress to RDS SG (port 5432)
   aws ec2 describe-security-groups --group-ids sg-xxx --region eu-west-1
   ```

4. **Check RDS parameter group:**
   - Ensure `max_connections` is set to expected value (e.g., 200)
   - Check `log_statement` (should be `all` or `ddl` for troubleshooting)

5. **Review RDS events:**
   - AWS Console → RDS → Events → filter by `lons-production` instance
   - Look for: "DB instance restarted", "Failover started", "Recovery completed"

#### Resolution Steps

**Option A: Wait for RDS Automatic Failover (Recommended)**

If Multi-AZ is enabled (recommended):
1. RDS automatically detects primary failure
2. Failover to standby replica occurs automatically (2-5 min)
3. No action required from your side
4. Monitor progress in RDS console

**Option B: Manual Failover (If Multi-AZ not enabled)**

```bash
# Request manual failover
aws rds reboot-db-instance \
  --db-instance-identifier lons-production \
  --force-failover \
  --region eu-west-1
```

**Option C: Emergency Restore from Snapshot (If failover fails)**

1. Find latest RDS automated backup:
   ```bash
   aws rds describe-db-snapshots \
     --db-instance-identifier lons-production \
     --region eu-west-1 \
     --query 'DBSnapshots[0]'
   ```

2. Restore to new instance:
   ```bash
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier lons-production-restore \
     --db-snapshot-identifier {SNAPSHOT_ID} \
     --region eu-west-1
   ```

3. Update application connection string:
   ```bash
   # Update secret in Secrets Manager
   aws secretsmanager update-secret \
     --secret-id /lons/production/database \
     --secret-string '{"DATABASE_URL":"postgresql://user:pass@lons-production-restore.xxxxxxx.eu-west-1.rds.amazonaws.com:5432/lons"}'
   ```

4. Restart all services to pick up new connection:
   ```bash
   kubectl rollout restart deployment/graphql-server -n lons-production
   kubectl rollout restart deployment/rest-server -n lons-production
   # ... repeat for all services
   ```

#### Verification Steps

1. **Verify failover completed:**
   - RDS console: Primary instance returns to "available" state
   - Failover indicator in Status Page shows green

2. **Verify connections working:**
   ```bash
   # From application pod
   kubectl exec -it {POD_NAME} -n lons-production -- \
     psql postgresql://user:pass@localhost:5432/lons -c "SELECT COUNT(*) FROM loans"
   ```

3. **Check data consistency:**
   ```bash
   # Run quick validation query
   SELECT COUNT(*) FROM loans WHERE created_at > NOW() - INTERVAL '1 hour';
   SELECT COUNT(*) FROM repayments WHERE created_at > NOW() - INTERVAL '1 hour';
   ```
   Compare counts from before incident (from CloudWatch metrics)

4. **Monitor application metrics:**
   - Grafana: DB connection pool healthy
   - Check: Error rate drops to 0%
   - Verify: Request latency returns to baseline

5. **Check replication lag:**
   ```bash
   # If using read replicas
   SELECT pg_last_xlog_receive_location(), pg_last_xlog_replay_location();
   # Expect: Both to be same or very close
   ```

#### Rollback Plan

**If failover to new primary causes problems:**

1. **Check new primary logs:**
   ```bash
   # RDS console → Events
   # Look for: replication lag, connection issues
   ```

2. **Immediate rollback (if snapshot restore):**
   - Restore from older, known-good snapshot
   - Accept data loss (evaluate RPO)
   - Resume normal operations

3. **Investigate root cause:**
   - Why did primary fail?
   - Is it coming back online?
   - Should we switch back?

---

### RB-3: Redis Failover

**Trigger Conditions:**
- Redis cluster reports node failures
- BullMQ job queues are backing up (not processing)
- ElastiCache primary cluster is unreachable
- Cache hit rate drops to 0%

**Affected Services:** Job queue processing (notifications, scheduler, repayment batches)

**Severity:** SEV2 (queued operations are delayed, not lost)

**Estimated Duration:** 3-10 minutes (ElastiCache automatic failover)

#### Diagnostic Steps

1. **Verify Redis connectivity:**
   ```bash
   # From pod or bastion
   redis-cli -h {REDIS_ENDPOINT} -p 6379 PING
   ```
   Expect: `PONG`

2. **Check cluster status:**
   ```bash
   redis-cli -h {REDIS_ENDPOINT} -p 6379 CLUSTER INFO
   # Or for non-cluster mode:
   redis-cli -h {REDIS_ENDPOINT} -p 6379 INFO replication
   ```

3. **Check ElastiCache console:**
   - AWS Console → ElastiCache → Clusters → `lons-production-redis`
   - Look for: Node status (green/red), Primary/Replica roles

4. **Monitor BullMQ queue depth:**
   ```bash
   # From application pod
   # Assuming BullMQ is connected
   npm run queue:stats  # Check queue depth
   # Or query Redis directly:
   redis-cli LLEN bull:{queue_name}:jobs
   ```

5. **Check application logs for Redis errors:**
   ```bash
   kubectl logs -n lons-production -l app=notification-worker --tail=100 | grep -i redis
   ```

#### Resolution Steps

**Option A: Wait for Automatic Failover (Recommended)**

If Multi-AZ is enabled:
1. ElastiCache detects primary failure
2. Promotes replica to primary (2-3 min)
3. Services reconnect automatically
4. BullMQ queues resume processing

**Option B: Manual Failover**

```bash
# Test failover
aws elasticache test-failover \
  --replication-group-id lons-production-redis \
  --node-group-id {NODE_GROUP_ID} \
  --region eu-west-1
```

**Option C: Flush Stale Connections (Unblock Immediately)**

```bash
# If failover hangs or connections are stuck
redis-cli -h {REDIS_ENDPOINT} -p 6379 CLIENT KILL TYPE normal
# Force reconnect application pods:
kubectl rollout restart deployment/notification-worker -n lons-production
```

**Option D: Restore from Snapshot (Last Resort)**

```bash
# Create cluster from existing snapshot
aws elasticache create-replication-group \
  --replication-group-description lons-production-redis-restored \
  --engine redis \
  --snapshot-name {SNAPSHOT_NAME} \
  --region eu-west-1
```

#### Verification Steps

1. **Verify Redis health:**
   ```bash
   redis-cli -h {REDIS_ENDPOINT} -p 6379 PING
   redis-cli -h {REDIS_ENDPOINT} -p 6379 INFO stats
   # Look for: uptime_in_seconds increasing, connected_clients > 0
   ```

2. **Verify BullMQ processing resumed:**
   ```bash
   # Check queue length decreasing
   redis-cli LLEN bull:notification:jobs
   # Expect: number should decrease over time
   ```

3. **Check application logs:**
   ```bash
   kubectl logs -n lons-production -l app=notification-worker --tail=50
   # Look for: "queue connected", "job processed", no errors
   ```

4. **Verify metrics:**
   - Grafana: Redis connection pool healthy
   - BullMQ dashboard: jobs flowing through queue
   - No spike in error rates

#### Rollback Plan

**If failover causes issues:**

1. **Check new primary status:**
   - ElastiCache console → node status
   - Verify old replica is now primary

2. **If severe issues:**
   - Flush current Redis data (if acceptable loss):
     ```bash
     redis-cli FLUSHDB
     ```
   - Restart affected services so they re-populate cache
   - Accept delayed job processing for a few minutes

3. **Investigate root cause:**
   - Why did primary fail?
   - Was it memory exhaustion? Check ElastiCache metrics
   - Was it network? Check security groups

---

### RB-4: Tenant Provisioning (Manual)

**Trigger Conditions:**
- New Service Provider (SP) onboarding request
- Tenant configuration needs manual adjustment
- Auto-provisioning failed (rare)

**Affected Services:** Entity service, database

**Severity:** SEV3 (affects single tenant, but planned)

**Estimated Duration:** 15-30 minutes

#### Prerequisites

- Tenant name, country, contact details ready
- Products to offer selected
- API key approval (if needed)
- Domain name reserved (if custom domain requested)

#### Provisioning Steps

1. **Create tenant record:**
   ```bash
   # Connect to database
   psql postgresql://user:pass@{DB_ENDPOINT}:5432/lons

   # Insert tenant (in platform schema)
   INSERT INTO tenants (id, name, country, status, created_at)
   VALUES (gen_random_uuid(), 'Example SP', 'GH', 'ACTIVE', NOW());

   # Capture tenant_id for next steps
   ```

2. **Create tenant schema:**
   ```sql
   -- Create tenant-specific database schema
   CREATE SCHEMA tenant_{tenant_id};

   -- Apply RLS policies
   -- (See schema migrations in Docs/11-data-models.md)
   ```

3. **Configure products for tenant:**
   ```sql
   INSERT INTO products (id, tenant_id, name, product_type, status, created_at)
   VALUES
     (gen_random_uuid(), '{tenant_id}', 'Overdraft Product', 'OVERDRAFT', 'ACTIVE', NOW()),
     (gen_random_uuid(), '{tenant_id}', 'Micro-Loan Product', 'MICRO_LOAN', 'ACTIVE', NOW());
   ```

4. **Generate API credentials:**
   ```bash
   # Using entity-service (GraphQL mutation)
   curl -X POST https://api.lons.io/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer {ADMIN_TOKEN}" \
     -d '{
       "query": "mutation { createApiKey(tenantId: \"{tenant_id}\") { key secret } }"
     }'

   # Capture key and secret
   ```

5. **Configure webhooks (optional):**
   ```bash
   # If tenant wants real-time notifications
   mutation {
     createWebhook(
       tenantId: "{tenant_id}",
       url: "https://tenant.example.com/webhooks/lons",
       events: ["contract.state_changed", "repayment.received"]
     ) {
       id
       url
     }
   }
   ```

6. **Set up tenant monitoring:**
   ```bash
   # Add Grafana datasource for tenant metrics
   # Add CloudWatch alarms for tenant-specific thresholds
   ```

#### Verification Steps

1. **Test API access:**
   ```bash
   curl -X POST https://api.lons.io/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer {API_KEY}" \
     -d '{"query":"{ products { id name } }"}'

   # Expect: List of products created above
   ```

2. **Test dashboard access:**
   - Open https://admin.lons.io
   - Login as tenant admin
   - Verify dashboard loads, products visible

3. **Run health check:**
   ```bash
   # entity-service should recognize new tenant
   curl https://api.lons.io/health -H "X-Tenant-ID: {tenant_id}"
   # Expect: 200 OK
   ```

#### Rollback Plan

**If provisioning fails midway:**

1. **Rollback database:**
   ```sql
   -- Delete tenant record
   DELETE FROM tenants WHERE id = '{tenant_id}';

   -- Drop tenant schema
   DROP SCHEMA IF EXISTS tenant_{tenant_id} CASCADE;
   ```

2. **Revoke API credentials:**
   ```sql
   UPDATE api_keys SET revoked_at = NOW() WHERE tenant_id = '{tenant_id}';
   ```

3. **Remove from monitoring:**
   - Delete Grafana dashboards
   - Delete CloudWatch alarms

4. **Notify tenant:**
   - Email: "Provisioning failed due to [reason]. We will retry on [date]."

---

### RB-5: Key Rotation (Emergency)

**Trigger Conditions:**
- Security compromise detected (key leaked, unauthorized access)
- Key exposure in logs or monitoring systems
- Regulatory requirement for emergency rotation
- Suspicious activity detected (multiple failed auth attempts)

**Affected Services:** All (authentication/encryption)

**Severity:** SEV2 (security incident)

**Estimated Duration:** 30-60 minutes

#### Diagnostic Steps

1. **Assess exposure scope:**
   - Which key was compromised? (JWT private key, encryption key, API secret?)
   - How long was it exposed?
   - Who has access to logs/commits where it might appear?

2. **Check for unauthorized access:**
   ```bash
   # Review CloudWatch logs for suspicious authentication
   # Look for: unusual IP addresses, failed logins, API calls from unknown tenants

   # Example query:
   aws logs start-query \
     --log-group-name /lons/production/graphql-server \
     --start-time $(($(date +%s) - 3600)) \
     --end-time $(date +%s) \
     --query-string 'fields @timestamp, @message | filter @message like /AuthenticationException/'
   ```

3. **Check AWS Secrets Manager history:**
   ```bash
   aws secretsmanager list-secret-version-ids \
     --secret-id /lons/production/jwt-keys \
     --region eu-west-1
   ```

#### Resolution Steps

**Option A: JWT Key Rotation (Recommended for auth compromise)**

1. **Generate new RSA keypair:**
   ```bash
   openssl genrsa -out private-key.pem 4096
   openssl rsa -in private-key.pem -pubout -out public-key.pem
   ```

2. **Update AWS Secrets Manager:**
   ```bash
   # Backup old key first
   aws secretsmanager get-secret-value \
     --secret-id /lons/production/jwt-keys \
     --region eu-west-1 > jwt-keys-backup.json

   # Update with new key
   aws secretsmanager update-secret \
     --secret-id /lons/production/jwt-keys \
     --secret-string '{
       "jwt_private_key": "'$(cat private-key.pem | base64 -w0)'",
       "jwt_public_key": "'$(cat public-key.pem | base64 -w0)'"
     }' \
     --region eu-west-1
   ```

3. **Restart authentication services:**
   ```bash
   # Restart graphql-server and rest-server
   kubectl rollout restart deployment/graphql-server -n lons-production
   kubectl rollout restart deployment/rest-server -n lons-production

   # Wait for pods to become ready
   kubectl rollout status deployment/graphql-server -n lons-production
   ```

4. **Revoke old tokens (optional but recommended):**
   ```sql
   -- Mark old tokens as revoked in database
   UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;
   -- Force users to re-login
   ```

**Option B: Encryption Key Rotation (For data encryption compromise)**

1. **Generate new AES-256 key:**
   ```bash
   openssl rand 32 | base64
   ```

2. **Store in Secrets Manager:**
   ```bash
   aws secretsmanager update-secret \
     --secret-id /lons/production/encryption \
     --secret-string '{
       "encryption_key_current": "'$(openssl rand 32 | base64)'",
       "encryption_key_previous": "'$(aws secretsmanager get-secret-value --secret-id /lons/production/encryption --query SecretString | jq -r .encryption_key_current)'"
     }' \
     --region eu-west-1
   ```

3. **Services will automatically use new key for future encryptions:**
   - New records encrypted with new key
   - Old records decrypted with previous key (read-only)

4. **Schedule data re-encryption (batch job):**
   ```bash
   # Run as one-off job to re-encrypt all sensitive data
   kubectl run encrypt-migration \
     --image lons:latest \
     --command -- node scripts/re-encrypt-pii.js \
     -n lons-production
   ```

**Option C: API Key Rotation (Integration service compromise)**

1. **Revoke compromised key:**
   ```sql
   UPDATE api_keys SET revoked_at = NOW() WHERE tenant_id = '{tenant_id}';
   ```

2. **Generate new key:**
   ```bash
   # Via GraphQL mutation
   mutation {
     createApiKey(tenantId: "{tenant_id}") {
       key
       secret
     }
   }
   ```

3. **Notify affected tenant:**
   - Email: "API key rotated due to security incident. New key: {KEY}. Old key revoked."

4. **Update tenant configuration:**
   - Tenant must update their integration code to use new key

#### Verification Steps

1. **Verify new key is active:**
   ```bash
   # For JWT:
   kubectl logs -n lons-production $(kubectl get pod -n lons-production -l app=graphql-server -o jsonpath='{.items[0].metadata.name}') | grep -i "JWT\|public key"

   # Expect: logs showing new public key loaded
   ```

2. **Test authentication:**
   ```bash
   # Login should work with new key
   curl -X POST https://api.lons.io/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"mutation { login(email: \"user@example.com\", password: \"xxx\") { token } }"}'
   ```

3. **Verify old credentials no longer work:**
   ```bash
   # Old tokens should be rejected
   # Test with expired/revoked token
   ```

4. **Check audit logs:**
   ```bash
   # Verify rotation event is logged
   SELECT * FROM audit_logs WHERE action = 'KEY_ROTATED' AND created_at > NOW() - INTERVAL '5 minutes';
   ```

#### Rollback Plan

**If key rotation causes authentication outages:**

1. **Revert to old key immediately:**
   ```bash
   aws secretsmanager update-secret \
     --secret-id /lons/production/jwt-keys \
     --secret-string '$(cat jwt-keys-backup.json | jq -r .SecretString)' \
     --region eu-west-1
   ```

2. **Restart services:**
   ```bash
   kubectl rollout restart deployment/graphql-server -n lons-production
   ```

3. **Accept compromise:**
   - Old key is still exposed, but service is restored
   - Force immediate rotation during maintenance window

---

### RB-6: Backup Restore

**Trigger Conditions:**
- Data corruption detected (invalid data in database)
- Accidental deletion (tenant data deleted by mistake)
- Ransomware or malicious data modification
- Need to restore to specific point in time (RPO)

**Affected Services:** All (data consistency)

**Severity:** SEV2 (data loss potential)

**Estimated Duration:** 30-120 minutes depending on backup size

#### Diagnostic Steps

1. **Identify corruption/deletion:**
   - Which tables are affected?
   - When did corruption occur? (timestamp)
   - How many records are impacted?

   ```sql
   -- Check for suspicious deletions
   SELECT COUNT(*) FROM loans WHERE deleted_at > NOW() - INTERVAL '1 day';

   -- Check for invalid data patterns
   SELECT * FROM repayments WHERE amount > 999999.99;
   ```

2. **Determine restore point:**
   ```bash
   # List available backups
   aws rds describe-db-snapshots \
     --db-instance-identifier lons-production \
     --region eu-west-1 \
     --query 'DBSnapshots[*].[DBSnapshotIdentifier, SnapshotCreateTime, Status]'
   ```

3. **Verify backup integrity:**
   - Check backup creation succeeded (Status: `available`)
   - Verify backup is newer than corruption timestamp
   - Estimate recovery time based on backup size

#### Resolution Steps

**Option A: Point-in-Time Restore (Recommended for recent corruption)**

```bash
# Restore to specific timestamp (within 7 days typically)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier lons-production \
  --target-db-instance-identifier lons-production-restore \
  --restore-time 2026-03-29T12:00:00Z \
  --region eu-west-1

# Monitor restore progress
aws rds describe-db-instances \
  --db-instance-identifier lons-production-restore \
  --region eu-west-1 \
  --query 'DBInstances[0].[DBInstanceStatus, PendingModifiedValues]'
```

**Option B: Snapshot Restore (For older corruption)**

```bash
# Restore from specific snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-production-restore \
  --db-snapshot-identifier {SNAPSHOT_ID} \
  --region eu-west-1

# Monitor restore
aws rds describe-db-instances \
  --db-instance-identifier lons-production-restore \
  --region eu-west-1 \
  --query 'DBInstances[0].DBInstanceStatus'
```

**Option C: Selective Data Restore (Minimal Downtime)**

If corruption affects only specific tables:

1. **Create separate restore instance:**
   ```bash
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier lons-production-restore-temp \
     --db-snapshot-identifier {SNAPSHOT_ID} \
     --region eu-west-1
   ```

2. **Query clean data from restore:**
   ```bash
   # From restore instance, extract clean data
   pg_dump -h lons-production-restore-temp -U postgres -d lons -t loans \
     --data-only | psql -h lons-production -U postgres -d lons
   ```

3. **Delete restore instance:**
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier lons-production-restore-temp \
     --skip-final-snapshot \
     --region eu-west-1
   ```

#### Verification Steps

1. **Verify restore instance is operational:**
   ```bash
   psql postgresql://user:pass@lons-production-restore.xxxxx.eu-west-1.rds.amazonaws.com:5432/lons -c "SELECT COUNT(*) FROM loans"

   # Expect: Returns count similar to pre-corruption state
   ```

2. **Compare data between original and restore:**
   ```sql
   -- In original database
   SELECT COUNT(*) FROM loans WHERE created_at > NOW() - INTERVAL '30 days';

   -- In restore database (should be same or higher)
   SELECT COUNT(*) FROM loans WHERE created_at > NOW() - INTERVAL '30 days';
   ```

3. **Validate data integrity:**
   ```sql
   -- Check for referential integrity
   SELECT COUNT(*) FROM loans WHERE customer_id NOT IN (SELECT id FROM customers);

   -- Check amounts are valid
   SELECT COUNT(*) FROM repayments WHERE amount <= 0;
   ```

4. **Run test queries:**
   - Verify application can connect
   - Spot check key tables
   - Run application health checks

#### Cutover Steps (Promoting Restore to Primary)

1. **Stop application traffic:**
   ```bash
   # Scale down to 0 to prevent writes during cutover
   kubectl scale deployment/graphql-server --replicas=0 -n lons-production
   kubectl scale deployment/rest-server --replicas=0 -n lons-production
   ```

2. **Promote restore instance to primary:**
   - Option A: CNAME swap (if using DNS)
     ```bash
     # Update Route53 to point to restore instance
     aws route53 change-resource-record-sets \
       --hosted-zone-id Z123456 \
       --change-batch '{
         "Changes": [{
           "Action": "UPSERT",
           "ResourceRecordSet": {
             "Name": "db-primary.lons.io",
             "Type": "CNAME",
             "TTL": 300,
             "ResourceRecords": [{"Value": "lons-production-restore.xxxxx.eu-west-1.rds.amazonaws.com"}]
           }
         }]
       }'
     ```

   - Option B: Update Secrets Manager
     ```bash
     aws secretsmanager update-secret \
       --secret-id /lons/production/database \
       --secret-string '{"DATABASE_URL":"postgresql://user:pass@lons-production-restore.xxxxx.eu-west-1.rds.amazonaws.com:5432/lons"}'
     ```

3. **Restart application services:**
   ```bash
   kubectl scale deployment/graphql-server --replicas=3 -n lons-production
   kubectl scale deployment/rest-server --replicas=3 -n lons-production
   kubectl rollout status deployment/graphql-server -n lons-production
   ```

4. **Delete corrupted primary (after cutover verified):**
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier lons-production \
     --final-db-snapshot-identifier lons-production-corrupted-backup-YYYYMMDD \
     --region eu-west-1
   ```

5. **Rename restore instance:**
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier lons-production-restore \
     --new-db-instance-identifier lons-production \
     --apply-immediately \
     --region eu-west-1
   ```

#### Rollback Plan

**If restored data causes problems:**

1. **Revert to original database (if still exists):**
   - Stop application again
   - Update Secrets Manager to point back to original
   - Restart services

2. **Accept data loss:**
   - If original also corrupted, accept restore point
   - Run audit to determine what was lost
   - Manually re-create critical records if possible

---

### RB-7: Scaling Response

**Trigger Conditions:**
- High CPU (>80%) or memory (>85%) alerts firing
- Traffic spike detected (request rate 2x baseline)
- Auto-scaling not keeping up (pods in pending state)
- P95 latency elevated (>2 seconds from baseline)

**Affected Services:** GraphQL server, REST server, worker services

**Severity:** SEV2 (degradation) or SEV3 (elevated latency)

**Estimated Duration:** 5-15 minutes

#### Diagnostic Steps

1. **Check current pod status:**
   ```bash
   kubectl get hpa -n lons-production
   kubectl describe hpa graphql-server-hpa -n lons-production

   # Check if scaling is happening
   kubectl get pods -n lons-production | grep graphql-server | wc -l
   ```

2. **Review metrics:**
   - Grafana dashboard: CPU, memory, request rate
   - Check: Is HPA actually triggering?
   - CloudWatch: Is ALB health check passing?

3. **Check HPA configuration:**
   ```bash
   # Verify HPA thresholds are appropriate
   kubectl get hpa graphql-server-hpa -n lons-production -o yaml | grep -A 10 "targetCPUUtilizationPercentage"
   ```

4. **Analyze request spike source:**
   - Is it organic traffic?
   - Is it a runaway process or bot?
   - Check Rate limiting status

#### Resolution Steps

**Option A: Manual Scaling (Immediate relief)**

```bash
# For GraphQL server
kubectl scale deployment/graphql-server --replicas=10 -n lons-production

# For REST server
kubectl scale deployment/rest-server --replicas=10 -n lons-production

# For workers
kubectl scale deployment/notification-worker --replicas=5 -n lons-production

# Monitor scaling
kubectl get pods -n lons-production -w
```

**Option B: Increase HPA Limits (Prevent future under-scaling)**

```bash
# Update HPA to allow more replicas
kubectl patch hpa graphql-server-hpa -n lons-production \
  --type='json' \
  -p='[{"op": "replace", "path": "/spec/maxReplicas", "value": 20}]'
```

**Option C: Identify & Block Abusive Traffic**

```bash
# If bot/scraper detected
# Update WAF rules to block
aws wafv2 update-ip-set \
  --name lons-blocked-ips \
  --scope REGIONAL \
  --id {IP_SET_ID} \
  --addresses "[\"203.0.113.0/24\"]" \
  --region eu-west-1
```

**Option D: Increase Resource Requests (Permanent Fix)**

Edit Helm values and redeploy:

```yaml
# helm/lons/values.yaml
graphqlServer:
  replicaCount: 5  # Increased from 3
  resources:
    requests:
      cpu: 500m      # Increased from 250m
      memory: 512Mi  # Increased from 256Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  autoscaling:
    minReplicas: 5
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
```

#### Verification Steps

1. **Verify scaling completed:**
   ```bash
   kubectl get pods -n lons-production | grep graphql-server | wc -l
   # Expect: 10+ pods running (or target replicas)
   ```

2. **Check traffic distribution:**
   - Grafana: ALB target health all green
   - Request rate per pod normalized
   - CPU/memory per pod back to baseline

3. **Verify application performance:**
   ```bash
   # Check P95 latency
   # GraphQL API latency should drop below 1 second
   ```

4. **Monitor for 10 minutes:**
   - Ensure no new alerts firing
   - Verify scaling remains stable

#### Rollback Plan

**If aggressive scaling causes resource exhaustion:**

1. **Scale back down:**
   ```bash
   kubectl scale deployment/graphql-server --replicas=5 -n lons-production
   ```

2. **Investigate root cause:**
   - Memory leak in service?
   - Database query performance?
   - Unexpected traffic surge

3. **Address root cause:**
   - If memory leak: rolling restart
   - If query performance: add database indexes
   - If traffic spike: investigate source and implement rate limiting

---

### RB-8: Certificate Emergency

**Trigger Conditions:**
- TLS certificate expired (browser shows "untrusted certificate")
- Certificate expiring within 7 days (AlertManager alert)
- cert-manager renewal failed
- Need emergency cert due to domain compromise

**Affected Services:** All (HTTPS/TLS required)

**Severity:** SEV1 (users cannot access platform)

**Estimated Duration:** 5-30 minutes

#### Diagnostic Steps

1. **Check current certificate status:**
   ```bash
   # From application domain
   echo | openssl s_client -servername api.lons.io -connect api.lons.io:443 \
     | openssl x509 -noout -dates -subject

   # Expected output:
   # subject=CN=api.lons.io
   # notBefore=...
   # notAfter=2026-06-29  # Should be in future
   ```

2. **Check cert-manager status:**
   ```bash
   kubectl get certificates -n lons-production
   kubectl describe certificate lons-tls-cert -n lons-production

   # Look for: READY=True, status=Valid
   ```

3. **Review cert-manager logs:**
   ```bash
   kubectl logs -n lons-production deploy/cert-manager | tail -50
   # Look for: renewal attempts, ACME challenge status
   ```

4. **Check DNS records (for ACME validation):**
   ```bash
   nslookup _acme-challenge.api.lons.io
   # Expect: TXT record present (cert-manager creates this)
   ```

#### Resolution Steps

**Option A: Force cert-manager Renewal (Preferred)**

```bash
# Delete existing certificate to trigger renewal
kubectl delete certificate lons-tls-cert -n lons-production

# cert-manager will immediately re-create and renew
# Monitor renewal progress:
kubectl get certificate lons-tls-cert -n lons-production -w

# Expect: READY=True within 2 minutes
```

**Option B: Manual ACM Certificate Renewal (AWS)**

If using AWS Certificate Manager (recommended for production):

```bash
# ACM auto-renews 60 days before expiry
# If manual renewal needed:
aws acm request-certificate \
  --domain-name lons.io \
  --subject-alternative-names "*.lons.io" "api.lons.io" "admin.lons.io" \
  --validation-method DNS \
  --region eu-west-1
```

**Option C: Request Let's Encrypt Emergency Cert (Backup)**

```bash
# Manual cert generation (if cert-manager fails)
certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d api.lons.io \
  -d admin.lons.io \
  -d lons.io

# Create Kubernetes secret from certificate
kubectl create secret tls lons-tls-emergency \
  --cert=./fullchain.pem \
  --key=./privkey.pem \
  -n lons-production

# Update Ingress to use emergency secret
kubectl patch ingress lons-ingress -n lons-production \
  --type json -p '[{"op":"replace","path":"/spec/tls/0/secretName","value":"lons-tls-emergency"}]'
```

**Option D: Self-Signed Certificate (Temporary, Last Resort)**

```bash
# Generate self-signed (warning: browsers will show warning)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout privkey.pem -out cert.pem -days 1 \
  -subj "/CN=api.lons.io"

# Create secret
kubectl create secret tls lons-tls-selfsigned \
  --cert=./cert.pem \
  --key=./privkey.pem \
  -n lons-production

# Update Ingress
kubectl patch ingress lons-ingress -n lons-production \
  --type json -p '[{"op":"replace","path":"/spec/tls/0/secretName","value":"lons-tls-selfsigned"}]'
```

#### Verification Steps

1. **Verify new certificate is installed:**
   ```bash
   echo | openssl s_client -servername api.lons.io -connect api.lons.io:443 \
     | openssl x509 -noout -dates

   # Expect: notAfter date is far in future (>90 days)
   ```

2. **Check Ingress secret:**
   ```bash
   kubectl get secret lons-tls -n lons-production
   # Expect: exists and is type=kubernetes.io/tls
   ```

3. **Verify browser access:**
   - Open https://api.lons.io in browser
   - Expect: No certificate warnings, green lock icon

4. **Check cert-manager renewal is scheduled:**
   ```bash
   kubectl describe certificate lons-tls-cert -n lons-production
   # Look for: RenewalTime (should be 30 days before expiry)
   ```

5. **Monitor renewal completion:**
   - Wait 2-5 minutes for cert-manager to renew
   - Verify renewed cert shows in Ingress

#### Rollback Plan

**If new certificate causes issues:**

1. **Revert to previous secret:**
   ```bash
   # If you have backup of old secret
   kubectl create secret tls lons-tls-previous \
     --cert=./old-cert.pem \
     --key=./old-key.pem \
     -n lons-production

   # Update Ingress
   kubectl patch ingress lons-ingress -n lons-production \
     --type json -p '[{"op":"replace","path":"/spec/tls/0/secretName","value":"lons-tls-previous"}]'
   ```

2. **Accept expired certificate temporarily:**
   - If reverting not possible, accept browser warnings temporarily
   - Users can bypass warning to access (not recommended for production)
   - Fix certificate issue in next maintenance window

3. **Investigate renewal failure:**
   - Why did cert-manager renewal fail?
   - DNS CNAME misconfigured?
   - ACME rate limit hit?

---

## Maintenance Window Process

### Standard Maintenance Schedule

**Preferred Maintenance Window (Minimal Tenant Impact):**
- **Day:** Saturday
- **Time:** 02:00–06:00 UTC (02:00–08:00 WAT, 03:00–09:00 EAT)
- **Duration:** 4 hours maximum
- **Frequency:** Weekly (1 window/week), additional as-needed

**Rationale:** Saturdays 02:00 UTC is 08:00–12:00 West Africa Time (low business hours). East Africa Time (UTC+3) is 05:00–09:00 (early morning, still acceptable).

### Maintenance Window Approval Process

1. **Request submission (48 hours before):**
   - PM or Engineer submits maintenance request to Slack #lons-incidents
   - Include: Date, time, duration, services affected, expected impact, rollback plan

   ```
   MAINTENANCE REQUEST
   Date: 2026-04-05 (Saturday)
   Time: 02:00-06:00 UTC
   Services: graphql-server, database (PostgreSQL parameter group update)
   Impact: 5-10 min downtime expected during parameter update
   Rollback: Revert parameter group to previous version
   ```

2. **PM approval:**
   - PM reviews and approves/rejects in Slack
   - If approved: "✅ Approved" + emoji
   - If rejected: Reason provided, reschedule

3. **Tenant notification (24 hours before):**
   - Email all affected tenants:
     ```
     Subject: Scheduled Maintenance — Lōns Platform

     We will be performing scheduled maintenance on Saturday, April 5, 2026, from 02:00 to 06:00 UTC.

     Expected Impact: 5-10 minute service interruption during database update
     Services Affected: All (brief unavailability)
     Rollback Plan: Available if needed

     We apologize for any inconvenience. If you have urgent questions, please contact support@lons.io
     ```

4. **Maintenance execution:**
   - Start 10 minutes before scheduled time (verify all ready)
   - Post status updates every 15 minutes to #lons-incidents
   - Execute change according to runbook
   - Verify rollback plan tested (don't actually rollback unless needed)

5. **Post-maintenance verification (15-30 min):**
   - Run smoke tests (API health checks, database connectivity)
   - Verify metrics are normal (no error spikes)
   - Confirm all tenants can access platform
   - Check logs for errors

### Maintenance Window Runbook Template

Every maintenance request must include:

```markdown
## Maintenance: {DESCRIPTION}

**Scheduled Time:** {DATE} {TIME} UTC (ends by {TIME})
**Estimated Duration:** {X} minutes
**Services Affected:** {LIST}

### Pre-Maintenance Checklist
- [ ] All necessary approvals obtained
- [ ] Backups taken (RDS snapshot, S3 backup)
- [ ] Rollback plan documented and tested
- [ ] Team on standby
- [ ] Monitoring dashboards open (Grafana)
- [ ] Alerts configured to page on-call

### Maintenance Steps
1. Step 1: {DESCRIPTION}
2. Step 2: {DESCRIPTION}
...

### Verification
- [ ] Health check endpoint returns 200
- [ ] GraphQL query { __typename } succeeds
- [ ] No error spikes in logs
- [ ] Metrics (CPU, memory, latency) normal

### Rollback Plan
If maintenance fails:
1. Step 1: {DESCRIPTION}
...
Expected rollback time: {X} minutes

### Post-Maintenance
- [ ] Notify tenants via email
- [ ] Schedule post-incident review (if issues)
- [ ] Update runbook with lessons learned
```

---

## AlertManager Routing Configuration

### Alert Severity Levels

AlertManager routes alerts based on severity labels:

| Severity | Definition | Routing |
|----------|-----------|---------|
| **info** | Informational, no action needed | Email digest (daily) |
| **warning** | Monitor situation, may require action | Slack #lons-alerts (immediate) |
| **critical** | Requires immediate attention | PagerDuty + Slack #lons-incidents |

### Routing Configuration (AlertManager YAML)

```yaml
# helm/lons/values.yaml - alertmanager section

alertmanager:
  config:
    global:
      resolve_timeout: 5m
      slack_api_url: 'https://hooks.slack.com/services/...'  # To be provisioned

    route:
      receiver: 'default'
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h

      # Info alerts → daily email digest
      routes:
        - match:
            severity: info
          receiver: email-digest
          continue: false

        # Warning alerts → immediate Slack notification
        - match:
            severity: warning
          receiver: slack-alerts
          continue: false

        # Critical alerts → PagerDuty immediately + Slack
        - match:
            severity: critical
          receiver: pagerduty-critical
          group_wait: 0s  # No waiting, page immediately
          continue: true  # Also send to Slack
        - match:
            severity: critical
          receiver: slack-incidents
          continue: false

    receivers:
      # Email digest (daily)
      - name: 'email-digest'
        email_configs:
          - to: 'ops-team@lons.io'
            from: 'alerts@lons.io'
            smarthost: 'smtp.ses.eu-west-1.amazonaws.com:587'
            auth_username: '{{ .EmailUsername }}'
            auth_password: '{{ .EmailPassword }}'
            send_resolved: false
            headers:
              Subject: 'Daily Alert Summary'
            html: |
              <h2>Daily Alert Summary</h2>
              {{ range .Alerts }}
                <b>{{ .Labels.alertname }}</b>: {{ .Annotations.summary }}
              {{ end }}

      # Slack — Warning alerts
      - name: 'slack-alerts'
        slack_configs:
          - api_url: '{{ .SlackHookUrl }}'
            channel: '#lons-alerts'
            icon_emoji: '⚠️'
            title: '[{{ .GroupLabels.severity | toUpper }}] {{ .GroupLabels.alertname }}'
            text: |
              Service: {{ .GroupLabels.service }}
              Cluster: {{ .GroupLabels.cluster }}
              {{ range .Alerts }}
                - {{ .Annotations.summary }}
              {{ end }}
            send_resolved: false

      # Slack — Critical incidents
      - name: 'slack-incidents'
        slack_configs:
          - api_url: '{{ .SlackHookUrl }}'
            channel: '#lons-incidents'
            icon_emoji: '🚨'
            title: '[{{ .GroupLabels.severity | toUpper }}] {{ .GroupLabels.alertname }}'
            text: |
              @channel — CRITICAL INCIDENT

              Service: {{ .GroupLabels.service }}
              Cluster: {{ .GroupLabels.cluster }}
              {{ range .Alerts }}
                - {{ .Annotations.summary }}
              {{ end }}
            send_resolved: true

      # PagerDuty
      - name: 'pagerduty-critical'
        pagerduty_configs:
          - routing_key: '{{ .PagerDutyRoutingKey }}'  # To be created in PagerDuty
            client: 'Lōns AlertManager'
            client_url: 'https://status.lons.io'
            details:
              firing: '{{ .Alerts.Firing | len }} alerts'
              resolved: '{{ .Alerts.Resolved | len }} alerts'
            links:
              - href: '{{ .ExternalURL }}'
                text: 'AlertManager'
              - href: 'https://grafana.lons.io'
                text: 'Grafana Dashboard'
            send_resolved: true
```

### Alert Rules (Prometheus)

Critical alerts that page on-call:

```yaml
# helm/lons/templates/prometheus-rules.yaml

groups:
  - name: lons.platform
    interval: 30s
    rules:
      # SEV1: Platform Down
      - alert: GraphQLServerDown
        expr: up{job="graphql-server"} == 0
        for: 2m
        labels:
          severity: critical
          service: graphql-server
        annotations:
          summary: "GraphQL server is down"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-1-service-restart"

      - alert: RDSDown
        expr: aws_rds_instance_db_instance_status{identifier="lons-production"} != 0
        for: 1m
        labels:
          severity: critical
          service: database
        annotations:
          summary: "RDS database is down — SEV1"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-2-rds-failover"

      # SEV2: Major Degradation
      - alert: GraphQLErrorRate
        expr: rate(http_request_errors_total{service="graphql-server"}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
          service: graphql-server
        annotations:
          summary: "GraphQL error rate > 5%"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-7-scaling-response"

      - alert: BullMQQueueBackup
        expr: redis_queue_length{queue="notification-queue"} > 1000
        for: 10m
        labels:
          severity: critical
          service: job-queue
        annotations:
          summary: "Notification queue backing up ({{ .Value }} jobs pending)"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-3-redis-failover"

      # SEV3: Warnings
      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{pod=~"graphql-server-.*"} / 1e9 > 0.85
        for: 10m
        labels:
          severity: warning
          service: graphql-server
        annotations:
          summary: "Memory usage is {{ $value | humanize }}% — check for leaks"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-7-scaling-response"

      - alert: CertExpiringSoon
        expr: certmanager_certificate_expiration_timestamp_seconds - time() < 7 * 86400
        labels:
          severity: warning
          service: security
        annotations:
          summary: "Certificate expires in {{ $value | humanizeDuration }}"
          runbook: "https://docs.lons.io/Docs/INCIDENT-RESPONSE.md#rb-8-certificate-emergency"
```

### Slack Channel Configuration

**#lons-alerts (Warning alerts)**
- Notifications every 30 minutes
- Non-urgent, daily digest
- To be provisioned in Slack workspace

**#lons-incidents (Critical/SEV1-2)**
- Immediate notifications
- Requires acknowledgment from on-call
- Thread for status updates
- @channel pinged for SEV1

### PagerDuty Configuration

**Service:** `lons-platform`
- **Escalation Policy:** On-call engineer (escalates to Emmanuel after 30 min)
- **Status Page:** https://status.lons.io (to be integrated)
- **Routing Key:** (to be generated in PagerDuty)

---

## Post-Incident Review

### Timing

- **SEV1/2 incidents:** PIR within 24 hours
- **SEV3 incidents:** PIR within 1 week
- **SEV4 incidents:** Grouped review (monthly)

### Participants

- On-call engineer (responder)
- Project lead (Emmanuel)
- Relevant service owners
- Optional: Customer success (if tenant-impacting)

### PIR Agenda (30 minutes)

1. **Incident summary (5 min)**
   - What happened? (timeline of events)
   - How long was platform/feature down?
   - How many tenants affected?

2. **Root cause analysis (10 min)**
   - Why did the incident occur?
   - What was the trigger?
   - Why didn't monitoring catch it earlier?

3. **Response review (5 min)**
   - Did we follow the runbook?
   - Were escalations appropriate?
   - Any communication issues?

4. **Action items (10 min)**
   - What will prevent recurrence?
   - Assign owner + due date
   - Track in Jira/Monday backlog

### Action Item Examples

- Add monitoring/alert for root cause
- Improve runbook clarity
- Add load testing for scaling scenarios
- Implement feature flag for risky changes
- Increase resource requests

### Post-Incident Review Document

Published in Slack #lons-incidents as thread:

```
POST-INCIDENT REVIEW
====================
Date: 2026-03-29
Incident: GraphQL Server Unresponsive (SEV2)
Duration: 45 minutes (14:30–15:15 UTC)
Tenants Affected: 12/50 (24%)

ROOT CAUSE
----------
GraphQL server pods ran out of memory due to unbounded connection pool growth.
No explicit connection limit was set, and connections were not being properly
closed after client disconnect.

TIMELINE
--------
14:30 UTC: First 503 errors reported by tenant
14:32 UTC: Alert fires (ErrorRate > 5%)
14:35 UTC: On-call acknowledges PagerDuty
14:40 UTC: Root cause identified (OOMKilled pods)
14:42 UTC: Increased memory limit in deployment
14:50 UTC: New pods scaled up, traffic resumed
15:15 UTC: P95 latency returned to baseline

RESPONSE QUALITY
----------------
✅ Escalation to PagerDuty appropriate (SEV2)
✅ Runbook followed correctly (RB-7: Scaling Response)
✅ Good communication updates in Slack
❌ Alert should have fired earlier (before 503s)

ACTION ITEMS
------------
1. [@alice] Implement max_connections limit in GraphQL server (due 2026-04-02)
2. [@bob] Add connection pool metrics to Grafana dashboard (due 2026-03-31)
3. [@dev-team] Load test connection pool behavior (due 2026-04-05)
4. [@ops] Set memory alerts at 70% instead of 85% (due 2026-03-30)
```

---

## On-Call Rotation

### On-Call Schedule (At Launch)

**Phase 1 (March–June 2026):** Single on-call engineer (Emmanuel)

- Paged for all SEV1/2 incidents
- Rotates on-call duties with Engineering team as team grows

**Phase 2 (July onwards):** On-call rotation (2 engineers)

- Weekly rotation
- Primary on-call: Paged for SEV1/2
- Secondary on-call: Escalation after 30 min
- Coverage: 24/7 (overlap planned for maintenance)

### On-Call Responsibilities

1. **Respond to PagerDuty pages within 15 minutes (SEV1) or 30 minutes (SEV2)**
2. **Execute runbooks and provide updates every 5 minutes (SEV1) or 10 minutes (SEV2)**
3. **Escalate or de-escalate severity as incident evolves**
4. **Participate in post-incident review**
5. **Update runbooks based on lessons learned**

### On-Call Support Tools

- **PagerDuty app:** Download mobile app for push notifications
- **Slack:** Direct DM for urgent matters
- **Laptops required:** Must have access to laptop during on-call week (not phone-only)
- **Laptop access:** SSH to bastion, VPN to AWS, kubectl access

### On-Call Escalation Example

```
14:30 — Alert fires (SEV2)
14:45 — On-call acknowledges in PagerDuty
15:00 — Still investigating, no fix in sight
15:00 — Page Emmanuel for escalation
15:05 — Emmanuel joins war room
15:30 — Fix applied, incident resolving
16:00 — Back to normal, post-incident review scheduled
```

---

## Appendix A: Quick Reference — Alert to Runbook Mapping

| Alert | Severity | Runbook | Action |
|-------|----------|---------|--------|
| GraphQLServerDown | SEV1 | RB-1 | Service Restart |
| RDSDown | SEV1 | RB-2 | RDS Failover |
| RedisUnreachable | SEV2 | RB-3 | Redis Failover |
| ErrorRateHigh | SEV2 | RB-7 | Scaling Response |
| BullMQBackup | SEV2 | RB-3 | Redis Failover |
| HighMemory | SEV3 | RB-7 | Scaling Response |
| CertExpiringSoon | SEV3 | RB-8 | Certificate Emergency |
| DataCorruption | SEV2 | RB-6 | Backup Restore |
| KeyCompromised | SEV2 | RB-5 | Key Rotation (Emergency) |

---

## Appendix B: Useful Commands

### Kubernetes

```bash
# Get all pods
kubectl get pods -n lons-production

# View pod logs
kubectl logs -n lons-production {POD_NAME}

# Restart deployment
kubectl rollout restart deployment/{SERVICE} -n lons-production

# Scale deployment
kubectl scale deployment/{SERVICE} --replicas=10 -n lons-production

# Describe pod (detailed info)
kubectl describe pod {POD_NAME} -n lons-production
```

### AWS

```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier lons-production --region eu-west-1

# Get secrets
aws secretsmanager get-secret-value --secret-id /lons/production/database --region eu-west-1

# Check ElastiCache
aws elasticache describe-replication-groups --replication-group-id lons-production-redis --region eu-west-1

# CloudWatch logs
aws logs tail /lons/production/graphql-server --follow
```

### Database

```bash
# PostgreSQL connection
psql postgresql://user:pass@{ENDPOINT}:5432/lons

# Quick health check
SELECT 1;

# Check slow queries
SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

---

## Appendix C: Escalation Contacts (To be Populated)

| Role | Name | Phone | Email | Status |
|------|------|-------|-------|--------|
| Project Lead | Emmanuel | TBD | TBD | To be confirmed |
| On-Call (Primary) | TBD | TBD | TBD | To be assigned |
| On-Call (Secondary) | TBD | TBD | TBD | To be assigned (Phase 2) |
| Slack Workspace | TBD | — | — | To be provisioned |
| PagerDuty Service | TBD | — | — | To be configured |

---

**Document Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-29 | Operations | Initial version |
