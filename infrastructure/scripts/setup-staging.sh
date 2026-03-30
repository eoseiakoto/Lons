#!/bin/bash

################################################################################
# setup-staging.sh — Comprehensive Staging Environment Setup
#
# Purpose:
#   Deploys the Lōns fintech platform to a staging environment on AWS EKS.
#   Handles Terraform initialization, infrastructure provisioning, Kubernetes
#   namespace creation, and prerequisite operator installation.
#
# Prerequisites:
#   - AWS CLI v2 configured with appropriate credentials
#   - Terraform >= 1.3
#   - kubectl >= 1.28
#   - Helm >= 3.12
#   - jq for JSON parsing
#
# Usage:
#   ./setup-staging.sh [--dry-run] [--skip-operators] [--skip-namespace]
#
# Options:
#   --dry-run           Run terraform plan only (do not apply)
#   --skip-operators    Skip Helm operator installations
#   --skip-namespace    Skip namespace creation (assumes it exists)
#
# Exit codes:
#   0   Successful deployment
#   1   Prerequisites check failed
#   2   Terraform initialization failed
#   3   Terraform plan/apply failed
#   4   kubeconfig update failed
#   5   Namespace creation failed
#   6   Operator installation failed
#
################################################################################

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TERRAFORM_DIR="${PROJECT_ROOT}/infrastructure/terraform"
ENVIRONMENTS_DIR="${TERRAFORM_DIR}/environments"

ENVIRONMENT="staging"
ENVIRONMENT_FILE="${ENVIRONMENTS_DIR}/${ENVIRONMENT}.tfvars"
NAMESPACE="lons-staging"
REGION="eu-west-1"
DRY_RUN=false
SKIP_OPERATORS=false
SKIP_NAMESPACE=false
VERBOSITY="info"

# Operator Helm chart configurations
declare -A OPERATORS=(
  [external-secrets]="external-secrets/external-secrets"
  [cert-manager]="jetstack/cert-manager"
  [nginx-ingress]="ingress-nginx/ingress-nginx"
  [kube-prometheus]="prometheus-community/kube-prometheus-stack"
)

declare -A OPERATOR_NAMESPACES=(
  [external-secrets]="external-secrets"
  [cert-manager]="cert-manager"
  [nginx-ingress]="ingress-nginx"
  [kube-prometheus]="monitoring"
)

declare -A OPERATOR_VERSIONS=(
  [external-secrets]="0.9.9"
  [cert-manager]="v1.13.3"
  [nginx-ingress]="4.8.3"
  [kube-prometheus]="55.8.2"
)

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING & UTILITIES
# ──────────────────────────────────────────────────────────────────────────────

log_section() {
  echo -e "${BLUE}→${NC} $*"
}

log_info() {
  echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
  echo -e "${RED}✗${NC} $*" >&2
}

log_debug() {
  if [[ "${VERBOSITY}" == "debug" ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $*"
  fi
}

# Exit with error
die() {
  local exit_code=$1
  shift
  log_error "$@"
  exit "${exit_code}"
}

# Print usage information
usage() {
  grep "^#" "${BASH_SOURCE[0]}" | head -25 | sed 's/^# *//'
  exit 0
}

# ──────────────────────────────────────────────────────────────────────────────
# PREREQUISITE CHECKS
# ──────────────────────────────────────────────────────────────────────────────

check_prerequisites() {
  log_section "Checking prerequisites"

  local missing_commands=()

  # Check for required commands
  for cmd in aws terraform kubectl helm jq git; do
    if ! command -v "${cmd}" &> /dev/null; then
      missing_commands+=("${cmd}")
    else
      local version
      case "${cmd}" in
        aws)
          version=$(aws --version 2>&1 | cut -d' ' -f1)
          log_info "${cmd}: ${version}"
          ;;
        terraform)
          version=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || echo "unknown")
          log_info "${cmd}: ${version}"
          ;;
        kubectl)
          version=$(kubectl version --client --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
          log_info "${cmd}: ${version}"
          ;;
        helm)
          version=$(helm version --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
          log_info "${cmd}: ${version}"
          ;;
        *)
          log_info "${cmd}: installed"
          ;;
      esac
    fi
  done

  if [[ ${#missing_commands[@]} -gt 0 ]]; then
    die 1 "Missing required commands: ${missing_commands[*]}"
  fi

  # Check AWS credentials
  if ! aws sts get-caller-identity &> /dev/null; then
    die 1 "AWS credentials not configured or invalid"
  fi
  log_info "AWS credentials verified"

  # Check Terraform configuration exists
  if [[ ! -f "${TERRAFORM_DIR}/main.tf" ]]; then
    die 1 "Terraform configuration not found at ${TERRAFORM_DIR}"
  fi
  log_info "Terraform configuration found"

  # Check environment variables file exists
  if [[ ! -f "${ENVIRONMENT_FILE}" ]]; then
    die 1 "Environment configuration not found at ${ENVIRONMENT_FILE}"
  fi
  log_info "Environment configuration (${ENVIRONMENT_FILE}) found"

  log_info "All prerequisites met"
}

# ──────────────────────────────────────────────────────────────────────────────
# PARSE COMMAND-LINE ARGUMENTS
# ──────────────────────────────────────────────────────────────────────────────

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --dry-run)
        DRY_RUN=true
        log_info "Dry-run mode enabled (plan only, no apply)"
        shift
        ;;
      --skip-operators)
        SKIP_OPERATORS=true
        log_warn "Operator installation will be skipped"
        shift
        ;;
      --skip-namespace)
        SKIP_NAMESPACE=true
        log_warn "Namespace creation will be skipped"
        shift
        ;;
      --debug)
        VERBOSITY="debug"
        shift
        ;;
      -h|--help)
        usage
        ;;
      *)
        die 1 "Unknown option: $1"
        ;;
    esac
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# TERRAFORM OPERATIONS
# ──────────────────────────────────────────────────────────────────────────────

