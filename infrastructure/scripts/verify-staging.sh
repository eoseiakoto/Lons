#!/bin/bash

################################################################################
# verify-staging.sh — Staging Environment Verification
#
# Purpose:
#   Comprehensive health check and verification of the staging environment.
#   Validates infrastructure, Kubernetes cluster, namespaces, operators,
#   and connectivity to critical services.
#
# Prerequisites:
#   - AWS CLI v2 configured with appropriate credentials
#   - kubectl configured and authenticated
#   - Helm >= 3.12
#   - jq for JSON parsing
#
# Usage:
#   ./verify-staging.sh [--verbose] [--check-endpoints]
#
# Options:
#   --verbose           Print detailed output for each check
#   --check-endpoints   Attempt to connect to service endpoints (RDS, Redis, etc)
#
# Exit codes:
#   0   All checks passed
#   1   One or more checks failed
#   2   Prerequisites not met
#
################################################################################

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TERRAFORM_DIR="${PROJECT_ROOT}/infrastructure/terraform"

ENVIRONMENT="staging"
REGION="eu-west-1"
NAMESPACE="lons-staging"
VERBOSE=false
CHECK_ENDPOINTS=false

# Expected operator namespaces and deployment names
declare -A OPERATOR_CHECKS=(
  [external-secrets]="external-secrets"
  [cert-manager]="cert-manager-webhook"
  [nginx-ingress]="ingress-nginx-controller"
  [kube-prometheus]="kube-prometheus-operator"
)

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Check result tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING & OUTPUT
# ──────────────────────────────────────────────────────────────────────────────

log_section() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$*${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_pass() {
  echo -e "${GREEN}✓${NC} $*"
  ((CHECKS_PASSED++))
}

check_fail() {
  echo -e "${RED}✗${NC} $*"
  ((CHECKS_FAILED++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $*"
  ((CHECKS_WARNED++))
}

check_info() {
  echo -e "${BLUE}ℹ${NC} $*"
}

verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $*"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# PARSE ARGUMENTS
# ──────────────────────────────────────────────────────────────────────────────

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --verbose)
        VERBOSE=true
        shift
        ;;
      --check-endpoints)
        CHECK_ENDPOINTS=true
        shift
        ;;
      -h|--help)
        head -25 "${BASH_SOURCE[0]}" | sed 's/^# *//'
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        exit 2
        ;;
    esac
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# PREREQUISITES CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_prerequisites() {
  log_section "Checking Prerequisites"

  local commands=("aws" "kubectl" "helm" "jq")
  for cmd in "${commands[@]}"; do
    if command -v "${cmd}" &> /dev/null; then
      check_pass "Command '${cmd}' available"
    else
      check_fail "Command '${cmd}' not found"
      return 1
    fi
  done

  # Check AWS credentials
  if aws sts get-caller-identity &> /dev/null; then
    check_pass "AWS credentials configured"
  else
    check_fail "AWS credentials not available"
    return 1
  fi

  # Check kubectl connection
  if kubectl cluster-info &> /dev/null; then
    check_pass "kubectl can reach cluster"
  else
    check_fail "kubectl cannot reach cluster"
    return 1
  fi

  return 0
}

# ──────────────────────────────────────────────────────────────────────────────
# AWS INFRASTRUCTURE CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_eks_cluster() {
  log_section "Checking EKS Cluster"

  local cluster_name="lons-eks-${ENVIRONMENT}"

  # Check if cluster exists
  if aws eks describe-cluster --name "${cluster_name}" --region "${REGION}" &> /dev/null; then
    check_pass "EKS cluster '${cluster_name}' exists"

    # Get cluster details
    local cluster_status
    local cluster_version
    local node_count

    cluster_status=$(aws eks describe-cluster --name "${cluster_name}" --region "${REGION}" --query 'cluster.status' --output text 2>/dev/null)
    cluster_version=$(aws eks describe-cluster --name "${cluster_name}" --region "${REGION}" --query 'cluster.version' --output text 2>/dev/null)
    node_count=$(aws eks list-nodegroups --cluster-name "${cluster_name}" --region "${REGION}" --query 'nodegroups | length(@)' --output text 2>/dev/null)

    verbose "  Status: ${cluster_status}"
    verbose "  Version: ${cluster_version}"
    verbose "  Node Groups: ${node_count}"

    if [[ "${cluster_status}" == "ACTIVE" ]]; then
      check_pass "EKS cluster status: ACTIVE"
    else
      check_warn "EKS cluster status: ${cluster_status} (expected ACTIVE)"
    fi
  else
    check_fail "EKS cluster '${cluster_name}' not found"
    return 1
  fi

  # Check node readiness
  local ready_nodes
  ready_nodes=$(kubectl get nodes -o json 2>/dev/null | jq '[.items[] | select(.status.conditions[] | select(.type=="Ready" and .status=="True"))] | length' || echo "0")

  local total_nodes
  total_nodes=$(kubectl get nodes -o json 2>/dev/null | jq '.items | length' || echo "0")

  if [[ "${ready_nodes}" -gt 0 ]]; then
    check_pass "EKS nodes ready: ${ready_nodes}/${total_nodes}"
  else
    check_fail "No EKS nodes in ready state"
    return 1
  fi
}

