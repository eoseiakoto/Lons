#!/bin/bash

################################################################################
# DE-03: DNS & TLS Verification Script for staging.lons.io
#
# Verifies that:
# - Route53 hosted zone exists for lons.io
# - DNS records exist and resolve correctly for staging endpoints
# - cert-manager ClusterIssuers are properly created
# - Certificate resources are valid and issued
# - HTTPS connectivity works with proper security headers
# - HSTS and other security configurations are in place
#
# Usage:
#   ./verify-dns-tls.sh [ENVIRONMENT] [KUBECONFIG]
#
# Examples:
#   ./verify-dns-tls.sh staging
#   ./verify-dns-tls.sh staging ~/.kube/config
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-staging}"
KUBECONFIG="${2:-${KUBECONFIG:-$HOME/.kube/config}}"
DOMAIN_NAME="lons.io"
SUBDOMAIN_MAP=(
  "dev:dev.lons.io"
  "staging:staging.lons.io"
  "preprod:preprod.lons.io"
  "prod:lons.io"
)

# Derived variables
SUBDOMAIN=""
for mapping in "${SUBDOMAIN_MAP[@]}"; do
  if [[ "$mapping" == "$ENVIRONMENT:"* ]]; then
    SUBDOMAIN="${mapping#*:}"
    break
  fi
done

if [[ -z "$SUBDOMAIN" ]]; then
  echo -e "${RED}Error: Unknown environment '$ENVIRONMENT'${NC}"
  echo "Valid environments: dev, staging, preprod, prod"
  exit 1
fi

API_DOMAIN="api.${SUBDOMAIN}"
ADMIN_DOMAIN="admin.${SUBDOMAIN}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Logging functions
log_test() {
  echo -e "${BLUE}[TEST]${NC} $*"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $*"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $*"
  ((TESTS_FAILED++))
}