init_terraform() {
  log_section "Initializing Terraform"

  cd "${TERRAFORM_DIR}" || die 1 "Cannot change to ${TERRAFORM_DIR}"

  # Get AWS account ID
  local account_id
  account_id=$(aws sts get-caller-identity --query Account --output text)
  log_debug "AWS Account ID: ${account_id}"

  # Terraform backend configuration
  local state_bucket="lons-terraform-state-${account_id}"
  local state_table="lons-terraform-locks"
  local state_region="${REGION}"
  local state_key="terraform.tfstate"

  log_debug "State bucket: ${state_bucket}"
  log_debug "State table: ${state_table}"

  # Initialize Terraform
  terraform init \
    -backend-config="bucket=${state_bucket}" \
    -backend-config="key=${state_key}" \
    -backend-config="region=${state_region}" \
    -backend-config="dynamodb_table=${state_table}" \
    -backend-config="encrypt=true" \
    -upgrade \
    || die 2 "Terraform initialization failed"

  log_info "Terraform initialized successfully"

  # Create or select workspace
  if terraform workspace list | grep -q "^  ${ENVIRONMENT}$"; then
    log_debug "Workspace '${ENVIRONMENT}' already exists"
    terraform workspace select "${ENVIRONMENT}"
  else
    log_info "Creating new workspace '${ENVIRONMENT}'"
    terraform workspace new "${ENVIRONMENT}" || terraform workspace select "${ENVIRONMENT}"
  fi

  log_info "Using Terraform workspace: ${ENVIRONMENT}"
}

plan_terraform() {
  log_section "Planning Terraform changes"

  cd "${TERRAFORM_DIR}" || die 1 "Cannot change to ${TERRAFORM_DIR}"

  terraform plan \
    -var-file="${ENVIRONMENT_FILE}" \
    -out="tfplan-${ENVIRONMENT}" \
    || die 3 "Terraform plan failed"

  log_info "Terraform plan completed successfully"
}

apply_terraform() {
  log_section "Applying Terraform configuration"

  cd "${TERRAFORM_DIR}" || die 1 "Cannot change to ${TERRAFORM_DIR}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log_warn "Dry-run mode: skipping terraform apply"
    return 0
  fi

  terraform apply \
    "tfplan-${ENVIRONMENT}" \
    || die 3 "Terraform apply failed"

  log_info "Terraform apply completed successfully"

  # Clean up plan file
  rm -f "tfplan-${ENVIRONMENT}"
}

