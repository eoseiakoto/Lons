#!/bin/bash
set -euo pipefail

##############################################################################
# seed-secrets.sh
#
# Purpose: Seed AWS Secrets Manager with staging environment secrets.
#          - Generates JWT RS256 keypair
#          - Generates AES-256 encryption key
#          - Creates 5 secret paths in AWS Secrets Manager
#          - Idempotent: updates if exists, creates if not
#          - Includes verification step to list created secrets
#
# Usage:
#   ./seed-secrets.sh [--region eu-west-1] [--profile staging]
#
# Environment Variables:
#   AWS_REGION - AWS region (default: eu-west-1)
#   AWS_PROFILE - AWS profile (default: default)
#
##############################################################################

# Default values
REGION="${AWS_REGION:-eu-west-1}"
PROFILE="${AWS_PROFILE:-default}"
ENVIRONMENT="staging"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

##############################################################################
# Helper Functions
##############################################################################

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

##############################################################################
# Validation
##############################################################################

check_dependencies() {
  local deps=("aws" "openssl" "base64" "jq")
  for cmd in "${deps[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
      log_error "$cmd is required but not installed."
      exit 1
    fi
  done
  log_info "All dependencies found: ${deps[*]}"
}

##############################################################################
# Key Generation
##############################################################################

generate_jwt_keys() {
  log_info "Generating JWT RS256 keypair..."

  # Generate private key (2048-bit RSA)
  local private_key
  private_key=$(openssl genrsa 2048 2>/dev/null)

  # Extract public key from private key
  local public_key
  public_key=$(echo "$private_key" | openssl rsa -pubout 2>/dev/null)

  # Base64 encode for storage
  local private_key_b64
  private_key_b64=$(echo "$private_key" | base64 -w 0)

  local public_key_b64
  public_key_b64=$(echo "$public_key" | base64 -w 0)

  echo "$private_key_b64" "$public_key_b64"
}

generate_encryption_key() {
  log_info "Generating AES-256 encryption key..."

  # Generate 32 bytes (256 bits) of random data and base64 encode
  local key
  key=$(openssl rand -base64 32)

  echo "$key"
}

##############################################################################
# AWS Secrets Manager Operations
##############################################################################

create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2
  local description=$3

  log_info "Creating/updating secret: $secret_name"

  # Check if secret exists
  if aws secretsmanager describe-secret \
    --secret-id "$secret_name" \
    --region "$REGION" \
    --profile "$PROFILE" \
    &>/dev/null; then

    # Secret exists, update it
    log_info "Secret already exists, updating..."
    aws secretsmanager update-secret \
      --secret-id "$secret_name" \
      --secret-string "$secret_value" \
      --region "$REGION" \
      --profile "$PROFILE" \
      --output text > /dev/null

  else
    # Secret does not exist, create it
    log_info "Creating new secret..."
    aws secretsmanager create-secret \
      --name "$secret_name" \
      --secret-string "$secret_value" \
      --description "$description" \
      --region "$REGION" \
      --profile "$PROFILE" \
      --tags "Key=Environment,Value=$ENVIRONMENT" "Key=ManagedBy,Value=terraform-seed" \
      --output text > /dev/null
  fi

  log_info "Secret '$secret_name' ready"
}

##############################################################################
# Main Execution
##############################################################################

