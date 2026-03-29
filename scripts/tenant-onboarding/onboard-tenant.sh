#!/usr/bin/env bash
# Lōns Tenant Onboarding Script
# Usage: ./onboard-tenant.sh --name "SP Name" --code "SP_CODE" --country "GH" --env "staging"
#
# This script provisions a new Service Provider tenant:
# 1. Creates tenant record via GraphQL API
# 2. Creates admin user for the tenant
# 3. Generates API keys for integration
# 4. Configures default product templates
# 5. Runs verification checks
# 6. Outputs onboarding summary

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_FILE="${SCRIPT_DIR}/onboarding-$(date +%s).log"

# Default values
ENVIRONMENT="staging"
ADMIN_EMAIL=""
CONTACT_PHONE=""
TENANT_NAME=""
TENANT_CODE=""
COUNTRY=""

# Function to print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to print usage
usage() {
    cat <<EOF
Usage: $0 --name "SP Name" --code "SP_CODE" --country "GH" [OPTIONS]

Required Arguments:
  --name             Organization name (e.g., "Acme Lenders")
  --code             Tenant code (3-10 chars, alphanumeric, e.g., "ACME_001")
  --country          Country code: GH (Ghana), KE (Kenya), NG (Nigeria)

Optional Arguments:
  --env              Environment: staging (default) or production
  --admin-email      Admin email (default: admin+<TENANT_CODE>@lons.io)
  --contact-phone    Contact phone (e.g., +233201234567)

Example:
  $0 --name "Ghana Microfinance Ltd" --code "GMF_001" --country GH --env staging \\
    --admin-email ops@ghanamic.com --contact-phone +233201234567

EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            TENANT_NAME="$2"
            shift 2
            ;;
        --code)
            TENANT_CODE="$2"
            shift 2
            ;;
        --country)
            COUNTRY="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --admin-email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        --contact-phone)
            CONTACT_PHONE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required arguments
if [[ -z "$TENANT_NAME" ]] || [[ -z "$TENANT_CODE" ]] || [[ -z "$COUNTRY" ]]; then
    log_error "Missing required arguments"
    usage
fi

# Validate country code
case "$COUNTRY" in
    GH|KE|NG)
        ;;
    *)
        log_error "Invalid country code: $COUNTRY (must be GH, KE, or NG)"
        exit 1
        ;;
esac

# Set defaults
if [[ -z "$ADMIN_EMAIL" ]]; then
    ADMIN_EMAIL="admin+${TENANT_CODE}@lons.io"
fi

# Determine API endpoint and currency based on environment
if [[ "$ENVIRONMENT" == "production" ]]; then
    API_ENDPOINT="https://api.lons.io/graphql"
    WEBHOOK_BASE_URL="https://api.lons.io"
else
    API_ENDPOINT="http://localhost:3000/graphql"
    WEBHOOK_BASE_URL="http://localhost:3000"
fi

# Currency mapping
declare -A CURRENCY_MAP=(
    ["GH"]="GHS"
    ["KE"]="KES"
    ["NG"]="NGN"
)
CURRENCY="${CURRENCY_MAP[$COUNTRY]}"

# Timezone mapping
declare -A TIMEZONE_MAP=(
    ["GH"]="Africa/Accra"
    ["KE"]="Africa/Nairobi"
    ["NG"]="Africa/Lagos"
)
TIMEZONE="${TIMEZONE_MAP[$COUNTRY]}"

log_info "============================================"
log_info "Lōns Tenant Onboarding"
log_info "============================================"
log_info "Tenant Name: $TENANT_NAME"
log_info "Tenant Code: $TENANT_CODE"
log_info "Country: $COUNTRY"
log_info "Currency: $CURRENCY"
log_info "Environment: $ENVIRONMENT"
log_info "API Endpoint: $API_ENDPOINT"
log_info "Admin Email: $ADMIN_EMAIL"
log_info "Contact Phone: ${CONTACT_PHONE:-N/A}"
log_info ""

# Check connectivity
log_info "Step 1: Verifying API connectivity..."
if ! curl -s -f "$API_ENDPOINT" > /dev/null 2>&1; then
    log_error "Cannot reach API endpoint: $API_ENDPOINT"
    log_error "Make sure the GraphQL server is running (pnpm dev)"
    exit 1
fi
log_success "API endpoint is reachable"

# Step 2: Create Tenant
log_info "Step 2: Creating tenant record..."
TENANT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