get_terraform_outputs() {
  log_section "Retrieving Terraform outputs"

  cd "${TERRAFORM_DIR}" || die 1 "Cannot change to ${TERRAFORM_DIR}"

  local outputs
  outputs=$(terraform output -json 2>/dev/null || echo '{}')

  # Extract key outputs
  local cluster_endpoint
  local db_endpoint
  local redis_endpoint
  local alb_dns_name
  local account_id
  local vpc_id

  cluster_endpoint=$(echo "${outputs}" | jq -r '.cluster_endpoint // "unavailable"' 2>/dev/null)
  db_endpoint=$(echo "${outputs}" | jq -r '.db_endpoint // "unavailable"' 2>/dev/null)
  redis_endpoint=$(echo "${outputs}" | jq -r '.redis_endpoint // "unavailable"' 2>/dev/null)
  alb_dns_name=$(echo "${outputs}" | jq -r '.alb_dns_name // "unavailable"' 2>/dev/null)
  account_id=$(echo "${outputs}" | jq -r '.account_id // "unavailable"' 2>/dev/null)
  vpc_id=$(echo "${outputs}" | jq -r '.vpc_info.vpc_id // "unavailable"' 2>/dev/null)

  log_debug "EKS Cluster Endpoint: ${cluster_endpoint}"
  log_debug "RDS Endpoint: ${db_endpoint}"
  log_debug "Redis Endpoint: ${redis_endpoint}"
  log_debug "ALB DNS: ${alb_dns_name}"

  # Store for later use
  export TF_CLUSTER_ENDPOINT="${cluster_endpoint}"
  export TF_DB_ENDPOINT="${db_endpoint}"
  export TF_REDIS_ENDPOINT="${redis_endpoint}"
  export TF_ALB_DNS="${alb_dns_name}"
  export TF_ACCOUNT_ID="${account_id}"
  export TF_VPC_ID="${vpc_id}"

  log_info "Terraform outputs retrieved"
}

# ──────────────────────────────────────────────────────────────────────────────
# KUBERNETES OPERATIONS
# ──────────────────────────────────────────────────────────────────────────────

update_kubeconfig() {
  log_section "Updating kubeconfig for EKS cluster"

  local cluster_name="lons-eks-${ENVIRONMENT}"

  # Update kubeconfig
  aws eks update-kubeconfig \
    --name "${cluster_name}" \
    --region "${REGION}" \
    || die 4 "Failed to update kubeconfig"

  log_info "kubeconfig updated for cluster '${cluster_name}'"

  # Verify cluster access
  if ! kubectl cluster-info &> /dev/null; then
    die 4 "Cannot access Kubernetes cluster"
  fi

  log_info "Kubernetes cluster access verified"
}

create_namespace() {
  log_section "Creating Kubernetes namespace"

  if [[ "${SKIP_NAMESPACE}" == "true" ]]; then
    log_warn "Namespace creation skipped; checking if it exists..."
    if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
      log_info "Namespace '${NAMESPACE}' already exists"
      return 0
    else
      die 5 "Namespace '${NAMESPACE}' does not exist and --skip-namespace was specified"
    fi
  fi

  # Check if namespace exists
  if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
    log_info "Namespace '${NAMESPACE}' already exists"
    return 0
  fi

  # Create namespace
  kubectl create namespace "${NAMESPACE}" \
    || die 5 "Failed to create namespace '${NAMESPACE}'"

  log_info "Namespace '${NAMESPACE}' created"

  # Label namespace
  kubectl label namespace "${NAMESPACE}" \
    "environment=${ENVIRONMENT}" \
    "team=engineering" \
    "app.kubernetes.io/part-of=lons" \
    --overwrite \
    || die 5 "Failed to label namespace '${NAMESPACE}'"

  log_info "Namespace labels applied: environment=${ENVIRONMENT}, team=engineering, app.kubernetes.io/part-of=lons"
}

# ──────────────────────────────────────────────────────────────────────────────
# HELM OPERATOR INSTALLATIONS
# ──────────────────────────────────────────────────────────────────────────────

add_helm_repos() {
  log_section "Adding Helm repositories"

  # External Secrets Operator
  helm repo add external-secrets https://charts.external-secrets.io || true
  log_debug "Added external-secrets Helm repo"

  # cert-manager
  helm repo add jetstack https://charts.jetstack.io || true
  log_debug "Added jetstack Helm repo"

  # NGINX Ingress Controller
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx || true
  log_debug "Added ingress-nginx Helm repo"

  # Prometheus Community
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
  log_debug "Added prometheus-community Helm repo"

  # Update repos
  helm repo update || die 6 "Failed to update Helm repositories"

  log_info "Helm repositories added and updated"
}

install_operator() {
  local operator_name=$1
  local operator_chart=${OPERATORS[${operator_name}]}
  local operator_ns=${OPERATOR_NAMESPACES[${operator_name}]}
  local operator_version=${OPERATOR_VERSIONS[${operator_name}]}

  log_section "Installing ${operator_name} operator"

  # Create operator namespace if it doesn't exist
  kubectl create namespace "${operator_ns}" --dry-run=client -o yaml | kubectl apply -f - \
    || die 6 "Failed to create namespace '${operator_ns}'"

  # Install or upgrade operator
  helm upgrade --install "${operator_name}" "${operator_chart}" \
    --namespace "${operator_ns}" \
    --version "${operator_version}" \
    --wait \
    --timeout 5m \
    $(get_operator_values "${operator_name}") \
    || die 6 "Failed to install/upgrade ${operator_name}"

  log_info "${operator_name} operator installed/upgraded successfully"
}