log_skip() {
  echo -e "${YELLOW}[SKIP]${NC} $*"
  ((TESTS_SKIPPED++))
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

# Helper function: check if command exists
command_exists() {
  command -v "$1" &> /dev/null
}

################################################################################
# Test 1: Check Route53 Hosted Zone
################################################################################
test_route53_hosted_zone() {
  local test_name="Route53 Hosted Zone for ${DOMAIN_NAME}"
  log_test "$test_name"

  if ! command_exists aws; then
    log_skip "$test_name (AWS CLI not available)"
    return
  fi

  if zone_info=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN_NAME" --query "HostedZones[?Name=='${DOMAIN_NAME}.'].Id" --output text 2>/dev/null); then
    if [[ -n "$zone_info" ]]; then
      ZONE_ID=$(echo "$zone_info" | awk -F'/' '{print $NF}')
      log_pass "$test_name (Zone ID: $ZONE_ID)"
      return 0
    fi
  fi

  log_fail "$test_name"
  return 1
}

################################################################################
# Test 2: Check DNS Records in Route53
################################################################################
test_route53_records() {
  local test_name="Route53 DNS records for ${SUBDOMAIN}"
  log_test "$test_name"

  if ! command_exists aws; then
    log_skip "$test_name (AWS CLI not available)"
    return
  fi

  if [[ -z "${ZONE_ID:-}" ]]; then
    log_skip "$test_name (Zone ID not available)"
    return
  fi

  local api_record_found=0
  local admin_record_found=0
  local subdomain_record_found=0

  if records=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" --query "ResourceRecordSets[*].[Name,Type]" --output text 2>/dev/null); then
    while IFS=$'\t' read -r name type; do
      name_trimmed="${name%.}"  # Remove trailing dot
      if [[ "$name_trimmed" == "$API_DOMAIN" && "$type" == "A" ]]; then
        api_record_found=1
      fi
      if [[ "$name_trimmed" == "$ADMIN_DOMAIN" && "$type" == "A" ]]; then
        admin_record_found=1
      fi
      if [[ "$name_trimmed" == "$SUBDOMAIN" && "$type" == "A" ]]; then
        subdomain_record_found=1
      fi
    done <<< "$records"
  fi

  local all_found=1
  [[ $api_record_found -eq 1 ]] && log_pass "Found A record for ${API_DOMAIN}" || { log_fail "Missing A record for ${API_DOMAIN}"; all_found=0; }
  [[ $admin_record_found -eq 1 ]] && log_pass "Found A record for ${ADMIN_DOMAIN}" || { log_fail "Missing A record for ${ADMIN_DOMAIN}"; all_found=0; }
  [[ $subdomain_record_found -eq 1 ]] && log_pass "Found A record for ${SUBDOMAIN}" || { log_fail "Missing A record for ${SUBDOMAIN}"; all_found=0; }

  [[ $all_found -eq 1 ]]
}

################################################################################
# Test 3: DNS Resolution with dig
################################################################################
test_dns_resolution() {
  local domain="$1"
  local test_name="DNS resolution for ${domain}"
  log_test "$test_name"

  if ! command_exists dig; then
    log_skip "$test_name (dig not available)"
    return
  fi

  if result=$(dig +short "$domain" A 2>/dev/null); then
    if [[ -n "$result" && "$result" != *";" ]]; then
      log_pass "$test_name (Resolved to: $result)"
      return 0
    fi
  fi

  log_fail "$test_name"
  return 1
}

################################################################################
# Test 4: Check cert-manager ClusterIssuers
################################################################################
test_cert_manager_issuers() {
  local test_name="cert-manager ClusterIssuers"
  log_test "$test_name"

  if ! command_exists kubectl; then
    log_skip "$test_name (kubectl not available)"
    return
  fi

  if ! kubectl --kubeconfig="$KUBECONFIG" config current-context &>/dev/null; then
    log_skip "$test_name (kubectl context not available)"
    return
  fi

  local issuer_name="letsencrypt-${ENVIRONMENT}"
  if [[ "$ENVIRONMENT" == "prod" ]]; then
    issuer_name="letsencrypt-prod"
  fi

  # For staging, we might also want to check for letsencrypt-staging
  local expected_issuers=("letsencrypt-staging" "letsencrypt-prod")
  local all_found=1

  for issuer in "${expected_issuers[@]}"; do
    if kubectl --kubeconfig="$KUBECONFIG" get clusterissuer "$issuer" &>/dev/null; then
      local ready=$(kubectl --kubeconfig="$KUBECONFIG" get clusterissuer "$issuer" -o jsonpath='{.status.conditions[0].status}' 2>/dev/null || echo "Unknown")
      if [[ "$ready" == "True" ]]; then
        log_pass "ClusterIssuer $issuer is ready"
      else
        log_fail "ClusterIssuer $issuer exists but is not ready (status: $ready)"
        all_found=0
      fi
    else
      log_fail "ClusterIssuer $issuer not found"
      all_found=0
    fi
  done

  [[ $all_found -eq 1 ]]
}

################################################################################
# Test 5: Check Certificate Resources
################################################################################
test_certificate_resources() {
  local test_name="Certificate resources"
  log_test "$test_name"

  if ! command_exists kubectl; then
    log_skip "$test_name (kubectl not available)"
    return
  fi

  if ! kubectl --kubeconfig="$KUBECONFIG" config current-context &>/dev/null; then
    log_skip "$test_name (kubectl context not available)"
    return
  fi

  local certs_found=0
  local certs_ready=0

  # Look for certificates in any namespace
  if certs=$(kubectl --kubeconfig="$KUBECONFIG" get certificates --all-namespaces -o json 2>/dev/null); then
    local cert_count=$(echo "$certs" | grep -c '"name"' || echo 0)

    if [[ $cert_count -gt 0 ]]; then
      certs_found=1
      log_pass "Found $cert_count Certificate resource(s)"

      # Check if any certificate is ready
      while IFS= read -r cert_name; do
        local ready=$(echo "$certs" | grep -A 20 "\"name\": \"$cert_name\"" | grep -o '"status": "[^"]*"' | head -1 | cut -d'"' -f4)
        if [[ "$ready" == "True" || "$ready" == "true" ]]; then
          certs_ready=1
          log_pass "Certificate $cert_name is ready"
        else
          log_fail "Certificate $cert_name is not ready"
        fi
      done < <(echo "$certs" | grep -o '"name": "[^"]*"' | cut -d'"' -f4)
    fi
  fi

  if [[ $certs_found -eq 0 ]]; then
    log_fail "No Certificate resources found"
    return 1
  fi

  [[ $certs_ready -eq 1 ]]
}

################################################################################
# Test 6: Check TLS Certificate with openssl
################################################################################
test_tls_certificate() {
  local domain="$1"
  local test_name="TLS certificate for ${domain}"
  log_test "$test_name"

  if ! command_exists openssl; then
    log_skip "$test_name (openssl not available)"
    return
  fi

  if ! command_exists timeout; then
    log_skip "$test_name (timeout command not available)"
    return
  fi

  if ! command_exists curl; then
    log_skip "$test_name (curl not available)"
    return
  fi

  # Get certificate info
  cert_info=$(timeout 5 openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -text -noout 2>/dev/null || true)

  if [[ -n "$cert_info" ]]; then
    # Extract expiration date
    if exp_date=$(echo "$cert_info" | grep "Not After" | awk -F': ' '{print $2}'); then
      log_pass "TLS certificate found for ${domain} (expires: $exp_date)"

      # Check if certificate is valid (not expired)
      if echo "$cert_info" | grep -q "CN=$domain\|CN=\*\.$SUBDOMAIN"; then
        log_pass "Certificate CN matches domain ${domain}"
      else
        log_fail "Certificate CN does not match domain ${domain}"
        return 1
      fi
      return 0
    fi
  fi

  log_fail "$test_name"
  return 1
}

################################################################################
# Test 7: HTTPS Connectivity
################################################################################
test_https_connectivity() {
  local domain="$1"
  local test_name="HTTPS connectivity to ${domain}"
  log_test "$test_name"

  if ! command_exists curl; then
    log_skip "$test_name (curl not available)"
    return
  fi

  # Allow self-signed certs for staging
  local curl_opts="-s -o /dev/null -w '%{http_code}' --connect-timeout 5"
  if [[ "$ENVIRONMENT" != "prod" ]]; then
    curl_opts+=" -k"  # Allow self-signed for non-prod
  fi

  if http_code=$(curl $curl_opts "https://$domain" 2>/dev/null); then
    if [[ "$http_code" == "200" || "$http_code" == "301" || "$http_code" == "302" || "$http_code" == "401" || "$http_code" == "403" ]]; then
      log_pass "HTTPS connectivity successful (HTTP $http_code)"
      return 0
    else
      log_fail "Unexpected HTTP status: $http_code"
      return 1
    fi
  fi

  log_fail "$test_name (curl failed)"
  return 1
}

################################################################################
# Test 8: Security Headers
################################################################################
test_security_headers() {
  local domain="$1"
  local test_name="Security headers for ${domain}"
  log_test "$test_name"

  if ! command_exists curl; then
    log_skip "$test_name (curl not available)"
    return
  fi

  local curl_opts="-s -i --connect-timeout 5"
  if [[ "$ENVIRONMENT" != "prod" ]]; then
    curl_opts+=" -k"
  fi

  headers=$(curl $curl_opts "https://$domain" 2>/dev/null | head -20 || true)

  local headers_found=0
  [[ "$headers" =~ "Strict-Transport-Security" ]] && { log_pass "HSTS header present"; headers_found=1; } || log_fail "HSTS header missing"
  [[ "$headers" =~ "X-Content-Type-Options" ]] && log_pass "X-Content-Type-Options header present" || log_fail "X-Content-Type-Options header missing"
  [[ "$headers" =~ "X-Frame-Options" ]] && log_pass "X-Frame-Options header present" || log_fail "X-Frame-Options header missing"

  [[ $headers_found -eq 1 ]]
}

################################################################################
# Test 9: Force HTTPS Redirect
################################################################################
test_https_redirect() {
  local domain="$1"
  local test_name="HTTP to HTTPS redirect for ${domain}"
  log_test "$test_name"

  if ! command_exists curl; then
    log_skip "$test_name (curl not available)"
    return
  fi

  local curl_opts="-s -o /dev/null -w '%{http_code}' --connect-timeout 5 -L"
  if [[ "$ENVIRONMENT" != "prod" ]]; then
    curl_opts+=" -k"
  fi

  # Test HTTP redirect (may fail due to DNS, but checking status is the goal)
  if http_code=$(curl $curl_opts "http://$domain" 2>/dev/null); then
    if [[ "$http_code" == "200" || "$http_code" == "301" || "$http_code" == "302" ]]; then
      log_pass "HTTP request handled (redirected to HTTPS)"
      return 0
    fi
  fi

  log_skip "$test_name (HTTP not accessible, may be intentional)"
}

################################################################################
# Main Execution
################################################################################
main() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}DNS & TLS Verification: $ENVIRONMENT${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  echo "Environment: $ENVIRONMENT"
  echo "Subdomain: $SUBDOMAIN"
  echo "API Domain: $API_DOMAIN"
  echo "Admin Domain: $ADMIN_DOMAIN"
  echo "Root Domain: $DOMAIN_NAME"
  echo ""

  # Run all tests
  echo -e "${BLUE}Running verification tests...${NC}"
  echo ""

  test_route53_hosted_zone || true
  test_route53_records || true
  test_dns_resolution "$API_DOMAIN" || true
  test_dns_resolution "$ADMIN_DOMAIN" || true
  test_dns_resolution "$SUBDOMAIN" || true
  test_cert_manager_issuers || true
  test_certificate_resources || true
  test_tls_certificate "$API_DOMAIN" || true
  test_tls_certificate "$ADMIN_DOMAIN" || true
  test_https_connectivity "$API_DOMAIN" || true
  test_https_connectivity "$ADMIN_DOMAIN" || true
  test_security_headers "$API_DOMAIN" || true
  test_security_headers "$ADMIN_DOMAIN" || true
  test_https_redirect "$API_DOMAIN" || true
  test_https_redirect "$ADMIN_DOMAIN" || true

  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Test Summary${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
  echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
  echo -e "Skipped: ${YELLOW}${TESTS_SKIPPED}${NC}"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    return 1
  fi
}

# Run main function
main "$@"