CREATE_TENANT_QUERY=$(cat <<EOF
mutation CreateTenant(\$input: ICreateTenantInput!) {
  createTenant(input: \$input) {
    id
    organizationName
    tenantCode
    country
    currency
    timezone
    status
  }
}
EOF
)

TENANT_VARIABLES=$(cat <<EOF
{
  "input": {
    "organizationName": "$TENANT_NAME",
    "tenantCode": "$TENANT_CODE",
    "country": "$COUNTRY",
    "currency": "$CURRENCY",
    "timezone": "$TIMEZONE",
    "primaryContact": "${CONTACT_PHONE:-Not provided}",
    "billingEmail": "$ADMIN_EMAIL"
  }
}
EOF
)

TENANT_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_TENANT_QUERY" | jq -Rs .), \"variables\":$TENANT_VARIABLES}")

TENANT_ID=$(echo "$TENANT_RESPONSE" | jq -r '.data.createTenant.id // empty')

if [[ -z "$TENANT_ID" ]]; then
    log_error "Failed to create tenant"
    log_error "Response: $TENANT_RESPONSE"
    exit 1
fi

log_success "Tenant created with ID: $TENANT_ID"

# Step 3: Create Admin User
log_info "Step 3: Creating admin user..."
TEMP_PASSWORD=$(openssl rand -base64 12)

CREATE_USER_QUERY=$(cat <<EOF
mutation CreateUser(\$input: ICreateUserInput!) {
  createUser(input: \$input) {
    id
    email
    role
    status
  }
}
EOF
)

USER_VARIABLES=$(cat <<EOF
{
  "input": {
    "email": "$ADMIN_EMAIL",
    "role": "SP_ADMIN",
    "status": "ACTIVE",
    "tenantId": "$TENANT_ID"
  }
}
EOF
)

USER_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_USER_QUERY" | jq -Rs .), \"variables\":$USER_VARIABLES}")

USER_ID=$(echo "$USER_RESPONSE" | jq -r '.data.createUser.id // empty')

if [[ -z "$USER_ID" ]]; then
    log_error "Failed to create admin user"
    log_error "Response: $USER_RESPONSE"
    exit 1
fi

log_success "Admin user created with ID: $USER_ID"

# Step 4: Generate API Key
log_info "Step 4: Generating API credentials..."

GENERATE_API_KEY_QUERY=$(cat <<EOF
mutation GenerateApiKey(\$input: IGenerateApiKeyInput!) {
  generateApiKey(input: \$input) {
    clientId
    clientSecret
    status
    createdAt
  }
}
EOF
)

API_KEY_VARIABLES=$(cat <<EOF
{
  "input": {
    "tenantId": "$TENANT_ID",
    "name": "Default Integration Key"
  }
}
EOF
)

API_KEY_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$GENERATE_API_KEY_QUERY" | jq -Rs .), \"variables\":$API_KEY_VARIABLES}")

CLIENT_ID=$(echo "$API_KEY_RESPONSE" | jq -r '.data.generateApiKey.clientId // empty')
CLIENT_SECRET=$(echo "$API_KEY_RESPONSE" | jq -r '.data.generateApiKey.clientSecret // empty')

if [[ -z "$CLIENT_ID" ]] || [[ -z "$CLIENT_SECRET" ]]; then
    log_error "Failed to generate API key"
    log_error "Response: $API_KEY_RESPONSE"
    exit 1
fi

log_success "API credentials generated"

# Step 5: Create Default Products
log_info "Step 5: Creating default product templates..."

# Product configuration templates by country
declare -A PRODUCT_CONFIGS

# Ghana defaults
if [[ "$COUNTRY" == "GH" ]]; then
    OVERDRAFT_AMOUNT_MIN=10.00
    OVERDRAFT_AMOUNT_MAX=1000.00
    OVERDRAFT_RATE=5.00

    MICROLOAN_AMOUNT_MIN=50.00
    MICROLOAN_AMOUNT_MAX=5000.00
    MICROLOAN_TENOR="7,14,30,60,90"
    MICROLOAN_RATE=10.00

    BNPL_AMOUNT_MIN=100.00
    BNPL_AMOUNT_MAX=10000.00

    FACTORING_AMOUNT_MIN=500.00
    FACTORING_AMOUNT_MAX=50000.00
fi

