#!/usr/bin/env bash
###############################################################################
# create-ecr-repos.sh
#
# Creates ECR repositories for all 6 Lōns services with:
# - Image scanning on push enabled
# - Lifecycle policy (keep last 20 images, expire untagged after 7 days)
# - Idempotent (safe to re-run)
# - Proper error handling and colored output
#
# Usage: ./create-ecr-repos.sh [--region eu-west-1]
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
PROJECT_NAME="lons"

SERVICES=(
  "graphql-server"
  "rest-server"
  "scheduler"
  "notification-worker"
  "admin-portal"
  "scoring-service"
)

# Track results
declare -A results
created=0
already_exist=0
failed=0

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

check_prerequisites() {
  print_section "Checking prerequisites"

  if ! command -v aws &> /dev/null; then
    print_failure "AWS CLI not found"
    exit 1
  fi
  print_success "AWS CLI found"

  if ! command -v jq &> /dev/null; then
    print_failure "jq not found"
    exit 1
  fi
  print_success "jq found"

  # Verify AWS credentials
  if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    print_failure "AWS credentials not configured or invalid"
    exit 1
  fi
  print_success "AWS credentials valid"
}

create_lifecycle_policy() {
  cat <<'EOF'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 20 images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": [""],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": {
        "type": "expire"
      }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF
}

create_ecr_repository() {
  local service_name=$1
  local repo_name="${PROJECT_NAME}-${service_name}"

  print_info "Processing: $repo_name"

  # Check if repository exists
  if aws ecr describe-repositories \
    --region "$AWS_REGION" \
    --repository-names "$repo_name" \
    >/dev/null 2>&1; then

    print_warning "Repository '$repo_name' already exists"
    ((already_exist++))

    # Update existing repository configuration
    configure_existing_repository "$repo_name"

  else
    # Create new repository
    if aws ecr create-repository \
      --repository-name "$repo_name" \
      --region "$AWS_REGION" \
      --encryption-configuration encryptionType=AES \
      --tags "Key=Project,Value=${PROJECT_NAME}" "Key=Service,Value=${service_name}" \
      >/dev/null 2>&1; then

      print_success "Created ECR repository: $repo_name"
      ((created++))

      # Configure the new repository
      configure_repository "$repo_name"
    else
      print_failure "Failed to create repository: $repo_name"
      ((failed++))
    fi
  fi
}

configure_repository() {
  local repo_name=$1

  # Enable image scanning
  if aws ecr put-image-scanning-configuration \
    --repository-name "$repo_name" \
    --image-scanning-configuration scanOnPush=true \
    --region "$AWS_REGION" \
    >/dev/null 2>&1; then
    print_info "  → Enabled image scanning on push"
  else
    print_warning "  → Could not enable image scanning"
  fi

  # Apply lifecycle policy
  if aws ecr put-lifecycle-policy \
    --repository-name "$repo_name" \
    --lifecycle-policy-text "$(create_lifecycle_policy)" \
    --region "$AWS_REGION" \
    >/dev/null 2>&1; then
    print_info "  → Applied lifecycle policy"
  else
    print_warning "  → Could not apply lifecycle policy"
  fi

  # Set image tag mutability (prevent overwriting)
  if aws ecr put-image-tag-mutability \
    --repository-name "$repo_name" \
    --image-tag-mutability IMMUTABLE \
    --region "$AWS_REGION" \
    >/dev/null 2>&1; then
    print_info "  → Enabled image tag immutability"
  else
    print_warning "  → Could not enable image tag immutability"
  fi
}

configure_existing_repository() {
  local repo_name=$1

  # Update scanning and lifecycle for existing repos
  print_info "  → Updating configuration for existing repository"

  aws ecr put-image-scanning-configuration \
    --repository-name "$repo_name" \
    --image-scanning-configuration scanOnPush=true \
    --region "$AWS_REGION" \
    >/dev/null 2>&1 || true

  aws ecr put-lifecycle-policy \
    --repository-name "$repo_name" \
    --lifecycle-policy-text "$(create_lifecycle_policy)" \
    --region "$AWS_REGION" \
    >/dev/null 2>&1 || true

  aws ecr put-image-tag-mutability \
    --repository-name "$repo_name" \
    --image-tag-mutability IMMUTABLE \
    --region "$AWS_REGION" \
    >/dev/null 2>&1 || true
}

verify_repositories() {
  print_section "Verifying ECR repositories"

  for service in "${SERVICES[@]}"; do
    repo_name="${PROJECT_NAME}-${service}"

    if aws ecr describe-repositories \
      --region "$AWS_REGION" \
      --repository-names "$repo_name" \
      >/dev/null 2>&1; then

      # Get repository details
      repo_uri=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --query 'repositories[0].repositoryUri' \
        --output text)

      scanning_enabled=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --query 'repositories[0].imageScanningConfiguration.scanOnPush' \
        --output text)

      immutability=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --query 'repositories[0].imageTagMutability' \
        --output text)

      echo -e "  ${MAGENTA}→ $repo_name${NC}"
      echo -e "    URI: ${CYAN}$repo_uri${NC}"
      echo -e "    Scanning: ${GREEN}$scanning_enabled${NC}"
      echo -e "    Tag Immutability: ${GREEN}$immutability${NC}"
    fi
  done
}

# ============================================================================
# Main Function
# ============================================================================

main() {
  print_header "ECR Repository Initialization"

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --region)
        AWS_REGION="$2"
        shift 2
        ;;
      *)
        print_failure "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  print_info "Using AWS region: $AWS_REGION"
  echo ""

  # Check prerequisites
  check_prerequisites
  echo ""

  # Create repositories for all services
  print_section "Creating/updating ECR repositories"
  for service in "${SERVICES[@]}"; do
    create_ecr_repository "$service"
  done
  echo ""

  # Verify all repositories
  verify_repositories
  echo ""

  # ========================================================================
  # Summary Report
  # ========================================================================
  print_header "Repository Creation Summary"

  echo -e "${GREEN}Created:${NC}       $created"
  echo -e "${YELLOW}Already exist:${NC} $already_exist"
  echo -e "${RED}Failed:${NC}        $failed"
  echo -e "${MAGENTA}Total:${NC}        ${#SERVICES[@]}"

  echo ""
  if [ $failed -eq 0 ]; then
    print_success "All repositories are ready!"
    echo ""
    print_info "Push your first image:"
    for service in "${SERVICES[@]}"; do
      repo_name="${PROJECT_NAME}-${service}"
      repo_uri=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --query 'repositories[0].repositoryUri' \
        --output text 2>/dev/null || echo "")
      if [ -n "$repo_uri" ]; then
        echo -e "  ${CYAN}docker tag local-image:latest ${repo_uri}:v1.0${NC}"
        echo -e "  ${CYAN}docker push ${repo_uri}:v1.0${NC}"
      fi
    done
    return 0
  else
    print_failure "$failed repository creation(s) failed"
    return 1
  fi
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