main() {
  log_info "Starting AWS Secrets Manager seed for environment: $ENVIRONMENT"
  log_info "Region: $REGION, Profile: $PROFILE"
  echo ""

  # Validate dependencies
  check_dependencies
  echo ""

  # Generate keys
  log_info "Generating cryptographic keys..."
  JWT_KEYS=$(generate_jwt_keys)
  JWT_PRIVATE_KEY=$(echo "$JWT_KEYS" | awk '{print $1}')
  JWT_PUBLIC_KEY=$(echo "$JWT_KEYS" | awk '{print $2}')

  ENCRYPTION_KEY=$(generate_encryption_key)

  log_info "Keys generated successfully"
  echo ""

  # ========================================================================
  # 1. Database Credentials Secret
  # ========================================================================
  log_info "Creating Database credentials secret..."
  DB_SECRET=$(jq -n \
    --arg url "postgresql://lons_user:lons_password_staging@staging-postgres.rds.amazonaws.com:5432/lons" \
    --arg host "staging-postgres.rds.amazonaws.com" \
    --arg port "5432" \
    --arg database "lons" \
    --arg username "lons_user" \
    --arg password "lons_password_staging" \
    '{
      "DATABASE_URL": $url,
      "POSTGRES_HOST": $host,
      "POSTGRES_PORT": $port,
      "POSTGRES_DB": $database,
      "POSTGRES_USER": $username,
      "POSTGRES_PASSWORD": $password
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/database" \
    "$DB_SECRET" \
    "Lons staging PostgreSQL database credentials"
  echo ""

  # ========================================================================
  # 2. Redis Credentials Secret
  # ========================================================================
  log_info "Creating Redis credentials secret..."
  REDIS_SECRET=$(jq -n \
    --arg url "redis://staging-redis.cache.amazonaws.com:6379" \
    --arg host "staging-redis.cache.amazonaws.com" \
    --arg port "6379" \
    '{
      "REDIS_URL": $url,
      "REDIS_HOST": $host,
      "REDIS_PORT": $port
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/redis" \
    "$REDIS_SECRET" \
    "Lons staging Redis cache credentials"
  echo ""

  # ========================================================================
  # 3. JWT Keys Secret
  # ========================================================================
  log_info "Creating JWT keys secret..."
  JWT_SECRET=$(jq -n \
    --arg private_key "$JWT_PRIVATE_KEY" \
    --arg public_key "$JWT_PUBLIC_KEY" \
    --arg expiry "3600" \
    --arg refresh_expiry "604800" \
    '{
      "JWT_PRIVATE_KEY": $private_key,
      "JWT_PUBLIC_KEY": $public_key,
      "JWT_EXPIRY": $expiry,
      "REFRESH_TOKEN_EXPIRY": $refresh_expiry
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/jwt" \
    "$JWT_SECRET" \
    "Lons staging JWT RS256 keypair and expiry settings"
  echo ""

  # ========================================================================
  # 4. Encryption Key Secret
  # ========================================================================
  log_info "Creating Encryption key secret..."
  ENCRYPTION_SECRET=$(jq -n \
    --arg key "$ENCRYPTION_KEY" \
    --arg iv_length "16" \
    '{
      "ENCRYPTION_KEY": $key,
      "ENCRYPTION_IV_LENGTH": $iv_length
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/encryption" \
    "$ENCRYPTION_SECRET" \
    "Lons staging AES-256 encryption key and IV length"
  echo ""

  # ========================================================================
  # 5. Integration Credentials Secret (Sandbox/Test Values)
  # ========================================================================
  log_info "Creating Integration credentials secret..."
  INTEGRATION_SECRET=$(jq -n \
    --arg mtn_api_key "sandbox-mtn-momo-api-key" \
    --arg mtn_api_secret "sandbox-mtn-momo-api-secret" \
    --arg mtn_env "sandbox" \
    --arg at_api_key "sandbox-africas-talking-api-key" \
    --arg at_username "sandbox" \
    '{
      "MTN_MOMO_API_KEY": $mtn_api_key,
      "MTN_MOMO_API_SECRET": $mtn_api_secret,
      "MTN_MOMO_ENVIRONMENT": $mtn_env,
      "AFRICAS_TALKING_API_KEY": $at_api_key,
      "AFRICAS_TALKING_USERNAME": $at_username
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/integrations" \
    "$INTEGRATION_SECRET" \
    "Lons staging external integration credentials (sandbox/test values)"
  echo ""

  # ========================================================================
  # 6. Grafana Credentials Secret
  # ========================================================================
  log_info "Creating Grafana credentials secret..."
  GRAFANA_SECRET=$(jq -n \
    --arg username "admin" \
    --arg password "LonsStaging2026!" \
    '{
      "username": $username,
      "password": $password
    }')

  create_or_update_secret \
    "lons/$ENVIRONMENT/grafana" \
    "$GRAFANA_SECRET" \
    "Lons staging Grafana admin credentials"
  echo ""

  # ========================================================================
  # Verification
  # ========================================================================
  log_info "Verifying created secrets..."
  echo ""

  local secret_paths=(
    "lons/$ENVIRONMENT/database"
    "lons/$ENVIRONMENT/redis"
    "lons/$ENVIRONMENT/jwt"
    "lons/$ENVIRONMENT/encryption"
    "lons/$ENVIRONMENT/integrations"
    "lons/$ENVIRONMENT/grafana"
  )

  local all_found=true
  for secret_path in "${secret_paths[@]}"; do
    if aws secretsmanager describe-secret \
      --secret-id "$secret_path" \
      --region "$REGION" \
      --profile "$PROFILE" \
      &>/dev/null; then
      echo -e "${GREEN}✓${NC} $secret_path"
    else
      echo -e "${RED}✗${NC} $secret_path (FAILED)"
      all_found=false
    fi
  done
  echo ""

  if [ "$all_found" = true ]; then
    log_info "All secrets created/updated successfully!"
    log_info "Next steps:"
    echo "  1. Verify secrets in AWS Console: https://console.aws.amazon.com/secretsmanager"
    echo "  2. Update Terraform variables with actual RDS/ElastiCache endpoints"
    echo "  3. Update Helm values-staging.yaml with postgresql.host and redis.host"
    exit 0
  else
    log_error "Some secrets failed verification!"
    exit 1
  fi
}

# Run main function
main "$@"
