#!/usr/bin/env bash
###############################################################################
# verify-cicd.sh
#
# Verifies CI/CD staging readiness:
# - GitHub environment 'staging' exists
# - ECR repositories exist for all 6 services
# - Recent deploy workflow runs
# - STAGING_URL variable is configured
# - OIDC role configuration
# - Manual deploy trigger validation
#
# Usage: ./verify-cicd.sh
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
ECR_REGISTRY="546854093923.dkr.ecr.${AWS_REGION}.amazonaws.com"

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
passed=0
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
  ((passed++))
}

print_failure() {
  echo -e "${RED}✗ $1${NC}"
  ((failed++))
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
  echo -e "${MAGENTA}ℹ $1${NC}"
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    print_failure "Required command '$1' not found"
    exit 1
  fi
}

# ============================================================================
# Main Verification
# ============================================================================

main() {
  print_header "CI/CD Staging Readiness Verification"

  # Check prerequisites
  print_section "Checking prerequisites"
  check_command "gh"
  check_command "aws"
  check_command "jq"
  print_success "All required commands available"

  # Verify GitHub environment
  print_section "Verifying GitHub environment 'staging'"
  if gh api repos/:owner/:repo/environments/staging --jq '.name' >/dev/null 2>&1; then
    print_success "GitHub environment 'staging' exists"
  else
    print_failure "GitHub environment 'staging' not found"
    print_info "Create it in: https://github.com/lonstech/lons/settings/environments"
  fi

  # Verify ECR repositories
  print_section "Verifying ECR repositories"
  for service in "${SERVICES[@]}"; do
    repo_name="lons-${service}"
    if aws ecr describe-repositories \
      --region "$AWS_REGION" \
      --repository-names "$repo_name" \
      >/dev/null 2>&1; then
      print_success "ECR repository '$repo_name' exists"

      # Check image scanning
      scanning_enabled=$(aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --query 'repositories[0].imageScanningConfiguration.scanOnPush' \
        --output text)

      if [ "$scanning_enabled" = "True" ]; then
        print_info "  → Image scanning enabled"
      else
        print_warning "  → Image scanning disabled"
      fi
    else
      print_failure "ECR repository '$repo_name' not found"
    fi
  done

  # Check recent deploy workflow runs
  print_section "Checking recent deploy workflow runs (staging)"
  if deploy_runs=$(gh api repos/:owner/:repo/actions/workflows/deploy.yml/runs \
    --paginate \
    --jq '.workflow_runs | sort_by(.created_at) | reverse | .[0:5] | .[] | "\(.created_at) - \(.name) - \(.conclusion)"' \
    2>/dev/null); then

    if [ -z "$deploy_runs" ]; then
      print_warning "No recent deploy runs found"
    else
      print_success "Recent deploy workflow runs:"
      echo "$deploy_runs" | while read -r line; do
        echo -e "  ${MAGENTA}→ $line${NC}"
      done
    fi
  else
    print_failure "Could not retrieve deploy workflow runs"
  fi

  # Verify STAGING_URL variable
  print_section "Verifying GitHub Variables"
  if gh api repos/:owner/:repo/environments/staging/variables \
    --jq '.variables[] | select(.name=="STAGING_URL")' >/dev/null 2>&1; then
    staging_url=$(gh api repos/:owner/:repo/environments/staging/variables \
      --jq '.variables[] | select(.name=="STAGING_URL") | .value' 2>/dev/null)
    print_success "STAGING_URL is set: $staging_url"
  else
    print_failure "STAGING_URL variable not configured"
    print_info "Set it in: https://github.com/lonstech/lons/settings/environments/staging"
  fi

  # Verify OIDC role configuration
  print_section "Verifying OIDC Role Configuration"
  if aws_role_arn=$(gh api repos/:owner/:repo/environments/staging/secrets \
    --jq '.secrets[] | select(.name=="AWS_ROLE_ARN_STAGING")' 2>/dev/null); then

    if [ -n "$aws_role_arn" ]; then
      print_success "AWS_ROLE_ARN_STAGING secret exists"
    else
      print_warning "AWS_ROLE_ARN_STAGING secret not found"
    fi
  fi

  # Check OIDC provider configuration in AWS
  print_section "Verifying AWS OIDC Provider"
  if aws iam list-open-id-connect-providers \
    --region "$AWS_REGION" \
    --query 'OpenIDConnectProviderList[*].Arn' \
    --output text 2>/dev/null | grep -q "token.actions.githubusercontent.com"; then
    print_success "GitHub OIDC provider configured in AWS"
  else
    print_failure "GitHub OIDC provider not configured in AWS"
    print_info "Configure it using: aws iam create-open-id-connect-provider ..."
  fi

  # Validate deploy workflow file
  print_section "Validating deploy workflow file"
  if [ -f ".github/workflows/deploy.yml" ]; then
    # Check for syntax by trying to parse with gh
    if gh workflow view deploy.yml >/dev/null 2>&1; then
      print_success "Deploy workflow file is syntactically valid"
    else
      print_warning "Could not validate deploy workflow syntax"
    fi
  else
    print_failure "Deploy workflow file not found at .github/workflows/deploy.yml"
  fi

  # Verify CI workflow passes
  print_section "Checking CI workflow status"
  if ci_status=$(gh api repos/:owner/:repo/actions/workflows/ci.yml/runs \
    --jq '.workflow_runs | .[0].conclusion' 2>/dev/null); then

    case "$ci_status" in
      "success")
        print_success "Latest CI run: $ci_status"
        ;;
      "failure")
        print_failure "Latest CI run: $ci_status"
        ;;
      "neutral"|"skipped"|"cancelled")
        print_warning "Latest CI run: $ci_status"
        ;;
      *)
        print_info "Latest CI run: $ci_status"
        ;;
    esac
  fi

  # Dry-run workflow validation
  print_section "Validating workflow trigger configuration"
  if grep -q "deploy-staging:" .github/workflows/deploy.yml; then
    print_success "Staging deploy job defined"
  else
    print_failure "Staging deploy job not found in workflow"
  fi

  if grep -q "workflow_dispatch:" .github/workflows/deploy.yml; then
    print_success "Manual workflow dispatch enabled"
  else
    print_failure "Manual workflow dispatch not enabled"
  fi

  # ========================================================================
  # Summary Report
  # ========================================================================
  echo ""
  print_header "Verification Summary"

  total=$((passed + failed))
  percentage=0
  if [ $total -gt 0 ]; then
    percentage=$((passed * 100 / total))
  fi

  echo -e "${GREEN}Passed:${NC}  $passed"
  echo -e "${RED}Failed:${NC}  $failed"
  echo -e "${MAGENTA}Total:${NC}   $total"
  echo -e "${CYAN}Score:${NC}   ${percentage}%"

  echo ""
  if [ $failed -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  CI/CD staging setup is READY for auto-deploy!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    return 0
  else
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  Please resolve the above issues before enabling auto-deploy${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    return 1
  fi
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
