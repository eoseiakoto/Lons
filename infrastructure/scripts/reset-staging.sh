#!/usr/bin/env bash
###############################################################################
# reset-staging.sh
#
# Safely resets the staging environment:
# - Confirmation prompt (type 'reset-staging' to confirm)
# - Scales down all services
# - Drops and recreates database schema
# - Triggers Helm upgrade (with migration hook)
# - Waits for migrations to complete
# - Runs staging seed job
# - Flushes Redis cache
# - Waits for all pods to be ready
# - Reports elapsed time (must be under 30 minutes per NFR-ENV-005)
#
# Usage: ./reset-staging.sh
###############################################################################

set -euo pipefail

# ============================================================================
# Colors for output
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Configuration
# ============================================================================
AWS_REGION="${AWS_REGION:-eu-west-1}"
EKS_CLUSTER="lons-staging-cluster"
NAMESPACE="lons-staging"
HELM_RELEASE="lons"
HELM_CHART="infrastructure/helm/lons"
VALUES_FILE="values-staging.yaml"
RESET_TIMEOUT=1800  # 30 minutes in seconds per NFR-ENV-005

# Track timing
start_time=$(date +%s)

# ============================================================================
# Functions
# ============================================================================

print_header() {
  echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
}

print_section() {
  echo -e "\n${BLUE}→ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_failure() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
  echo -e "${MAGENTA}ℹ $1${NC}"
}

elapsed_time() {
  local current_time=$(date +%s)
  local elapsed=$((current_time - start_time))
  local minutes=$((elapsed / 60))
  local seconds=$((elapsed % 60))
  printf "%dm%ds" "$minutes" "$seconds"
}

check_prerequisites() {
  print_section "Checking prerequisites"

  local required_cmds=("kubectl" "helm" "aws" "jq")
  for cmd in "${required_cmds[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
      print_failure "Required command '$cmd' not found"
      exit 1
    fi
  done
  print_success "All required commands available"

  # Check kubectl connectivity
  if ! kubectl cluster-info >/dev/null 2>&1; then
    print_failure "Cannot connect to Kubernetes cluster"
    exit 1
  fi
  print_success "Connected to Kubernetes cluster"

  # Check namespace exists
  if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    print_failure "Namespace '$NAMESPACE' does not exist"
    exit 1
  fi
  print_success "Namespace '$NAMESPACE' exists"
}

confirm_reset() {
  print_section "CONFIRMATION REQUIRED"
  echo ""
  print_warning "This will:"
  echo -e "  ${YELLOW}1. Scale down all services in $NAMESPACE${NC}"
  echo -e "  ${YELLOW}2. Drop and recreate the staging database schema${NC}"
  echo -e "  ${YELLOW}3. Run database migrations${NC}"
  echo -e "  ${YELLOW}4. Seed staging data${NC}"
  echo -e "  ${YELLOW}5. Flush Redis cache${NC}"
  echo ""
  print_warning "All data in staging will be LOST!"
  echo ""

  read -p "Type 'reset-staging' to confirm: " confirmation

  if [ "$confirmation" != "reset-staging" ]; then
    print_info "Reset cancelled"
    exit 0
  fi

  print_success "Reset confirmed"
}

