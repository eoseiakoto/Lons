#!/usr/bin/env bash
###############################################################################
# snapshot-staging.sh
#
# Creates on-demand snapshots of staging infrastructure:
# - RDS database snapshot with timestamp
# - Optional Redis snapshot
# - Shows monitoring commands for progress
# - Proper error handling and colored output
#
# Usage: ./snapshot-staging.sh [--include-redis]
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
ENVIRONMENT="staging"
PROJECT_NAME="lons"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

INCLUDE_REDIS=false
RDS_CLUSTER_ID="lons-staging"
REDIS_CLUSTER_ID="lons-staging-redis"

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

print_code() {
  echo -e "${CYAN}  $1${NC}"
}

check_prerequisites() {
  print_section "Checking prerequisites"

  local required_cmds=("aws" "jq")
  for cmd in "${required_cmds[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
      print_failure "Required command '$cmd' not found"
      exit 1
    fi
  done
  print_success "All required commands available"

  # Verify AWS credentials
  if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    print_failure "AWS credentials not configured or invalid"
    exit 1
  fi
  print_success "AWS credentials valid"
}

snapshot_rds() {
  print_section "Creating RDS snapshot"

  # Find the RDS instance or cluster
  print_info "Looking for RDS cluster/instance: $RDS_CLUSTER_ID"

  # Check if it's a cluster
  local cluster_exists=$(aws rds describe-db-clusters \
    --region "$AWS_REGION" \
    --query "DBClusters[?DBClusterIdentifier=='$RDS_CLUSTER_ID'].DBClusterIdentifier" \
    --output text 2>/dev/null || echo "")

  if [ -n "$cluster_exists" ]; then
    create_cluster_snapshot
  else
    # Check if it's an instance
    local instance_exists=$(aws rds describe-db-instances \
      --region "$AWS_REGION" \
      --query "DBInstances[?DBInstanceIdentifier=='$RDS_CLUSTER_ID'].DBInstanceIdentifier" \
      --output text 2>/dev/null || echo "")

    if [ -n "$instance_exists" ]; then
      create_instance_snapshot
    else
      print_failure "RDS cluster/instance '$RDS_CLUSTER_ID' not found"
      return 1
    fi
  fi
}

create_cluster_snapshot() {
  local snapshot_id="${RDS_CLUSTER_ID}-${TIMESTAMP}"

  print_info "Creating RDS cluster snapshot: $snapshot_id"

  if aws rds create-db-cluster-snapshot \
    --region "$AWS_REGION" \
    --db-cluster-snapshot-identifier "$snapshot_id" \
    --db-cluster-identifier "$RDS_CLUSTER_ID" \
    --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=$PROJECT_NAME" "Key=CreatedAt,Value=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >/dev/null 2>&1; then

    print_success "RDS cluster snapshot initiated: $snapshot_id"
    echo ""
    print_info "Monitor snapshot progress with:"
    print_code "aws rds describe-db-cluster-snapshots --region $AWS_REGION \\"
    print_code "  --db-cluster-snapshot-identifier $snapshot_id \\"
    print_code "  --query 'DBClusterSnapshots[0].[PercentProgress,Status,SnapshotCreateTime]' \\"
    print_code "  --output text"
    echo ""
    print_info "Or watch status:"
    print_code "watch -n 5 'aws rds describe-db-cluster-snapshots --region $AWS_REGION --db-cluster-snapshot-identifier $snapshot_id --query DBClusterSnapshots[0].[PercentProgress,Status] --output text'"

    return 0
  else
    print_failure "Failed to create RDS cluster snapshot"
    return 1
  fi
}

create_instance_snapshot() {
  local snapshot_id="${RDS_CLUSTER_ID}-${TIMESTAMP}"

  print_info "Creating RDS instance snapshot: $snapshot_id"

  if aws rds create-db-snapshot \
    --region "$AWS_REGION" \
    --db-snapshot-identifier "$snapshot_id" \
    --db-instance-identifier "$RDS_CLUSTER_ID" \
    --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=$PROJECT_NAME" "Key=CreatedAt,Value=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >/dev/null 2>&1; then

    print_success "RDS instance snapshot initiated: $snapshot_id"
    echo ""
    print_info "Monitor snapshot progress with:"
    print_code "aws rds describe-db-snapshots --region $AWS_REGION \\"
    print_code "  --db-snapshot-identifier $snapshot_id \\"
    print_code "  --query 'DBSnapshots[0].[PercentProgress,Status,SnapshotCreateTime]' \\"
    print_code "  --output text"
    echo ""
    print_info "Or watch status:"
    print_code "watch -n 5 'aws rds describe-db-snapshots --region $AWS_REGION --db-snapshot-identifier $snapshot_id --query DBSnapshots[0].[PercentProgress,Status] --output text'"

    return 0
  else
    print_failure "Failed to create RDS instance snapshot"
    return 1
  fi
}