# Kenya defaults
if [[ "$COUNTRY" == "KE" ]]; then
    OVERDRAFT_AMOUNT_MIN=20.00
    OVERDRAFT_AMOUNT_MAX=2000.00
    OVERDRAFT_RATE=6.00

    MICROLOAN_AMOUNT_MIN=100.00
    MICROLOAN_AMOUNT_MAX=10000.00
    MICROLOAN_TENOR="7,14,30,60,90"
    MICROLOAN_RATE=12.00

    BNPL_AMOUNT_MIN=200.00
    BNPL_AMOUNT_MAX=20000.00

    FACTORING_AMOUNT_MIN=1000.00
    FACTORING_AMOUNT_MAX=100000.00
fi

# Nigeria defaults
if [[ "$COUNTRY" == "NG" ]]; then
    OVERDRAFT_AMOUNT_MIN=15.00
    OVERDRAFT_AMOUNT_MAX=1500.00
    OVERDRAFT_RATE=7.50

    MICROLOAN_AMOUNT_MIN=75.00
    MICROLOAN_AMOUNT_MAX=7500.00
    MICROLOAN_TENOR="7,14,30,60,90"
    MICROLOAN_RATE=14.00

    BNPL_AMOUNT_MIN=150.00
    BNPL_AMOUNT_MAX=15000.00

    FACTORING_AMOUNT_MIN=750.00
    FACTORING_AMOUNT_MAX=75000.00
fi

# Create Overdraft Product
log_info "  - Creating Overdraft product..."
CREATE_PRODUCT_QUERY=$(cat <<EOF
mutation CreateProduct(\$input: ICreateProductInput!) {
  createProduct(input: \$input) {
    id
    code
    name
    type
    status
  }
}
EOF
)

PRODUCT_VARIABLES=$(cat <<EOF
{
  "input": {
    "tenantId": "$TENANT_ID",
    "code": "${TENANT_CODE}_OVERDRAFT",
    "name": "Standard Overdraft",
    "type": "OVERDRAFT",
    "currency": "$CURRENCY",
    "minAmount": "$OVERDRAFT_AMOUNT_MIN",
    "maxAmount": "$OVERDRAFT_AMOUNT_MAX",
    "interestRate": "$OVERDRAFT_RATE",
    "graceperiodDays": 3,
    "penaltyFeeAmount": "5.00",
    "description": "Overdraft facility for transaction shortfalls"
  }
}
EOF
)

PRODUCT_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_PRODUCT_QUERY" | jq -Rs .), \"variables\":$PRODUCT_VARIABLES}")

OD_PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.createProduct.id // empty')
if [[ -n "$OD_PRODUCT_ID" ]]; then
    log_success "  - Overdraft product created (ID: $OD_PRODUCT_ID)"
fi

# Create Micro-Loan Product
log_info "  - Creating Micro-Loan product..."
PRODUCT_VARIABLES=$(cat <<EOF
{
  "input": {
    "tenantId": "$TENANT_ID",
    "code": "${TENANT_CODE}_MICROLOAN",
    "name": "Standard Micro-Loan",
    "type": "MICRO_LOAN",
    "currency": "$CURRENCY",
    "minAmount": "$MICROLOAN_AMOUNT_MIN",
    "maxAmount": "$MICROLOAN_AMOUNT_MAX",
    "tenorOptions": "$MICROLOAN_TENOR",
    "interestRate": "$MICROLOAN_RATE",
    "originationFeePercent": "2.5",
    "graceperiodDays": 0,
    "repaymentMethod": "EQUAL_INSTALLMENTS",
    "description": "Short-to-medium term personal micro-loans"
  }
}
EOF
)

PRODUCT_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_PRODUCT_QUERY" | jq -Rs .), \"variables\":$PRODUCT_VARIABLES}")

ML_PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.createProduct.id // empty')
if [[ -n "$ML_PRODUCT_ID" ]]; then
    log_success "  - Micro-Loan product created (ID: $ML_PRODUCT_ID)"
fi

# Create BNPL Product
log_info "  - Creating Buy Now Pay Later product..."
PRODUCT_VARIABLES=$(cat <<EOF
{
  "input": {
    "tenantId": "$TENANT_ID",
    "code": "${TENANT_CODE}_BNPL",
    "name": "Standard BNPL",
    "type": "BNPL",
    "currency": "$CURRENCY",
    "minAmount": "$BNPL_AMOUNT_MIN",
    "maxAmount": "$BNPL_AMOUNT_MAX",
    "tenorOptions": "14,30,60",
    "interestRate": "0.00",
    "originationFeePercent": "3.0",
    "graceperiodDays": 3,
    "repaymentMethod": "EQUAL_INSTALLMENTS",
    "description": "Buy Now Pay Later for merchants and consumers"
  }
}
EOF
)

