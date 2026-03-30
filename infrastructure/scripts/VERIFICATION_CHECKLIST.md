# Observability Verification Checklist

## Pre-Verification Requirements

- [ ] kubectl is installed and in PATH
- [ ] AWS credentials configured (optional, for CloudWatch checks)
- [ ] Access to staging Kubernetes cluster
- [ ] Application namespace: `lons`
- [ ] Monitoring namespace: `monitoring` (or custom)

## Running Verification

```bash
# Default namespaces
./verify-observability.sh

# Custom namespaces
./verify-observability.sh lons-staging monitoring-custom

# Expected runtime: 30-60 seconds
```

## Expected Verification Results

### All Checks Pass (Exit Code 0)

```
[PASS] kubectl is available
[PASS] Connected to Kubernetes cluster
[PASS] Application namespace 'lons' exists
[PASS] Monitoring namespace 'monitoring' exists
[PASS] Found Prometheus pod(s)
[PASS] Prometheus is running (1/1 replicas ready)
[PASS] Found ServiceMonitor resources
[PASS] Found PrometheusRule resources
[PASS] Found Grafana pod(s)
[PASS] Grafana is running (1/1 replicas ready)
[PASS] Grafana service exists
[PASS] Found AlertManager pod(s)
[PASS] AlertManager is running (1/1 replicas ready)
[PASS] Found Fluent Bit DaemonSet
[PASS] Found Fluent Bit pods (N running)
[PASS] All Fluent Bit pods are Ready
[PASS] Found OpenTelemetry Collector deployment
[PASS] Found OpenTelemetry Collector pods (1 running)
[PASS] All OpenTelemetry Collector pods are Ready
[PASS] Found CloudWatch log group: /lons/staging/application
...

============================================================
VERIFICATION SUMMARY
============================================================
Passed:  22
Failed:  0
Warnings: 0

All observability checks passed!
```

### Common Warnings (Not Critical)

```
[WARN] Monitoring namespace 'monitoring' does not exist (may be expected)
    → Issue: Prometheus/Grafana/AlertManager not installed yet
    → Action: Install kube-prometheus-stack Helm chart

[WARN] No ServiceMonitor resources found in namespace 'lons'
    → Issue: Lōns services don't have metrics endpoints exposed
    → Action: Update service deployments to expose /metrics on port 9090

[WARN] No Grafana dashboard ConfigMaps found
    → Issue: Grafana dashboards not created
    → Action: Create dashboard ConfigMaps or import via Grafana UI

[WARN] AWS CLI not installed - skipping CloudWatch checks
    → Issue: AWS CLI not available for log group verification
    → Action: Install AWS CLI v2 or skip CloudWatch checks
```

### Critical Failures (Exit Code 1)

```
[FAIL] kubectl is not installed or not in PATH
    → Issue: kubectl command not available
    → Action: Install kubectl matching cluster version

[FAIL] Cannot connect to Kubernetes cluster
    → Issue: kubeconfig not configured or credentials invalid
    → Action: Configure kubeconfig (KUBECONFIG env var or ~/.kube/config)

[FAIL] Application namespace 'lons' does not exist
    → Issue: Lōns platform not deployed to this cluster
    → Action: Run setup-staging.sh to deploy platform

[FAIL] Prometheus is not in Ready state (0/1 replicas)
    → Issue: Prometheus pod failed to start
    → Action: Check pod logs: kubectl logs -n monitoring <pod-name>

[FAIL] Not all OpenTelemetry Collector pods are Ready (0/1 replicas)
    → Issue: OTel Collector deployment failed
    → Action: Check events: kubectl describe pod -n lons <pod-name>
```

## Verification Output Sections

### 1. Kubernetes Access
Checks kubectl availability and cluster connectivity.
- kubectl in PATH ✓
- Cluster connection ✓
- Namespace existence ✓

### 2. Prometheus Verification
Checks metrics storage and query layer.
- Pod running status ✓
- Ready replicas ✓
- ServiceMonitor resources (metric targets) ✓
- PrometheusRule resources (alert rules) ✓

**Key Metrics Verified**:
- `up{job="*lons*"}` - Service up/down status
- `http_requests_total` - API request counts
- `lons_contracts_active_total` - Business metrics
- `container_cpu_usage_seconds_total` - Infrastructure metrics

### 3. Grafana Verification
Checks visualization platform.
- Pod running status ✓
- Ready replicas ✓
- Service accessibility ✓
- Dashboard ConfigMaps (dashboards available) ✓

**Dashboards Verified**:
- lons-platform-overview
- lons-per-tenant-metrics
- lons-integration-health

### 4. AlertManager Verification
Checks alert routing and management.
- Pod running status ✓
- Ready replicas ✓
- Configuration existence ✓
- Routing rules (AlertManagerConfig) ✓

**Routing Verified**:
- Critical alerts → Slack + PagerDuty + Email
- Security alerts → Slack + Email
- Business alerts → Slack
- Data alerts → Slack
- Platform alerts → Slack

### 5. Fluent Bit Verification
Checks log collection DaemonSet.
- DaemonSet existence ✓
- Pod deployment across nodes ✓
- Pod readiness (all nodes healthy) ✓
- Configuration existence ✓

**Log Outputs Verified**:
- Container logs to CloudWatch
- PII masking active
- Kubernetes metadata enrichment