check_rds_instance() {
  log_section "Checking RDS Instance"

  local db_instance_id="lons-${ENVIRONMENT}-postgres"

  # Check if RDS instance exists
  if aws rds describe-db-instances --db-instance-identifier "${db_instance_id}" --region "${REGION}" &> /dev/null; then
    check_pass "RDS instance '${db_instance_id}' exists"

    # Get instance details
    local db_status
    local db_engine
    local db_class

    db_status=$(aws rds describe-db-instances --db-instance-identifier "${db_instance_id}" --region "${REGION}" --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null)
    db_engine=$(aws rds describe-db-instances --db-instance-identifier "${db_instance_id}" --region "${REGION}" --query 'DBInstances[0].Engine' --output text 2>/dev/null)
    db_class=$(aws rds describe-db-instances --db-instance-identifier "${db_instance_id}" --region "${REGION}" --query 'DBInstances[0].DBInstanceClass' --output text 2>/dev/null)

    verbose "  Status: ${db_status}"
    verbose "  Engine: ${db_engine}"
    verbose "  Instance Class: ${db_class}"

    if [[ "${db_status}" == "available" ]]; then
      check_pass "RDS instance status: available"
    else
      check_warn "RDS instance status: ${db_status}"
    fi
  else
    check_fail "RDS instance '${db_instance_id}' not found"
  fi
}

check_redis_cluster() {
  log_section "Checking ElastiCache Redis"

  local cache_cluster_id="lons-${ENVIRONMENT}-redis"

  # Check if Redis cluster exists
  if aws elasticache describe-replication-groups --replication-group-id "${cache_cluster_id}" --region "${REGION}" &> /dev/null; then
    check_pass "ElastiCache Redis cluster '${cache_cluster_id}' exists"

    # Get cluster details
    local status
    local engine
    local node_type

    status=$(aws elasticache describe-replication-groups --replication-group-id "${cache_cluster_id}" --region "${REGION}" --query 'ReplicationGroups[0].Status' --output text 2>/dev/null)
    engine=$(aws elasticache describe-replication-groups --replication-group-id "${cache_cluster_id}" --region "${REGION}" --query 'ReplicationGroups[0].Engine' --output text 2>/dev/null)
    node_type=$(aws elasticache describe-replication-groups --replication-group-id "${cache_cluster_id}" --region "${REGION}" --query 'ReplicationGroups[0].CacheNodeType' --output text 2>/dev/null)

    verbose "  Status: ${status}"
    verbose "  Engine: ${engine}"
    verbose "  Node Type: ${node_type}"

    if [[ "${status}" == "available" ]]; then
      check_pass "Redis cluster status: available"
    else
      check_warn "Redis cluster status: ${status}"
    fi
  else
    check_fail "ElastiCache Redis cluster '${cache_cluster_id}' not found"
  fi
}