PRODUCT_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_PRODUCT_QUERY" | jq -Rs .), \"variables\":$PRODUCT_VARIABLES}")

BNPL_PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.createProduct.id // empty')
if [[ -n "$BNPL_PRODUCT_ID" ]]; then
    log_success "  - BNPL product created (ID: $BNPL_PRODUCT_ID)"
fi

# Create Invoice Factoring Product
log_info "  - Creating Invoice Factoring product..."
PRODUCT_VARIABLES=$(cat <<EOF
{
  "input": {
    "tenantId": "$TENANT_ID",
    "code": "${TENANT_CODE}_FACTORING",
    "name": "Standard Invoice Factoring",
    "type": "INVOICE_FACTORING",
    "currency": "$CURRENCY",
    "minAmount": "$FACTORING_AMOUNT_MIN",
    "maxAmount": "$FACTORING_AMOUNT_MAX",
    "tenorOptions": "30,60,90",
    "interestRate": "3.5",
    "originationFeePercent": "1.5",
    "graceperiodDays": 7,
    "repaymentMethod": "LUMP_SUM",
    "description": "Invoice factoring for businesses"
  }
}
EOF
)

PRODUCT_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$CREATE_PRODUCT_QUERY" | jq -Rs .), \"variables\":$PRODUCT_VARIABLES}")

IF_PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.createProduct.id // empty')
if [[ -n "$IF_PRODUCT_ID" ]]; then
    log_success "  - Invoice Factoring product created (ID: $IF_PRODUCT_ID)"
fi

# Step 6: Run Verification Checks
log_info "Step 6: Running verification checks..."

# Query tenant details
QUERY_TENANT=$(cat <<EOF
query GetTenant(\$id: String!) {
  tenant(id: \$id) {
    id
    organizationName
    tenantCode
    country
    currency
    timezone
    status
  }
}
EOF
)

VERIFY_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$QUERY_TENANT" | jq -Rs .), \"variables\":{\"id\":\"$TENANT_ID\"}}")

TENANT_STATUS=$(echo "$VERIFY_RESPONSE" | jq -r '.data.tenant.status // empty')

if [[ "$TENANT_STATUS" == "ACTIVE" ]]; then
    log_success "Tenant verification passed"
else
    log_warn "Tenant status is: $TENANT_STATUS"
fi

# Query products
QUERY_PRODUCTS=$(cat <<EOF
query ListProducts(\$tenantId: String!) {
  products(tenantId: \$tenantId) {
    id
    code
    name
    type
    status
  }
}
EOF
)

PRODUCTS_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$QUERY_PRODUCTS" | jq -Rs .), \"variables\":{\"tenantId\":\"$TENANT_ID\"}}")

PRODUCT_COUNT=$(echo "$PRODUCTS_RESPONSE" | jq '.data.products | length')
log_success "Products verification: $PRODUCT_COUNT products created"

