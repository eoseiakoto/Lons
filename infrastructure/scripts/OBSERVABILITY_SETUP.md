# Lōns Staging Observability Stack - Setup & Verification Guide

## Overview

This guide documents the observability stack deployed for the Lōns Platform staging environment. The stack provides comprehensive monitoring, logging, tracing, and alerting capabilities across all platform services.

## Observability Components

### 1. Metrics Collection & Storage (Prometheus)

**Purpose**: Collects time-series metrics from all Lōns services and infrastructure components.

**Features**:
- Scrapes metrics from Kubernetes pods via ServiceMonitor resources
- 30-second scrape interval for responsive alerting
- Queries metrics via Prometheus Query Language (PromQL)
- 15-day retention for staging (configurable)

**Verification**:
```bash
kubectl get servicemonitor -n lons
kubectl get prometheusrule -n lons
```

### 2. Metrics Visualization (Grafana)

**Purpose**: Provides visual dashboards for real-time monitoring and historical analysis.

**Dashboards**:
- **Lōns Platform Overview**: System-wide health, key business metrics (active loans, disbursement volume, collection rates)
- **Per-Tenant Metrics**: Multi-tenant performance comparison (active loans, disbursement volume, PAR by tenant)
- **Integration Health**: External system status (wallets, SMS, credit bureau, circuit breakers)

**Access**:
```bash
kubectl port-forward -n monitoring svc/grafana 3000:80
# Then open http://localhost:3000
# Default creds: admin / prom-operator
```

### 3. Alerting & Routing (AlertManager)

**Purpose**: Routes alerts based on severity, team, and alert type with appropriate notification channels.

**Alert Groups**:
- **Critical Alerts**: Immediate notification, 1-hour repeat interval
- **Security Alerts**: High priority, 30-minute repeats
- **Business Alerts**: Disbursement failures, reconciliation exceptions, overdue rate
- **Data/Infrastructure Alerts**: Database, Redis, infrastructure issues
- **Platform Alerts**: API, service-level metrics