### 6. OpenTelemetry Collector Verification
Checks distributed tracing infrastructure.
- Deployment existence ✓
- Pod running status ✓
- Ready replicas ✓
- Service availability ✓
- Configuration existence ✓

**Receivers Verified**:
- OTLP/gRPC (port 4317)
- OTLP/HTTP (port 4318)

### 7. CloudWatch Logs Verification
Checks log group existence (requires AWS CLI).
- AWS credentials available ✓
- Log groups exist:
  - /lons/staging/application
  - /lons/staging/containers
  - /aws/rds/staging-postgres
  - /aws/elasticache/staging-redis

### 8. Metrics Scraping Verification
Checks Prometheus configuration for metric collection.
- ServiceMonitor resources configured ✓
- Target count > 0 ✓

## Port-Forward Instructions

After successful verification, access dashboards:

```bash
# Terminal 1: Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# http://localhost:9090
# - Status -> Targets: See all scraped metrics
# - Status -> ServiceMonitors: See scrape configuration
# - Graph: Query metrics with PromQL

# Terminal 2: Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80
# http://localhost:3000
# - Dashboards -> Browse
# - Create > Dashboard for custom visualizations
# - Default login: admin / prom-operator

# Terminal 3: AlertManager
kubectl port-forward -n monitoring svc/alertmanager 9093:9093
# http://localhost:9093
# - Alerts: View firing alerts
# - Silences: Silence alerts temporarily
# - Status: View configuration

# Terminal 4: OTel Collector Metrics
kubectl port-forward -n lons svc/lons-otel-collector 8888:8888
# http://localhost:8888/metrics
# - View OTel Collector internal metrics
```

## Verification Frequency

### Daily (Before Day's Testing)
```bash
./verify-observability.sh
```

### After Deployment Changes
```bash
./verify-observability.sh lons monitoring
```

### Before Production Promotion
```bash
./verify-observability.sh lons monitoring
# Verify all critical components passing
# Verify alerts are firing correctly
# Verify log collection active
# Verify trace collection active
```

## Interpreting Results

| Component | Pass | Warn | Fail |
|-----------|------|------|------|
| Kubernetes Access | kubectl + cluster + namespaces | cluster unreachable | kubectl not found |
| Prometheus | Running + rules + monitors | No monitors/rules | Pod not ready |
| Grafana | Running + dashboards | No dashboards | Pod not ready |
| AlertManager | Running + config | No config | Pod not ready |
| Fluent Bit | Running on all nodes | Missing some nodes | Daemonset failed |
| OTel Collector | Running + ready | Config missing | Pod not ready |
| CloudWatch | Log groups exist | AWS CLI missing | Groups don't exist |
| Metrics Scraping | Monitors configured | No monitors | Prometheus down |

## Troubleshooting Guide

### Problem: "Cannot connect to Kubernetes cluster"

**Cause**: kubeconfig not configured or credentials invalid

**Solution**:
```bash
# Check kubeconfig
echo $KUBECONFIG
ls ~/.kube/config

# Set kubeconfig
export KUBECONFIG=~/.kube/config-staging

# Test connection
kubectl cluster-info
```

### Problem: Prometheus Pod Not Ready

**Cause**: Resource constraints, image issues, or configuration errors

**Solution**:
```bash
# Check pod status
kubectl describe pod -n monitoring prometheus-0

# View logs
kubectl logs -n monitoring prometheus-0 --tail=50

# Check resource requests
kubectl top pod -n monitoring prometheus-0

# Check Prometheus target configuration
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Visit http://localhost:9090/targets
```

### Problem: No ServiceMonitors Detected

**Cause**: Services don't expose metrics or ServiceMonitor resources missing

**Solution**:
```bash
# Verify services have metrics ports
kubectl get svc -n lons -o wide

# Create ServiceMonitor for app services
# Edit: infrastructure/helm/lons/templates/monitoring/servicemonitor.yaml

# Verify ServiceMonitor labels match pod labels
kubectl get pods -n lons --show-labels
kubectl get servicemonitor -n lons -o yaml
```

### Problem: Grafana Can't Connect to Prometheus

**Cause**: Prometheus datasource misconfigured or pod DNS resolution issue

**Solution**:
```bash
# Check datasource in Grafana UI (http://localhost:3000)
# Configuration -> Data Sources -> Prometheus
# Test connection button

# Verify Prometheus service DNS
kubectl get svc -n monitoring prometheus

# Update datasource URL if needed:
# http://prometheus.monitoring.svc.cluster.local:9090
```

### Problem: Alerts Not Firing

**Cause**: Alert rules syntax error, metric doesn't exist, or evaluation threshold not met

**Solution**:
```bash
# Check alert rules syntax
kubectl get prometheusrule -n lons -o yaml | grep -A 5 "alert:"

# Verify metric exists in Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Query the metric in http://localhost:9090/graph

# Check alert evaluation
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Visit http://localhost:9090/alerts
# See "PENDING" vs "FIRING" state
```

## Success Criteria

✓ All Kubernetes access checks pass
✓ Prometheus running with 1/1 replicas ready
✓ Grafana running with 1/1 replicas ready
✓ AlertManager running with 1/1 replicas ready
✓ Fluent Bit running on all worker nodes
✓ OpenTelemetry Collector ready (1/1)
✓ Exit code = 0 (no failures)
✓ CloudWatch log groups exist (if AWS CLI available)

---

**Script Version**: 1.0
**Last Updated**: 2026-03-29
**Platform**: Lōns Staging
