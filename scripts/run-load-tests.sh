#!/bin/bash
# ---------------------------------------------------------------------------
# Load Test Runner Script
#
# Convenience script for running k6 load tests with proper environment
# setup and result collection.
#
# Usage:
#   ./scripts/run-load-tests.sh smoke                           # 2 min
#   ./scripts/run-load-tests.sh sla-validation dev              # 14 min
#   ./scripts/run-load-tests.sh loan-application staging stress # 10 min
# ---------------------------------------------------------------------------

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
TEST_TYPE="${1:-sla-validation}"
ENVIRONMENT="${2:-dev}"
PROFILE="${3:-load}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="test-results/${TIMESTAMP}"

# Mapping of test names to scripts
declare -A TEST_SCRIPTS=(
  ["smoke"]="scripts/load-test.js"
  ["loan-application"]="scripts/load-tests/loan-application.js"
  ["repayment-processing"]="scripts/load-tests/repayment-processing.js"
  ["graphql-queries"]="scripts/load-tests/graphql-queries.js"
  ["tenant-isolation"]="scripts/load-tests/tenant-isolation.js"
  ["sla-validation"]="scripts/load-tests/sla-validation.js"
)

# Mapping of test names to estimated durations
declare -A TEST_DURATIONS=(
  ["smoke"]="2 minutes"
  ["loan-application"]="10 minutes"
  ["repayment-processing"]="5 minutes"
  ["graphql-queries"]="8 minutes"
  ["tenant-isolation"]="2 minutes"
  ["sla-validation"]="14 minutes"
)

# Function to print usage
usage() {
  cat << EOF
${BLUE}Lōns Load Test Runner${NC}

Usage:
  ./scripts/run-load-tests.sh [TEST_TYPE] [ENVIRONMENT] [PROFILE]

Test Types:
  smoke                 Quick 2-minute sanity check (default)
  loan-application      Full application flow (10 min)
  repayment-processing  Repayment throughput test (5 min)
  graphql-queries       GraphQL query performance (8 min)
  tenant-isolation      Multi-tenant isolation test (2 min)
  sla-validation        Full SLA validation suite (14 min)

Environments:
  dev                   Local development (default)
  staging               Staging environment
  preprod               Pre-production
  prod                  Production

Profiles:
  smoke                 1-minute quick test
  load                  Sustained load test (default)
  stress                Ramp to breaking point
  soak                  Long-running stability test
  spike                 Sudden traffic spike

Examples:
  ./scripts/run-load-tests.sh                                 # smoke on dev
  ./scripts/run-load-tests.sh sla-validation preprod         # Full suite on preprod
  ./scripts/run-load-tests.sh loan-application staging stress # Stress test on staging

EOF
}

# Function to print banner
print_banner() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  Lōns Load Test: $TEST_TYPE${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "Environment:  ${GREEN}$ENVIRONMENT${NC}"
  echo -e "Profile:      ${GREEN}$PROFILE${NC}"
  echo -e "Duration:     ${GREEN}${TEST_DURATIONS[$TEST_TYPE]}${NC}"
  echo -e "Results:      ${GREEN}$RESULTS_DIR${NC}"
  echo ""
}

# Function to verify k6 installation
verify_k6() {
  if ! command -v k6 &> /dev/null; then
    echo -e "${RED}ERROR: k6 is not installed${NC}"
    echo "Install with: brew install k6 (macOS) or apt-get install k6 (Ubuntu)"
    exit 1
  fi
  echo -e "${GREEN}✓ k6 $(k6 version | grep -o '[0-9.]*')${NC}"
}

# Function to verify test script exists
verify_test_script() {
  if [[ ! ${TEST_SCRIPTS[$TEST_TYPE]+_} ]]; then
    echo -e "${RED}ERROR: Unknown test type '$TEST_TYPE'${NC}"
    usage
    exit 1
  fi

  local script="${TEST_SCRIPTS[$TEST_TYPE]}"
  if [[ ! -f "$script" ]]; then
    echo -e "${RED}ERROR: Test script not found: $script${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Test script: $script${NC}"
}

# Function to verify environment
verify_environment() {
  case "$ENVIRONMENT" in
    dev|staging|preprod|prod)
      echo -e "${GREEN}✓ Environment: $ENVIRONMENT${NC}"
      ;;
    *)
      echo -e "${RED}ERROR: Unknown environment '$ENVIRONMENT'${NC}"
      usage
      exit 1
      ;;
  esac
}

# Function to setup results directory
setup_results_dir() {
  mkdir -p "$RESULTS_DIR"
  echo -e "${GREEN}✓ Results directory: $RESULTS_DIR${NC}"
}

# Function to run test
run_test() {
  local script="${TEST_SCRIPTS[$TEST_TYPE]}"

  echo ""
  echo -e "${YELLOW}Running test...${NC}"
  echo ""

  # Run k6 with JSON output
  k6 run \
    -e ENVIRONMENT="$ENVIRONMENT" \
    -e PROFILE="$PROFILE" \
    --out json="$RESULTS_DIR/results.json" \
    "$script"

  local exit_code=$?

  echo ""
  echo -e "${BLUE}========================================${NC}"
  if [[ $exit_code -eq 0 ]]; then
    echo -e "${GREEN}✓ Test PASSED${NC}"
  else
    echo -e "${RED}✗ Test FAILED${NC}"
  fi
  echo -e "${BLUE}========================================${NC}"

  return $exit_code
}

# Function to generate summary
generate_summary() {
  local results_file="$RESULTS_DIR/results.json"

  if [[ ! -f "$results_file" ]]; then
    return
  fi

  echo ""
  echo -e "${BLUE}Test Summary${NC}"
  echo "=============="

  # Extract key metrics from JSON (basic parsing)
  if command -v jq &> /dev/null; then
    echo "Metrics:"
    jq -r '.metrics | keys[]' "$results_file" 2>/dev/null | head -10
    echo ""
  fi

  echo "Results saved to: $RESULTS_DIR/"
  echo "  - results.json"

  # Suggest next steps
  echo ""
  echo -e "${GREEN}Next steps:${NC}"
  echo "  1. Review results: cat $RESULTS_DIR/results.json"
  echo "  2. Generate HTML report: k6 run --out csv=$RESULTS_DIR/results.csv $script"
  echo "  3. Upload to InfluxDB for dashboard visualization"
}

# Function to estimate completion time
estimate_completion() {
  local duration="${TEST_DURATIONS[$TEST_TYPE]}"
  local now=$(date '+%I:%M %p')
  echo -e "${YELLOW}Estimated completion: depends on load${NC}"
  echo -e "${YELLOW}Started at: $now${NC}"
}

# Main execution
main() {
  if [[ "$TEST_TYPE" == "help" || "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
  fi

  echo -e "${BLUE}Verifying environment...${NC}"
  verify_k6
  verify_test_script
  verify_environment
  setup_results_dir

  print_banner
  estimate_completion

  run_test
  local exit_code=$?

  generate_summary

  exit $exit_code
}

# Run main function
main "$@"