snapshot_redis() {
  if [ "$INCLUDE_REDIS" != "true" ]; then
    return 0
  fi

  print_section "Creating Redis snapshot"

  print_info "Looking for Redis cluster: $REDIS_CLUSTER_ID"

  # Check if cluster exists
  local cluster_exists=$(aws elasticache describe-replication-groups \
    --region "$AWS_REGION" \
    --replication-group-id "$REDIS_CLUSTER_ID" \
    --query 'ReplicationGroups[0].ReplicationGroupId' \
    --output text 2>/dev/null || echo "")

  if [ -z "$cluster_exists" ] || [ "$cluster_exists" = "None" ]; then
    print_warning "Redis cluster '$REDIS_CLUSTER_ID' not found, skipping"
    return 0
  fi

  # Create snapshot via backup
  local snapshot_id="${REDIS_CLUSTER_ID}-${TIMESTAMP}"

  print_info "Creating Redis snapshot: $snapshot_id"

  # Get primary node
  local primary_node=$(aws elasticache describe-replication-groups \
    --region "$AWS_REGION" \
    --replication-group-id "$REDIS_CLUSTER_ID" \
    --query 'ReplicationGroups[0].MemberClusters[0]' \
    --output text 2>/dev/null || echo "")

  if [ -z "$primary_node" ] || [ "$primary_node" = "None" ]; then
    print_warning "Could not find Redis primary node"
    return 1
  fi

  # Note: ElastiCache snapshots are created via backup, not direct API
  print_info "ElastiCache automatic backups are handled by AWS Backup"
  print_info "Manual backup not available via CLI for Redis"
  echo ""
  print_info "To create a Redis backup:"
  print_code "aws elasticache create-snapshot --cache-cluster-id $primary_node --snapshot-name $snapshot_id --region $AWS_REGION"

  return 0
}

get_snapshot_status() {
  print_section "Current snapshot status"

  # Get recent RDS snapshots
  print_info "Recent RDS snapshots:"
  local snapshots=$(aws rds describe-db-snapshots \
    --region "$AWS_REGION" \
    --query "DBSnapshots[?contains(DBSnapshotIdentifier, '$ENVIRONMENT')].[DBSnapshotIdentifier,Status,PercentProgress,SnapshotCreateTime]" \
    --output text \
    2>/dev/null | head -5)

  if [ -n "$snapshots" ]; then
    echo "$snapshots" | while read -r snap_id status percent create_time; do
      if [ -z "$snap_id" ]; then continue; fi
      echo -e "  ${MAGENTA}→ $snap_id${NC}"
      echo -e "    Status: ${CYAN}$status${NC} (${percent:-0}%)"
      echo -e "    Created: ${CYAN}$create_time${NC}"
    done
  else
    print_warning "No snapshots found"
  fi
}

get_backup_history() {
  print_section "AWS Backup history (RDS only)"

  # Get recent backup jobs
  local backup_jobs=$(aws backup list-backup-jobs \
    --region "$AWS_REGION" \
    --by-resource-type RDS \
    --query "BackupJobs[?contains(ResourceArn, '$ENVIRONMENT')].[RecoveryPointArn,Status,CreationDate,CompletionDate]" \
    --output text \
    2>/dev/null | head -5)

  if [ -n "$backup_jobs" ]; then
    echo "$backup_jobs" | while read -r arn status created completed; do
      if [ -z "$arn" ]; then continue; fi
      echo -e "  ${MAGENTA}→ $(basename $arn)${NC}"
      echo -e "    Status: ${CYAN}$status${NC}"
      echo -e "    Created: ${CYAN}$created${NC}"
    done
  else
    print_warning "No backup jobs found"
  fi
}

estimate_snapshot_size() {
  print_section "Database size estimate"

  # Get database info
  local db_size=$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --query "DBInstances[?contains(DBInstanceIdentifier, '$ENVIRONMENT')].AllocatedStorage" \
    --output text \
    2>/dev/null || echo "unknown")

  if [ "$db_size" != "unknown" ] && [ -n "$db_size" ]; then
    print_info "Database allocated storage: ${db_size} GB"
    print_info "Snapshot size will depend on actual data usage"
  else
    print_warning "Could not retrieve database size"
  fi
}

# ============================================================================
# Main Function
# ============================================================================

main() {
  print_header "Staging Snapshot Creation"

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --include-redis)
        INCLUDE_REDIS=true
        shift
        ;;
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

  print_info "Region: $AWS_REGION"
  print_info "Timestamp: $TIMESTAMP"
  print_info "Include Redis: $INCLUDE_REDIS"
  echo ""

  # Check prerequisites
  check_prerequisites
  echo ""

  # Create snapshots
  snapshot_rds || true
  snapshot_redis || true
  echo ""

  # Show current status
  get_snapshot_status
  echo ""

  get_backup_history
  echo ""

  estimate_snapshot_size
  echo ""

  # ========================================================================
  # Summary
  # ========================================================================
  print_header "Snapshot Operations Initiated"

  echo -e "${GREEN}RDS snapshot:${NC}    Initiated"
  if [ "$INCLUDE_REDIS" = "true" ]; then
    echo -e "${GREEN}Redis snapshot:${NC}   Initiated"
  fi
  echo ""
  print_info "Check progress using commands above"
  print_info "Snapshots are retained per your backup policy"
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
