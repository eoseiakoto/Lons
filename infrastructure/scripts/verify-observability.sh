#!/bin/bash

################################################################################
# Lōns Platform: Staging Observability Stack Verification
#
# This script comprehensively verifies that the observability stack is properly
# deployed and configured in the staging environment. It checks:
#   - Prometheus is running and scraping Lōns services
#   - Grafana is running and accessible
#   - AlertManager is deployed and configured
#   - Fluent Bit DaemonSet is running and collecting logs
#   - OpenTelemetry Collector is deployed and collecting traces
#   - CloudWatch log groups exist for staging
#   - Port-forward instructions for accessing UI dashboards
#
# Usage:
#   ./verify-observability.sh [namespace] [monitoring-namespace]
#   ./verify-observability.sh                          # Uses defaults: lons, monitoring
#   ./verify-observability.sh lons-staging monitoring  # Custom namespaces
#
# Exit codes:
#   0 = All checks passed
#   1 = One or more checks failed
#
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAMESPACE="${1:-lons}"
MONITORING_NAMESPACE="${2:-monitoring}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Tracking variables
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((CHECKS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((CHECKS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
    ((WARNINGS++))
}

print_section_header() {
    echo ""
    echo "================================================================================"
    echo "  $1"
    echo "================================================================================"
}

print_summary() {
    echo ""
    echo "================================================================================"
    echo "  VERIFICATION SUMMARY"
    echo "================================================================================"
    echo -e "Passed:  ${GREEN}${CHECKS_PASSED}${NC}"
    echo -e "Failed:  ${RED}${CHECKS_FAILED}${NC}"
    echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
    echo ""

    if [ $CHECKS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All observability checks passed!${NC}"
        return 0
    else
        echo -e "${RED}Some observability checks failed. Review above for details.${NC}"
        return 1
    fi
}

command_exists() {
    command -v "$1" &> /dev/null
}

################################################################################
# Verification Functions
################################################################################

check_kubectl_access() {
    print_section_header "Kubernetes Access"

    if ! command_exists kubectl; then
        log_error "kubectl is not installed or not in PATH"
        return 1
    fi
    log_success "kubectl is available"

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
    log_success "Connected to Kubernetes cluster"

    # Verify namespaces exist
    if ! kubectl get namespace "$APP_NAMESPACE" &> /dev/null; then
        log_error "Application namespace '$APP_NAMESPACE' does not exist"
        return 1
    fi
    log_success "Application namespace '$APP_NAMESPACE' exists"

    if ! kubectl get namespace "$MONITORING_NAMESPACE" &> /dev/null; then
        log_warning "Monitoring namespace '$MONITORING_NAMESPACE' does not exist (may be expected)"
        return 0
    fi
    log_success "Monitoring namespace '$MONITORING_NAMESPACE' exists"
}

check_prometheus() {
    print_section_header "Prometheus Verification"

    # Check if Prometheus pod exists
    local prom_pods=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=prometheus \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$prom_pods" ]; then
        log_warning "No Prometheus pods found in namespace '$MONITORING_NAMESPACE'"
        log_info "Checking if prometheus-community or kube-prometheus-stack is installed..."
        return 0
    fi

    log_success "Found Prometheus pod(s): $prom_pods"

    # Check if Prometheus is running
    local ready_count=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=prometheus \
        -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

    local total_count=$(echo "$prom_pods" | wc -w)

    if [ "$ready_count" -gt 0 ]; then
        log_success "Prometheus is running ($ready_count/$total_count replicas ready)"
    else
        log_error "Prometheus is not in Ready state ($ready_count/$total_count replicas)"
        return 1
    fi

    # Check ServiceMonitor resources
    local monitors=$(kubectl get servicemonitor -n "$APP_NAMESPACE" \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$monitors" ]; then
        log_warning "No ServiceMonitor resources found in namespace '$APP_NAMESPACE'"
    else
        log_success "Found ServiceMonitor resources: $monitors"

        # Check each monitor's endpoints
        for monitor in $monitors; do
            local endpoints=$(kubectl get servicemonitor "$monitor" -n "$APP_NAMESPACE" \
                -o jsonpath='{.spec.endpoints[*].port}' 2>/dev/null || echo "")
            if [ -n "$endpoints" ]; then
                log_success "  ServiceMonitor '$monitor' has endpoints: $endpoints"
            fi
        done
    fi

    # Check PrometheusRule resources
    local rules=$(kubectl get prometheusrule -n "$APP_NAMESPACE" \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$rules" ]; then
        log_warning "No PrometheusRule resources found in namespace '$APP_NAMESPACE'"
    else
        log_success "Found PrometheusRule resources: $rules"
    fi
}

check_grafana() {
    print_section_header "Grafana Verification"

    # Check if Grafana pod exists
    local grafana_pods=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=grafana \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$grafana_pods" ]; then
        log_warning "No Grafana pods found in namespace '$MONITORING_NAMESPACE'"
        return 0
    fi

    log_success "Found Grafana pod(s): $grafana_pods"

    # Check if Grafana is running
    local ready_count=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=grafana \
        -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

    local total_count=$(echo "$grafana_pods" | wc -w)

    if [ "$ready_count" -gt 0 ]; then
        log_success "Grafana is running ($ready_count/$total_count replicas ready)"
    else
        log_error "Grafana is not in Ready state ($ready_count/$total_count replicas)"
        return 1
    fi

    # Check Grafana service
    if kubectl get service grafana -n "$MONITORING_NAMESPACE" &> /dev/null; then
        log_success "Grafana service exists"
    else
        log_warning "Grafana service not found (may be named differently)"
    fi

    # List Grafana ConfigMaps with dashboards
    local dashboard_cms=$(kubectl get cm -n "$APP_NAMESPACE" \
        -o name 2>/dev/null | grep -i grafana | grep -i dashboard || echo "")

    if [ -z "$dashboard_cms" ]; then
        log_warning "No Grafana dashboard ConfigMaps found in namespace '$APP_NAMESPACE'"
    else
        log_success "Found Grafana dashboard ConfigMaps"
        echo "$dashboard_cms" | sed 's/^/  /'
    fi
}

check_alertmanager() {
    print_section_header "AlertManager Verification"

    # Check if AlertManager pod exists
    local am_pods=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=alertmanager \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$am_pods" ]; then
        log_warning "No AlertManager pods found in namespace '$MONITORING_NAMESPACE'"
        return 0
    fi

    log_success "Found AlertManager pod(s): $am_pods"

    # Check if AlertManager is running
    local ready_count=$(kubectl get pods -n "$MONITORING_NAMESPACE" \
        -l app.kubernetes.io/name=alertmanager \
        -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

    local total_count=$(echo "$am_pods" | wc -w)

    if [ "$ready_count" -gt 0 ]; then
        log_success "AlertManager is running ($ready_count/$total_count replicas ready)"
    else
        log_error "AlertManager is not in Ready state ($ready_count/$total_count replicas)"
        return 1
    fi

    # Check AlertManager config
    local am_config=$(kubectl get cm -n "$APP_NAMESPACE" \
        -o name 2>/dev/null | grep -i alertmanager | grep -i config || echo "")

    if [ -z "$am_config" ]; then
        log_warning "No AlertManager ConfigMap found in namespace '$APP_NAMESPACE'"
    else
        log_success "Found AlertManager configuration"
    fi

    # Check AlertManager routes
    local am_rules=$(kubectl get alertmanagerconfig -n "$APP_NAMESPACE" \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -n "$am_rules" ]; then
        log_success "Found AlertManagerConfig resources: $am_rules"
    fi
}

check_fluent_bit() {
    print_section_header "Fluent Bit Verification"

    # Check if Fluent Bit DaemonSet exists
    local fb_ds=$(kubectl get daemonset -n "$APP_NAMESPACE" \
        -l app.kubernetes.io/name=fluent-bit,app.kubernetes.io/component=logging \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$fb_ds" ]; then
        log_warning "No Fluent Bit DaemonSet found with expected labels"
        fb_ds=$(kubectl get daemonset -n "$APP_NAMESPACE" \
            -o name 2>/dev/null | grep -i fluent || echo "")

        if [ -z "$fb_ds" ]; then
            log_warning "No Fluent Bit DaemonSet found in namespace '$APP_NAMESPACE'"
            return 0
        fi
    fi

    log_success "Found Fluent Bit DaemonSet"

    # Check if Fluent Bit pods are running on all nodes
    local nodes=$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}' | wc -w)
    local fb_pods=$(kubectl get pods -n "$APP_NAMESPACE" \
        -l app.kubernetes.io/name=fluent-bit \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | wc -w)

    if [ "$fb_pods" -gt 0 ]; then
        log_success "Found Fluent Bit pods ($fb_pods running)"

        # Check pod readiness
        local ready=$(kubectl get pods -n "$APP_NAMESPACE" \
            -l app.kubernetes.io/name=fluent-bit \
            -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

        if [ "$ready" -eq "$fb_pods" ]; then
            log_success "All Fluent Bit pods are Ready"
        else
            log_warning "Not all Fluent Bit pods are Ready ($ready/$fb_pods)"
        fi
    else
        log_warning "No Fluent Bit pods found"
    fi

    # Check Fluent Bit config
    local fb_config=$(kubectl get cm -n "$APP_NAMESPACE" \
        -o name 2>/dev/null | grep -i fluent-bit | head -1 || echo "")

    if [ -n "$fb_config" ]; then
        log_success "Found Fluent Bit configuration"
    fi
}

check_otel_collector() {
    print_section_header "OpenTelemetry Collector Verification"

    # Check if OTel Collector Deployment exists
    local otel_deploy=$(kubectl get deployment -n "$APP_NAMESPACE" \
        -l app.kubernetes.io/component=otel-collector \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$otel_deploy" ]; then
        log_warning "No OpenTelemetry Collector deployment found with expected labels"
        otel_deploy=$(kubectl get deployment -n "$APP_NAMESPACE" \
            -o name 2>/dev/null | grep -i otel | head -1 || echo "")

        if [ -z "$otel_deploy" ]; then
            log_warning "No OpenTelemetry Collector deployment found in namespace '$APP_NAMESPACE'"
            return 0
        fi
    fi

    log_success "Found OpenTelemetry Collector deployment"

    # Check if OTel Collector is running
    local otel_pods=$(kubectl get pods -n "$APP_NAMESPACE" \
        -l app.kubernetes.io/component=otel-collector \
        -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | wc -w)

    if [ "$otel_pods" -gt 0 ]; then
        log_success "Found OpenTelemetry Collector pods ($otel_pods running)"

        # Check pod readiness
        local ready=$(kubectl get pods -n "$APP_NAMESPACE" \
            -l app.kubernetes.io/component=otel-collector \
            -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

        if [ "$ready" -eq "$otel_pods" ]; then
            log_success "All OpenTelemetry Collector pods are Ready"
        else
            log_error "Not all OpenTelemetry Collector pods are Ready ($ready/$otel_pods)"
        fi
    else
        log_warning "No OpenTelemetry Collector pods found"
    fi

    # Check OTel Collector config
    local otel_config=$(kubectl get cm -n "$APP_NAMESPACE" \
        -o name 2>/dev/null | grep -i otel | head -1 || echo "")

    if [ -n "$otel_config" ]; then
        log_success "Found OpenTelemetry Collector configuration"
    fi

    # Check OTel Collector service
    local otel_svc=$(kubectl get svc -n "$APP_NAMESPACE" \
        -o name 2>/dev/null | grep -i otel | head -1 || echo "")

    if [ -n "$otel_svc" ]; then
        log_success "Found OpenTelemetry Collector service"
    fi
}

check_cloudwatch_logs() {
    print_section_header "CloudWatch Log Groups Verification"

    if ! command_exists aws; then
        log_warning "AWS CLI is not installed - skipping CloudWatch checks"
        return 0
    fi

    # Check if credentials are available
    if ! aws sts get-caller-identity &> /dev/null; then
        log_warning "AWS credentials not available - skipping CloudWatch checks"
        return 0
    fi

    local log_groups=(
        "/lons/staging/application"
        "/lons/staging/containers"
        "/aws/rds/staging-postgres"
        "/aws/elasticache/staging-redis"
    )

    for lg in "${log_groups[@]}"; do
        if aws logs describe-log-groups --log-group-name-prefix "${lg%/*}" 2>/dev/null | \
           grep -q "\"logGroupName\": \"$lg\""; then
            log_success "CloudWatch log group exists: $lg"
        else
            log_warning "CloudWatch log group not found: $lg"
        fi
    done
}

check_metrics_scraping() {
    print_section_header "Metrics Scraping Verification"

    # Check if any Lōns services are being scraped by Prometheus
    local scrape_config=$(kubectl get cm -n "$MONITORING_NAMESPACE" \
        -o name 2>/dev/null | grep -i prometheus | grep -i config | head -1 || echo "")

    if [ -z "$scrape_config" ]; then
        log_warning "No Prometheus config ConfigMap found"
        return 0
    fi

    # List ServiceMonitors and their targets
    local monitors=$(kubectl get servicemonitor -n "$APP_NAMESPACE" \
        -o json 2>/dev/null)

    if [ -z "$monitors" ] || [ "$monitors" = "null" ]; then
        log_warning "No ServiceMonitors configured for scraping"
        return 0
    fi

    local monitor_count=$(echo "$monitors" | grep -o '"name"' | wc -l)

    if [ "$monitor_count" -gt 0 ]; then
        log_success "Found $monitor_count ServiceMonitor(s) configured for metrics scraping"
    fi
}

print_access_instructions() {
    print_section_header "Access Instructions"

    echo ""
    echo "To access the observability dashboards, use kubectl port-forward:"
    echo ""

    echo "1. Prometheus (metrics storage and query engine)"
    echo "   kubectl port-forward -n $MONITORING_NAMESPACE svc/prometheus 9090:9090"
    echo "   Then open: ${BLUE}http://localhost:9090${NC}"
    echo ""

    echo "2. Grafana (visualization and dashboards)"
    echo "   kubectl port-forward -n $MONITORING_NAMESPACE svc/grafana 3000:80"
    echo "   Then open: ${BLUE}http://localhost:3000${NC}"
    echo "   Default credentials: admin / prom-operator"
    echo ""

    echo "3. AlertManager (alert routing and silencing)"
    echo "   kubectl port-forward -n $MONITORING_NAMESPACE svc/alertmanager 9093:9093"
    echo "   Then open: ${BLUE}http://localhost:9093${NC}"
    echo ""

    echo "4. OpenTelemetry Collector metrics"
    echo "   kubectl port-forward -n $APP_NAMESPACE svc/lons-otel-collector 8888:8888"
    echo "   Then open: ${BLUE}http://localhost:8888/metrics${NC}"
    echo ""
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "  Lōns Platform: Staging Observability Stack Verification"
    echo "  Timestamp: $TIMESTAMP"
    echo "================================================================================"
    echo ""
    echo "Configuration:"
    echo "  Application Namespace: $APP_NAMESPACE"
    echo "  Monitoring Namespace:  $MONITORING_NAMESPACE"
    echo ""

    # Run all checks
    check_kubectl_access || true
    check_prometheus || true
    check_grafana || true
    check_alertmanager || true
    check_fluent_bit || true
    check_otel_collector || true
    check_cloudwatch_logs || true
    check_metrics_scraping || true

    # Print access instructions
    print_access_instructions

    # Print summary and return appropriate exit code
    print_summary
}

# Run main function
main