check_alb() {
  log_section "Checking Application Load Balancer"

  # Get ALB from tags
  local alb_name="lons-${ENVIRONMENT}-alb"

  if aws elbv2 describe-load-balancers --region "${REGION}" --query "LoadBalancers[?LoadBalancerName=='${alb_name}']" 2>/dev/null | jq -e '.[] | length > 0' &> /dev/null; then
    check_pass "ALB '${alb_name}' exists"

    # Get ALB details
    local alb_status
    local alb_dns

    alb_status=$(aws elbv2 describe-load-balancers --region "${REGION}" --query "LoadBalancers[?LoadBalancerName=='${alb_name}'].State.Code" --output text 2>/dev/null)
    alb_dns=$(aws elbv2 describe-load-balancers --region "${REGION}" --query "LoadBalancers[?LoadBalancerName=='${alb_name}'].DNSName" --output text 2>/dev/null)

    verbose "  Status: ${alb_status}"
    verbose "  DNS Name: ${alb_dns}"

    if [[ "${alb_status}" == "active" ]]; then
      check_pass "ALB status: active"
    else
      check_warn "ALB status: ${alb_status}"
    fi
  else
    check_fail "ALB '${alb_name}' not found"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# KUBERNETES CLUSTER CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_kubernetes_api() {
  log_section "Checking Kubernetes API"

  # Get cluster info
  if kubectl cluster-info &> /dev/null; then
    check_pass "Kubernetes API accessible"

    local k8s_version
    k8s_version=$(kubectl version --short 2>/dev/null | grep Server | awk '{print $3}' || echo "unknown")
    verbose "  Kubernetes Version: ${k8s_version}"
  else
    check_fail "Kubernetes API not accessible"
    return 1
  fi

  # Check API server health
  local api_health
  api_health=$(kubectl get --raw /healthz 2>/dev/null || echo "failed")

  if [[ "${api_health}" == "ok" ]]; then
    check_pass "API server health check: ok"
  else
    check_warn "API server health check: ${api_health}"
  fi
}

check_namespace() {
  log_section "Checking Kubernetes Namespace"

  if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
    check_pass "Namespace '${NAMESPACE}' exists"

    # Check namespace labels
    local labels
    labels=$(kubectl get namespace "${NAMESPACE}" -o json | jq -r '.metadata.labels | to_entries | map("\(.key)=\(.value)") | join(", ")' 2>/dev/null)

    verbose "  Labels: ${labels}"

    # Verify key labels
    local environment_label
    local team_label
    local app_label

    environment_label=$(kubectl get namespace "${NAMESPACE}" -o json | jq -r '.metadata.labels.environment' 2>/dev/null)
    team_label=$(kubectl get namespace "${NAMESPACE}" -o json | jq -r '.metadata.labels.team' 2>/dev/null)
    app_label=$(kubectl get namespace "${NAMESPACE}" -o json | jq -r '.metadata.labels."app.kubernetes.io/part-of"' 2>/dev/null)

    [[ "${environment_label}" == "${ENVIRONMENT}" ]] && check_pass "Label environment=${ENVIRONMENT} set" || check_warn "Label environment=${ENVIRONMENT} not set"
    [[ "${team_label}" == "engineering" ]] && check_pass "Label team=engineering set" || check_warn "Label team=engineering not set"
    [[ "${app_label}" == "lons" ]] && check_pass "Label app.kubernetes.io/part-of=lons set" || check_warn "Label app.kubernetes.io/part-of=lons not set"
  else
    check_fail "Namespace '${NAMESPACE}' does not exist"
    return 1
  fi
}

check_operators() {
  log_section "Checking Kubernetes Operators"

  for operator in external-secrets cert-manager nginx-ingress kube-prometheus; do
    check_operator "${operator}"
  done
}

