#!/usr/bin/env bash
# Post-deployment smoke tests for Lōns platform
# Usage: ./post-deploy.sh <base-url> [environment]
# Example: ./post-deploy.sh https://api.staging.lons.io staging

set -euo pipefail

BASE_URL="${1:?Usage: $0 <base-url> [environment]}"
ENV="${2:-staging}"
ADMIN_URL="${BASE_URL/api/admin}"
PASSED=0
FAILED=0
TOTAL=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local result="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$result" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $name"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $name"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== Lōns Post-Deploy Smoke Tests ==="
echo "Environment: $ENV"
echo "API URL: $BASE_URL"
echo "Admin URL: $ADMIN_URL"
echo ""

# --- 1. REST API Health ---
echo "--- REST API ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/v1/health" --max-time 10 || echo "000")
check "REST /v1/health returns 200" "$([ "$HTTP_CODE" = "200" ] && echo 0 || echo 1)"

# --- 2. GraphQL Health ---
echo "--- GraphQL API ---"
GQL_RESPONSE=$(curl -s "$BASE_URL/graphql" -H "Content-Type: application/json" -d '{"query":"{ __typename }"}' --max-time 10 || echo "")
check "GraphQL introspection responds" "$(echo "$GQL_RESPONSE" | grep -q "__typename" && echo 0 || echo 1)"

# --- 3. Database Connectivity ---
echo "--- Database ---"
DB_RESPONSE=$(curl -s "$BASE_URL/v1/health/detailed" --max-time 10 || echo "")
check "Database connection healthy" "$(echo "$DB_RESPONSE" | grep -qi "database.*ok\|database.*healthy\|postgres.*up" && echo 0 || echo 1)"

# --- 4. Redis Connectivity ---
echo "--- Redis ---"
check "Redis connection healthy" "$(echo "$DB_RESPONSE" | grep -qi "redis.*ok\|redis.*healthy\|cache.*up" && echo 0 || echo 1)"

# --- 5. Scoring Service ---
echo "--- Scoring Service ---"
SCORING_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/v1/health/scoring" --max-time 15 || echo "000")
check "Scoring service reachable" "$([ "$SCORING_CODE" = "200" ] && echo 0 || echo 1)"

# --- 6. Admin Portal ---
echo "--- Admin Portal ---"
ADMIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ADMIN_URL" --max-time 10 || echo "000")
check "Admin portal loads" "$([ "$ADMIN_CODE" = "200" ] && echo 0 || echo 1)"

# --- 7. TLS Certificate ---
echo "--- Security ---"
if [[ "$BASE_URL" == https://* ]]; then
  CERT_EXPIRY=$(echo | openssl s_client -connect "${BASE_URL#https://}:443" -servername "${BASE_URL#https://}" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$CERT_EXPIRY" ]; then
    EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    check "TLS cert valid (${DAYS_LEFT}d remaining)" "$([ "$DAYS_LEFT" -gt 7 ] && echo 0 || echo 1)"
  else
    check "TLS cert valid" "1"
  fi
fi

# --- 8. CORS Headers ---
CORS_HEADERS=$(curl -s -I "$BASE_URL/v1/health" --max-time 10 | grep -i "access-control\|strict-transport-security\|x-content-type" || echo "")
check "Security headers present (HSTS)" "$(echo "$CORS_HEADERS" | grep -qi "strict-transport-security" && echo 0 || echo 1)"

# --- Summary ---
echo ""
echo "=== Results ==="
echo -e "Passed: ${GREEN}${PASSED}${NC} / ${TOTAL}"
echo -e "Failed: ${RED}${FAILED}${NC} / ${TOTAL}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}SMOKE TESTS FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}ALL SMOKE TESTS PASSED${NC}"
  exit 0
fi