**Routing**:
- **Critical** → Slack (#critical-alerts) + PagerDuty + Email (eoseiakoto@gmail.com)
- **Security** → Slack (#security-alerts) + Email
- **Business** → Slack (#business-alerts)
- **Data** → Slack (#data-alerts)
- **Platform** → Slack (#platform-alerts)

**Alert Rules** (38 total in prometheus-rules.yaml):
- Infrastructure: HighCPUUsage, HighMemoryUsage, PodCrashLooping, DiskUsageHigh, NodeNotReady
- Database: RDSHighConnections, RDSReplicationLag, SlowQueryDetected, RDSStorageUsage, RDSCPUHigh
- Redis: RedisHighMemory, RedisConnectionsHigh, RedisReplicationBroken, BullMQQueueBacklog
- Application: HighErrorRate, HighLatencyP95, DisbursementFailureRate, ReconciliationExceptions, ScoringServiceTimeout, IntegrationOutage, HighOverdueRate
- Security: UnauthorizedAccessSpike, APIRateLimitExceeded, SuspiciousLoginAttempts

**Access**:
```bash
kubectl port-forward -n monitoring svc/alertmanager 9093:9093
# Then open http://localhost:9093
```

### 4. Log Aggregation (Fluent Bit)

**Purpose**: Collects, masks PII, and ships logs to CloudWatch for persistence and analysis.

**Features**:
- Deployed as DaemonSet (runs on all nodes)
- PII masking via Lua script (phone numbers, national IDs, emails)
- JSON parsing and Kubernetes enrichment
- Automatic CloudWatch log group creation
- 30-day retention for staging

**Log Groups**:
- `/lons/staging/application`: All Lōns application logs
- `/lons/staging/containers`: Container logs
- `/aws/rds/staging-postgres`: PostgreSQL logs
- `/aws/elasticache/staging-redis`: Redis logs

**PII Fields Masked**:
- phone, phone_primary, phone_secondary
- national_id
- email
- date_of_birth
- full_name, customer_name
- account_number

**Verification**:
```bash
kubectl get daemonset -n lons -l app.kubernetes.io/name=fluent-bit
kubectl get pods -n lons -l app.kubernetes.io/name=fluent-bit
```

### 5. Distributed Tracing (OpenTelemetry Collector)

**Purpose**: Collects trace spans from all services and exports to AWS X-Ray for correlation and debugging.

**Features**:
- Accepts OTLP/gRPC (4317) and OTLP/HTTP (4318)
- Memory limiter to prevent OOM
- Batch processing for efficiency
- Enriches traces with environment and service metadata
- Exports to AWS X-Ray and local logging

**Configuration**:
- 1 replica in staging
- 100m CPU request, 500m limit
- 256Mi memory request, 512Mi limit

**Access**:
```bash
kubectl port-forward -n lons svc/lons-otel-collector 8888:8888
# Then open http://localhost:8888/metrics to view internal metrics
```

## Verification Script

**Location**: `infrastructure/scripts/verify-observability.sh`

**Purpose**: Comprehensive verification of all observability components.

**Checks Performed**:
1. Kubernetes cluster connectivity
2. Prometheus pod status and ServiceMonitors
3. Grafana pod status and dashboard configs
4. AlertManager pod status and routing rules
5. Fluent Bit DaemonSet and pod readiness
6. OpenTelemetry Collector deployment
7. CloudWatch log groups existence
8. Metrics scraping configuration

**Usage**:
```bash
# Default namespaces (lons, monitoring)
./infrastructure/scripts/verify-observability.sh

# Custom namespaces
./infrastructure/scripts/verify-observability.sh lons-staging monitoring-prod

# With set -x for debugging
bash -x ./infrastructure/scripts/verify-observability.sh
```

**Output**:
- Color-coded results (PASS/FAIL/WARN)
- Component status (running, ready replicas)
- Port-forward instructions
- Summary with pass/fail counts
- Exit code: 0 = all checks passed, 1 = failures

## Staging Configuration (values-staging.yaml)

### Enabled Features

```yaml
monitoring:
  alerts:
    enabled: true          # 38 alert rules active
  dashboards:
    enabled: true          # 3 Grafana dashboards
  alertmanager:
    enabled: true          # Alert routing configured
    slackWebhookUrl: "${SLACK_WEBHOOK_URL}"
    criticalAlerts: [eoseiakoto@gmail.com]
    prometheusName: kube-prometheus

logging:
  enabled: true            # Fluent Bit enabled
  retentionDays: 30        # 30-day CloudWatch retention
  aws:
    region: eu-west-1

tracing:
  enabled: true            # OTel Collector enabled
  debug: false             # Production-like logging
  aws:
    region: eu-west-1
  collector:
    replicaCount: 1        # Single collector for staging
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 512Mi
```

## Critical Alert Recipients

**Email**: eoseiakoto@gmail.com (critical alerts only)

Configure in CI/CD secrets as `SLACK_WEBHOOK_URL` for Slack integration.

## Access Instructions

### Port Forwarding

All components are accessed via `kubectl port-forward`:

```bash
# Prometheus (9090) - metrics queries
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &

# Grafana (3000) - dashboards
kubectl port-forward -n monitoring svc/grafana 3000:80 &

# AlertManager (9093) - alert management
kubectl port-forward -n monitoring svc/alertmanager 9093:9093 &

# OTel Collector (8888) - collector metrics
kubectl port-forward -n lons svc/lons-otel-collector 8888:8888 &
```

### Dashboard URLs

- **Grafana**: http://localhost:3000
  - Dashboards -> Browse to find Lōns dashboards
  - Default login: admin / prom-operator

- **Prometheus**: http://localhost:9090
  - Graph tab for PromQL queries
  - Status -> Targets to verify scraping
  - Status -> ServiceMonitors to verify configuration

- **AlertManager**: http://localhost:9093
  - Alerts view shows active/firing alerts
  - Silences allows temporary alert suppression
  - Status shows configuration

## Troubleshooting

### Prometheus Not Scraping Services

1. Verify ServiceMonitor exists:
   ```bash
   kubectl get servicemonitor -n lons
   kubectl describe servicemonitor <name> -n lons
   ```

2. Check Prometheus targets:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus 9090:9090
   # Open http://localhost:9090/targets
   ```

3. Verify label selectors match:
   ```bash
   kubectl get svc -n lons --show-labels
   ```

### Alerts Not Firing

1. Check PrometheusRule:
   ```bash
   kubectl get prometheusrule -n lons
   kubectl describe prometheusrule <name> -n lons
   ```

2. Query in Prometheus to verify metric exists:
   ```bash
   # At http://localhost:9090
   # Search for metric names like lons_contracts_active_total
   ```

3. Check AlertManager routing:
   ```bash
   kubectl get alertmanagerconfig -n lons
   kubectl describe alertmanagerconfig <name> -n lons
   ```

### Logs Not Appearing in CloudWatch

1. Verify Fluent Bit DaemonSet is running:
   ```bash
   kubectl get daemonset -n lons -l app.kubernetes.io/name=fluent-bit
   kubectl get pods -n lons -l app.kubernetes.io/name=fluent-bit
   ```

2. Check Fluent Bit logs:
   ```bash
   kubectl logs -n lons -l app.kubernetes.io/name=fluent-bit --tail=50
   ```

3. Verify AWS credentials and permissions:
   ```bash
   # Check service account has CloudWatch permissions
   kubectl describe sa <name> -n lons
   ```

### OTel Collector Not Receiving Traces

1. Verify OTel Collector is running:
   ```bash
   kubectl get deployment -n lons -l app.kubernetes.io/component=otel-collector
   kubectl get pods -n lons -l app.kubernetes.io/component=otel-collector
   ```

2. Check OTel Collector logs:
   ```bash
   kubectl logs -n lons -l app.kubernetes.io/component=otel-collector --tail=50
   ```

3. Verify service endpoints are configured in application:
   ```bash
   # Check OTEL_EXPORTER_OTLP_ENDPOINT env var
   kubectl get deployment -n lons -o yaml | grep -i otlp
   ```

## Maintenance

### Updating Alert Rules

1. Edit `infrastructure/helm/lons/templates/monitoring/prometheus-rules.yaml`
2. Update the `spec.groups[].rules` array
3. Helm redeploy will apply changes automatically
4. Verify in Prometheus UI under "Alerts" tab

### Scaling OTel Collector

For higher trace volume, increase replicas in values-staging.yaml:

```yaml
tracing:
  collector:
    replicaCount: 3  # Increase for load balancing
```

### Adjusting Log Retention

Change CloudWatch retention in values-staging.yaml:

```yaml
logging:
  retentionDays: 60  # Extend from 30 to 60 days
```

## References

- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- AlertManager: https://prometheus.io/docs/alerting/latest/alertmanager/
- Fluent Bit: https://docs.fluentbit.io/
- OpenTelemetry: https://opentelemetry.io/docs/
- AWS X-Ray: https://docs.aws.amazon.com/xray/latest/devguide/

---

**Last Updated**: 2026-03-29
**DE Contact**: Deployment Engineer (Claude)
**Stage**: Staging Environment (Sprint 7)