check_operator() {
  local operator=$1
  local ns=""

  case "${operator}" in
    external-secrets)
      ns="external-secrets"
      ;;
    cert-manager)
      ns="cert-manager"
      ;;
    nginx-ingress)
      ns="ingress-nginx"
      ;;
    kube-prometheus)
      ns="monitoring"
      ;;
  esac

  # Check if namespace exists
  if ! kubectl get namespace "${ns}" &> /dev/null; then
    check_fail "${operator}: namespace '${ns}' not found"
    return 1
  fi

  # Check for Helm release
  if helm list -n "${ns}" 2>/dev/null | grep -q "${operator}"; then
    check_pass "${operator}: Helm release found"
  else
    check_warn "${operator}: Helm release not found"
  fi

  # Check for deployments
  local ready_replicas
  ready_replicas=$(kubectl get deployments -n "${ns}" -o json 2>/dev/null | jq '[.items[] | select(.spec.replicas > 0 and .status.readyReplicas == .spec.replicas)] | length' 2>/dev/null || echo "0")

  if [[ "${ready_replicas}" -gt 0 ]]; then
    check_pass "${operator}: ${ready_replicas} deployment(s) ready"
    verbose "  Deployments:"
    kubectl get deployments -n "${ns}" -o wide 2>/dev/null | tail -n +2 | sed 's/^/    /'
  else
    check_warn "${operator}: No ready deployments (may be starting up)"
  fi

  # Check for statefulsets
  local statefulsets
  statefulsets=$(kubectl get statefulsets -n "${ns}" -o json 2>/dev/null | jq '[.items[] | select(.spec.replicas > 0 and .status.readyReplicas == .spec.replicas)] | length' 2>/dev/null || echo "0")

  if [[ "${statefulsets}" -gt 0 ]]; then
    verbose "  StatefulSets:"
    kubectl get statefulsets -n "${ns}" -o wide 2>/dev/null | tail -n +2 | sed 's/^/    /'
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# TERRAFORM STATE CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_terraform_state() {
  log_section "Checking Terraform State"

  cd "${TERRAFORM_DIR}" || return 1

  # Check if Terraform is initialized
  if [[ ! -d .terraform ]]; then
    check_warn "Terraform not initialized (no .terraform directory)"
    return 0
  fi

  check_pass "Terraform state directory exists"

  # Check if we can read outputs
  if terraform output -json &> /dev/null; then
    check_pass "Terraform outputs accessible"

    # Extract and display key outputs
    local account_id
    local vpc_id
    local cluster_endpoint

    account_id=$(terraform output -json 2>/dev/null | jq -r '.account_id // "unavailable"' 2>/dev/null)
    vpc_id=$(terraform output -json 2>/dev/null | jq -r '.vpc_info.vpc_id // "unavailable"' 2>/dev/null)
    cluster_endpoint=$(terraform output -json 2>/dev/null | jq -r '.cluster_endpoint // "unavailable"' 2>/dev/null)

    verbose "  Account ID: ${account_id}"
    verbose "  VPC ID: ${vpc_id}"
    verbose "  Cluster Endpoint: ${cluster_endpoint}"
  else
    check_warn "Terraform outputs not available"
  fi

  # Check Terraform workspace
  local current_workspace
  current_workspace=$(terraform workspace show 2>/dev/null)

  if [[ "${current_workspace}" == "${ENVIRONMENT}" ]]; then
    check_pass "Terraform workspace: ${current_workspace}"
  else
    check_warn "Terraform workspace mismatch (current: ${current_workspace}, expected: ${ENVIRONMENT})"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINT CONNECTIVITY CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_endpoint_connectivity() {
  if [[ "${CHECK_ENDPOINTS}" != "true" ]]; then
    return 0
  fi

  log_section "Checking Service Endpoint Connectivity"

  # This is a placeholder for connectivity checks
  # In production, you might test actual connections to RDS, Redis, etc.
  check_info "Endpoint connectivity checks skipped (requires network access)"
}

# ──────────────────────────────────────────────────────────────────────────────
# SUMMARY & RESULTS
# ──────────────────────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  log_section "Verification Summary"

  local total_checks=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_WARNED))

  cat <<-EOF

Checks Performed:      ${total_checks}
Passed:                ${GREEN}${CHECKS_PASSED}${NC}
Failed:                ${RED}${CHECKS_FAILED}${NC}
Warnings:              ${YELLOW}${CHECKS_WARNED}${NC}

Environment Details:
  Environment:         ${ENVIRONMENT}
  Namespace:           ${NAMESPACE}
  Region:              ${REGION}

Overall Status:        $(
    if [[ ${CHECKS_FAILED} -eq 0 ]]; then
      echo -e "${GREEN}HEALTHY${NC}"
    else
      echo -e "${RED}FAILED${NC}"
    fi
  )

EOF

  if [[ ${CHECKS_FAILED} -gt 0 ]]; then
    cat <<-EOF
Action Required:
  - Review failed checks above
  - Investigate service status in AWS console
  - Check Kubernetes events: kubectl describe nodes
  - Check pod status: kubectl get pods -A

EOF
  fi

  if [[ ${CHECKS_WARNED} -gt 0 ]]; then
    cat <<-EOF
Warnings:
  - Some services may still be initializing
  - If warnings persist after 5 minutes, investigate further
  - Check logs: kubectl logs -n <namespace> <pod>

EOF
  fi

  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ──────────────────────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ──────────────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${CYAN}Lōns Fintech Platform — Staging Environment Verification${NC}"

  parse_arguments "$@"

  # Run all checks
  check_prerequisites || exit 2
  check_eks_cluster
  check_rds_instance
  check_redis_cluster
  check_alb
  check_kubernetes_api
  check_namespace
  check_operators
  check_terraform_state
  check_endpoint_connectivity

  # Print summary
  print_summary

  # Exit based on results
  if [[ ${CHECKS_FAILED} -eq 0 ]]; then
    exit 0
  else
    exit 1
  fi
}

# Run main
main "$@"