get_operator_values() {
  local operator_name=$1
  local values=""

  case "${operator_name}" in
    external-secrets)
      values="--set installCRDs=true"
      ;;
    cert-manager)
      values="--set installCRDs=true --set global.leaderElection.namespace=cert-manager"
      ;;
    nginx-ingress)
      values="--set controller.service.type=LoadBalancer"
      ;;
    kube-prometheus)
      values="--set prometheus.prometheusSpec.retention=7d --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=10Gi"
      ;;
  esac

  echo "${values}"
}

install_operators() {
  if [[ "${SKIP_OPERATORS}" == "true" ]]; then
    log_warn "Operator installation skipped"
    return 0
  fi

  log_section "Installing prerequisite Helm operators"

  add_helm_repos

  for operator_name in "${!OPERATORS[@]}"; do
    install_operator "${operator_name}"
  done

  log_info "All operators installed successfully"
}

verify_operators() {
  log_section "Verifying operator deployments"

  local all_ready=true

  for operator_name in "${!OPERATORS[@]}"; do
    local operator_ns=${OPERATOR_NAMESPACES[${operator_name}]}

    log_debug "Checking ${operator_name} in namespace '${operator_ns}'"

    # Get deployment count
    local ready_replicas
    ready_replicas=$(kubectl get deployments -n "${operator_ns}" -o json 2>/dev/null | \
      jq '[.items[] | select(.spec.replicas > 0 and .status.readyReplicas == .spec.replicas)] | length' || echo "0")

    if [[ "${ready_replicas}" -gt 0 ]]; then
      log_info "${operator_name}: Ready (${ready_replicas} deployment(s))"
    else
      log_warn "${operator_name}: Not ready or no deployments found"
      all_ready=false
    fi
  done

  if [[ "${all_ready}" == "true" ]]; then
    log_info "All operators verified as ready"
  else
    log_warn "Some operators are not yet ready (may be starting up)"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# FINAL SUMMARY & REPORTING
# ──────────────────────────────────────────────────────────────────────────────

print_summary() {
  log_section "Staging Environment Setup Summary"

  cat <<-EOF

Environment:           ${ENVIRONMENT}
Namespace:             ${NAMESPACE}
Region:                ${REGION}
Terraform State:       s3://lons-terraform-state-${TF_ACCOUNT_ID}/terraform.tfstate

Infrastructure:
  VPC ID:              ${TF_VPC_ID}
  EKS Cluster:         ${TF_CLUSTER_ENDPOINT}
  RDS Endpoint:        ${TF_DB_ENDPOINT}
  Redis Endpoint:      ${TF_REDIS_ENDPOINT}
  ALB DNS Name:        ${TF_ALB_DNS}

Kubernetes:
  Namespace:           ${NAMESPACE}
  Labels:              environment=${ENVIRONMENT}, team=engineering, app.kubernetes.io/part-of=lons

Operators Installed:
  1. External Secrets Operator (external-secrets namespace)
  2. cert-manager (cert-manager namespace)
  3. NGINX Ingress Controller (ingress-nginx namespace)
  4. kube-prometheus-stack (monitoring namespace)

Next Steps:
  1. Deploy application Helm charts to ${NAMESPACE} namespace
  2. Configure External Secrets for secure credential management
  3. Set up ingress routes with cert-manager SSL termination
  4. Deploy application services and workloads
  5. Configure monitoring and alerting

Verify cluster access:
  kubectl get nodes -o wide
  kubectl get namespaces

View operator status:
  kubectl get deployments -A

For more information, see the deployment runbook.

EOF

  log_info "Setup completed successfully"
}

# ──────────────────────────────────────────────────────────────────────────────
# MAIN EXECUTION FLOW
# ──────────────────────────────────────────────────────────────────────────────

main() {
  log_info "Lōns Fintech Platform — Staging Environment Setup"
  echo ""

  # Parse arguments
  parse_arguments "$@"

  # Check prerequisites
  check_prerequisites

  # Initialize Terraform
  init_terraform

  # Plan Terraform
  plan_terraform

  # Apply Terraform (unless dry-run)
  apply_terraform

  # Get Terraform outputs
  get_terraform_outputs

  # Update kubeconfig
  update_kubeconfig

  # Create and label namespace
  create_namespace

  # Install operators
  install_operators

  # Verify operators
  verify_operators

  # Print summary
  echo ""
  print_summary
  echo ""
}

# Run main function with all arguments
main "$@"