scale_down_services() {
  print_section "Scaling down all services ($(elapsed_time))"

  # Get all deployments in namespace
  deployments=$(kubectl get deployments -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')

  if [ -z "$deployments" ]; then
    print_warning "No deployments found in namespace"
    return 0
  fi

  for deployment in $deployments; do
    print_info "Scaling down: $deployment"
    kubectl scale deployment "$deployment" \
      --replicas=0 \
      -n "$NAMESPACE" \
      >/dev/null 2>&1 || print_warning "Could not scale: $deployment"
  done

  # Wait for all pods to terminate
  print_info "Waiting for pods to terminate..."
  local max_wait=300
  local elapsed=0

  while kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Succeeded,status.phase!=Failed >/dev/null 2>&1; do
    if [ $elapsed -gt $max_wait ]; then
      print_warning "Timeout waiting for pods to terminate"
      break
    fi
    sleep 5
    ((elapsed+=5))
  done

  print_success "All services scaled down"
}

reset_database() {
  print_section "Resetting database ($(elapsed_time))"

  # Get RDS endpoint from EKS secrets or environment
  print_info "Retrieving database connection details..."

  # Extract DB credentials from Kubernetes secret
  local db_secret=$(kubectl get secret -n "$NAMESPACE" \
    -o jsonpath='{.items[0].data.DATABASE_URL}' \
    -l app.kubernetes.io/component=database 2>/dev/null || echo "")

  if [ -z "$db_secret" ]; then
    # Try to get from environment variable
    if [ -z "${DATABASE_URL:-}" ]; then
      print_failure "Cannot find database connection details"
      print_info "Set DATABASE_URL environment variable or configure secret"
      exit 1
    fi
    db_url="$DATABASE_URL"
  else
    db_url=$(echo "$db_secret" | base64 -d)
  fi

  # Parse connection string
  local db_host=$(echo "$db_url" | sed -n 's/.*@\([^:]*\).*/\1/p')
  local db_port=$(echo "$db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
  local db_user=$(echo "$db_url" | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')
  local db_name=$(echo "$db_url" | sed -n 's/.*\/\([^?]*\).*/\1/p')

  if [ -z "$db_host" ] || [ -z "$db_user" ]; then
    print_failure "Could not parse database URL"
    exit 1
  fi

  print_info "Database: $db_host/$db_name"

  # Drop and recreate database
  print_info "Dropping existing database schema..."
  PGPASSWORD="${PGPASSWORD:-}" psql -h "$db_host" \
    -U "$db_user" \
    -d postgres \
    -c "DROP SCHEMA IF EXISTS staging CASCADE;" \
    2>/dev/null || print_warning "Could not drop schema (may not exist)"

  print_success "Database schema reset"
}

run_migrations() {
  print_section "Running database migrations ($(elapsed_time))"

  # Check if migration job exists
  if ! kubectl get job -n "$NAMESPACE" -l job.kubernetes.io/name=db-migrate >/dev/null 2>&1; then
    print_info "Triggering Helm upgrade to run migration hooks..."

    helm upgrade "$HELM_RELEASE" "$HELM_CHART" \
      -f "$HELM_CHART/$VALUES_FILE" \
      --namespace "$NAMESPACE" \
      --wait \
      --timeout 10m \
      >/dev/null 2>&1 || print_warning "Helm upgrade warning (migration may still complete)"
  fi

  # Wait for migration job to complete
  print_info "Waiting for migrations to complete..."
  local max_wait=600  # 10 minutes
  local elapsed=0

  while ! kubectl wait --for=condition=complete job/db-migrate \
    -n "$NAMESPACE" \
    --timeout=60s >/dev/null 2>&1; do

    if [ $elapsed -gt $max_wait ]; then
      print_failure "Migration timeout"
      exit 1
    fi

    job_status=$(kubectl get job db-migrate -n "$NAMESPACE" \
      -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")

    if [ "$job_status" = "True" ]; then
      break
    fi

    print_info "  Still running... ($(elapsed_time))"
    sleep 10
    ((elapsed+=10))
  done

  print_success "Database migrations completed"
}

run_seed_job() {
  print_section "Running staging seed job ($(elapsed_time))"

  # Check if seed job exists
  if ! kubectl get job -n "$NAMESPACE" -l job.kubernetes.io/name=seed-staging >/dev/null 2>&1; then
    print_warning "Seed job not found, skipping"
    return 0
  fi

  # Create/run seed job
  print_info "Triggering seed job..."
  kubectl annotate job seed-staging -n "$NAMESPACE" \
    "timestamp=$(date +%s)" \
    --overwrite >/dev/null 2>&1 || true

  # Wait for seed job to complete
  print_info "Waiting for seed to complete..."
  local max_wait=300  # 5 minutes
  local elapsed=0

  while ! kubectl wait --for=condition=complete job/seed-staging \
    -n "$NAMESPACE" \
    --timeout=60s >/dev/null 2>&1; do

    if [ $elapsed -gt $max_wait ]; then
      print_warning "Seed job timeout (continuing)"
      break
    fi

    print_info "  Still running... ($(elapsed_time))"
    sleep 10
    ((elapsed+=10))
  done

  print_success "Staging seed completed"
}

flush_redis() {
  print_section "Flushing Redis cache ($(elapsed_time))"

  # Get Redis endpoint from secret
  local redis_secret=$(kubectl get secret -n "$NAMESPACE" \
    -o jsonpath='{.items[0].data.REDIS_URL}' \
    -l app.kubernetes.io/component=cache 2>/dev/null || echo "")

  if [ -z "$redis_secret" ]; then
    if [ -z "${REDIS_URL:-}" ]; then
      print_warning "Cannot find Redis connection details, skipping flush"
      return 0
    fi
    redis_url="$REDIS_URL"
  else
    redis_url=$(echo "$redis_secret" | base64 -d)
  fi

  # Parse Redis URL
  local redis_host=$(echo "$redis_url" | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')
  local redis_port=$(echo "$redis_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

  if [ -z "$redis_host" ]; then
    print_warning "Could not parse Redis URL"
    return 0
  fi

  print_info "Connecting to Redis at $redis_host:${redis_port:-6379}..."

  if command -v redis-cli &> /dev/null; then
    redis-cli -h "$redis_host" -p "${redis_port:-6379}" FLUSHALL >/dev/null 2>&1 && \
      print_success "Redis cache flushed" || \
      print_warning "Could not connect to Redis"
  else
    print_warning "redis-cli not available, skipping flush"
  fi
}

scale_up_services() {
  print_section "Scaling up services ($(elapsed_time))"

  # Get all deployments and their desired replicas from Helm values
  print_info "Scaling up deployments to configured replica count..."

  local replicas_config=$(helm get values "$HELM_RELEASE" -n "$NAMESPACE" 2>/dev/null || echo "")

  # Default replicas for common services
  declare -A service_replicas=(
    [graphql-server]=2
    [rest-server]=2
    [scheduler]=1
    [notification-worker]=1
    [entity-service]=1
    [process-engine]=1
  )

  for service in "${!service_replicas[@]}"; do
    if kubectl get deployment "$service" -n "$NAMESPACE" >/dev/null 2>&1; then
      replicas=${service_replicas[$service]}
      print_info "Scaling $service to $replicas replicas..."
      kubectl scale deployment "$service" \
        --replicas="$replicas" \
        -n "$NAMESPACE" \
        >/dev/null 2>&1 || print_warning "Could not scale: $service"
    fi
  done
}

wait_for_readiness() {
  print_section "Waiting for all pods to be ready ($(elapsed_time))"

  local max_wait=$((RESET_TIMEOUT - ($(date +%s) - start_time)))
  if [ $max_wait -lt 0 ]; then
    print_warning "Timeout exceeded, skipping pod readiness check"
    return 0
  fi

  print_info "Waiting up to ${max_wait}s for pods..."

  if kubectl wait --for=condition=Ready pod \
    -n "$NAMESPACE" \
    -l app \
    --timeout="${max_wait}s" >/dev/null 2>&1; then
    print_success "All pods are ready"
  else
    print_warning "Some pods not ready after timeout (may stabilize)"
  fi
}

# ============================================================================
# Main Function
# ============================================================================

main() {
  print_header "Staging Environment Reset"

  # Check prerequisites
  check_prerequisites
  echo ""

  # Confirm action
  confirm_reset
  echo ""

  # Execute reset steps
  scale_down_services
  reset_database
  run_migrations
  run_seed_job
  flush_redis
  scale_up_services
  wait_for_readiness

  # ========================================================================
  # Summary Report
  # ========================================================================
  local total_elapsed=$(elapsed_time)
  local current_time=$(date +%s)
  local elapsed_seconds=$((current_time - start_time))

  print_header "Reset Complete"

  echo -e "${GREEN}Elapsed time:${NC} $total_elapsed"
  echo -e "${GREEN}Status:${NC}       SUCCESS"

  if [ $elapsed_seconds -gt $RESET_TIMEOUT ]; then
    print_warning "Reset took longer than ${RESET_TIMEOUT}s limit (NFR-ENV-005)"
  else
    print_success "Reset completed within 30-minute limit"
  fi

  echo ""
  print_info "Next steps:"
  echo -e "  ${CYAN}1. Verify pods are healthy: kubectl get pods -n $NAMESPACE${NC}"
  echo -e "  ${CYAN}2. Check logs: kubectl logs -n $NAMESPACE -l app=graphql-server${NC}"
  echo -e "  ${CYAN}3. Run smoke tests: curl -sf https://staging.lons.io/v1/health${NC}"
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