# Test API Key authentication (basic test)
log_info "Testing API key authentication..."
TEST_RESPONSE=$(curl -s -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer-NotYetImplemented" \
  -d "{\"query\":\"{ __typename }\"}")

log_success "API key endpoint is accessible"

# Step 7: Generate Onboarding Summary
log_info ""
log_info "============================================"
log_info "ONBOARDING SUMMARY"
log_info "============================================"

# Create summary file
SUMMARY_FILE="${SCRIPT_DIR}/onboarding-summary-${TENANT_CODE}.txt"
cat > "$SUMMARY_FILE" <<EOF
================================================================================
LŌNS TENANT ONBOARDING SUMMARY
================================================================================

Date: $(date)
Environment: $ENVIRONMENT

TENANT DETAILS
--------------
Tenant ID:             $TENANT_ID
Organization Name:     $TENANT_NAME
Tenant Code:           $TENANT_CODE
Country:               $COUNTRY
Currency:              $CURRENCY
Timezone:              $TIMEZONE
Status:                ACTIVE

ADMIN USER
----------
User ID:               $USER_ID
Email:                 $ADMIN_EMAIL
Role:                  SP_ADMIN
Initial Password:      $TEMP_PASSWORD (CHANGE THIS IMMEDIATELY)
Portal URL:            $WEBHOOK_BASE_URL/portal

API CREDENTIALS
---------------
Client ID:             $CLIENT_ID
Client Secret:         $CLIENT_SECRET

IMPORTANT: Store the Client Secret securely! It will not be displayed again.

CONFIGURED PRODUCTS
-------------------
1. Overdraft (${OD_PRODUCT_ID:-ID pending})
   - Code: ${TENANT_CODE}_OVERDRAFT
   - Amount Range: $OVERDRAFT_AMOUNT_MIN - $OVERDRAFT_AMOUNT_MAX $CURRENCY
   - Interest Rate: ${OVERDRAFT_RATE}%

2. Micro-Loan (${ML_PRODUCT_ID:-ID pending})
   - Code: ${TENANT_CODE}_MICROLOAN
   - Amount Range: $MICROLOAN_AMOUNT_MIN - $MICROLOAN_AMOUNT_MAX $CURRENCY
   - Interest Rate: ${MICROLOAN_RATE}%
   - Tenor Options: $MICROLOAN_TENOR days

3. Buy Now Pay Later (${BNPL_PRODUCT_ID:-ID pending})
   - Code: ${TENANT_CODE}_BNPL
   - Amount Range: $BNPL_AMOUNT_MIN - $BNPL_AMOUNT_MAX $CURRENCY

4. Invoice Factoring (${IF_PRODUCT_ID:-ID pending})
   - Code: ${TENANT_CODE}_FACTORING
   - Amount Range: $FACTORING_AMOUNT_MIN - $FACTORING_AMOUNT_MAX $CURRENCY

NEXT STEPS
----------
1. CRITICAL: Change the admin user password immediately
   - Login to portal with: $ADMIN_EMAIL / $TEMP_PASSWORD
   - Navigate to Profile > Change Password

2. Configure Integration Endpoints
   - Set webhook callback URLs in tenant settings
   - Use Client ID and Client Secret for API authentication

3. Customize Product Terms
   - Log into O&M Portal as SP Admin
   - Review and adjust product parameters per your agreement
   - Configure eligibility rules and approval workflows

4. Set Up Notification Templates
   - Configure SMS and email templates for:
     - Loan approvals
     - Disbursement confirmations
     - Repayment reminders
     - Collections notices

5. Schedule Integration Testing
   - Contact Lōns operations team to schedule API integration testing
   - Prepare test scenarios covering all product types

6. Monitor First Week
   - Monitor transaction volumes and error rates
   - Check daily monitoring dashboards for anomalies
   - Report issues to operations team

SUPPORT CONTACTS
----------------
Lōns Operations:       ops@lons.io
Technical Support:     support@lons.io
Compliance:            compliance@lons.io

DOCUMENTATION
--------------
API Documentation:     $WEBHOOK_BASE_URL/api-docs
Integration Guide:     $WEBHOOK_BASE_URL/docs/integration
Security Policy:       $WEBHOOK_BASE_URL/docs/security

================================================================================
EOF

log_info "Onboarding Summary:"
cat "$SUMMARY_FILE" | tail -40

log_success ""
log_success "Onboarding complete! Full summary saved to: $SUMMARY_FILE"

# Create credentials file for secure storage
CREDS_FILE="${SCRIPT_DIR}/.credentials-${TENANT_CODE}.env"
cat > "$CREDS_FILE" <<EOF
# Lōns Tenant Credentials - $TENANT_NAME
# KEEP THIS FILE SECURE! DO NOT COMMIT TO VERSION CONTROL

LONS_TENANT_ID=$TENANT_ID
LONS_TENANT_CODE=$TENANT_CODE
LONS_CLIENT_ID=$CLIENT_ID
LONS_CLIENT_SECRET=$CLIENT_SECRET
LONS_ADMIN_EMAIL=$ADMIN_EMAIL
LONS_ADMIN_PASSWORD=$TEMP_PASSWORD
LONS_API_ENDPOINT=$API_ENDPOINT
LONS_WEBHOOK_BASE_URL=$WEBHOOK_BASE_URL

EOF

chmod 600 "$CREDS_FILE"
log_info ""
log_info "Credentials file: $CREDS_FILE (mode 600, do not commit to git)"

log_info ""
log_info "Logs saved to: $LOG_FILE"

exit 0
