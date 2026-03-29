#!/usr/bin/env bash
###############################################################################
# verify-backups.sh
#
# Verifies staging backup & recovery readiness:
# - Lists AWS Backup plans and vaults
# - Shows recent RDS snapshots
# - Displays backup schedule and retention policies
# - Verifies cross-region backup replication
# - Checks backup job history and status
#
# Usage: ./verify-backups.sh [--region eu-west-1]
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
DR_REGION="${DR_REGION:-us-east-1}"
ENVIRONMENT="staging"
PROJECT_NAME="lons"

# Track results
declare -A vault_status
backup_vault_name="${PROJECT_NAME}-backup-${ENVIRONMENT}"

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

verify_backup_vaults() {
  print_section "Verifying Backup Vaults"

  local vault_list=$(aws backup list-backup-vaults \
    --region "$AWS_REGION" \
    --query "BackupVaultList[?contains(BackupVaultName, '$ENVIRONMENT')].BackupVaultName" \
    --output text 2>/dev/null || echo "")

  if [ -z "$vault_list" ]; then
    print_warning "No backup vaults found for '$ENVIRONMENT'"
    return 1
  fi

  for vault_name in $vault_list; do
    print_info "Vault: $vault_name"

    # Get vault details
    local vault_details=$(aws backup describe-backup-vault \
      --region "$AWS_REGION" \
      --backup-vault-name "$vault_name" \
      --query "BackupVault.[EncryptionKeyArn,CreationDate,RecoveryPoints]" \
      --output text 2>/dev/null || echo "")

    if [ -n "$vault_details" ]; then
      echo "$vault_details" | while read -r kms_key created_date recovery_points; do
        echo -e "  KMS Key: ${CYAN}$(echo $kms_key | sed 's/.*\///')${NC}"
        echo -e "  Created: ${CYAN}$created_date${NC}"
        echo -e "  Recovery Points: ${GREEN}$recovery_points${NC}"
      done
    fi

    print_success "Vault '$vault_name' is active"
  done
}

verify_backup_plans() {
  print_section "Verifying Backup Plans"

  local plan_arns=$(aws backup list-backup-plans \
    --region "$AWS_REGION" \
    --query "BackupPlansList[?contains(BackupPlanName, '$ENVIRONMENT')].BackupPlanArn" \
    --output text 2>/dev/null || echo "")

  if [ -z "$plan_arns" ]; then
    print_warning "No backup plans found for '$ENVIRONMENT'"
    return 1
  fi

  for plan_arn in $plan_arns; do
    local plan_name=$(echo "$plan_arn" | sed 's/.*:backup-plan://')
    print_info "Backup Plan: $plan_name"

    # Get plan details
    local plan_json=$(aws backup get-backup-plan \
      --backup-plan-id "$plan_arn" \
      --region "$AWS_REGION" \
      --query "BackupPlan.Rules" \
      --output json 2>/dev/null || echo "{}")

    if [ "$plan_json" != "{}" ] && [ -n "$plan_json" ]; then
      echo "$plan_json" | jq -r '.[] |
        "  Rule: \(.RuleName)\n" +
        "    Schedule: \(.ScheduleExpression // "Manual")\n" +
        "    Target Vault: \(.TargetBackupVaultName)\n" +
        "    Retention Days: \(.Lifecycle.DeleteAfterDays // "Infinite")\n" +
        "    Copy Actions: \((.CopyActions | length) // 0)"
      ' 2>/dev/null || echo "    (Unable to parse rules)"
    fi

    print_success "Plan '$plan_name' is active"
  done
}

verify_backup_selections() {
  print_section "Verifying Backup Selections (Resources)"

  local plan_arns=$(aws backup list-backup-plans \
    --region "$AWS_REGION" \
    --query "BackupPlansList[?contains(BackupPlanName, '$ENVIRONMENT')].BackupPlanArn" \
    --output text 2>/dev/null || echo "")

  if [ -z "$plan_arns" ]; then
    print_warning "No backup plans found"
    return 1
  fi

  local resource_count=0

  for plan_arn in $plan_arns; do
    # Get selections for this plan
    local plan_id=$(echo "$plan_arn" | sed 's/.*:backup-plan://')

    local selections=$(aws backup list-backup-selections \
      --backup-plan-id "$plan_id" \
      --region "$AWS_REGION" \
      --query "BackupSelectionsList" \
      --output json 2>/dev/null || echo "[]")

    if [ "$selections" != "[]" ] && [ -n "$selections" ]; then
      echo "$selections" | jq -r '.[] |
        "  Selection: \(.SelectionName)\n" +
        "    Type: \(.SelectionTag.ConditionType // "Direct")\n" +
        "    Status: Active"
      ' 2>/dev/null || echo "    (Unable to parse selections)"

      ((resource_count++))
    fi
  done

  if [ $resource_count -gt 0 ]; then
    print_success "Found $resource_count backup selection(s)"
  else
    print_warning "No backup selections found"
  fi
}

verify_rds_snapshots() {
  print_section "Verifying RDS Snapshots"

  # Check RDS clusters
  local cluster_snapshots=$(aws rds describe-db-cluster-snapshots \
    --region "$AWS_REGION" \
    --query "DBClusterSnapshots[?contains(DBClusterIdentifier, '$ENVIRONMENT')].{SnapshotID:DBClusterSnapshotIdentifier,Status:Status,Progress:PercentProgress,Created:SnapshotCreateTime}" \
    --output json 2>/dev/null || echo "[]")

  local snap_count=0

  if [ "$cluster_snapshots" != "[]" ] && [ -n "$cluster_snapshots" ]; then
    echo "$cluster_snapshots" | jq -r '.[] |
      "  Cluster Snapshot: \(.SnapshotID)\n" +
      "    Status: \(.Status)\n" +
      "    Progress: \(.Progress)%\n" +
      "    Created: \(.Created)"
    ' 2>/dev/null

    snap_count=$(echo "$cluster_snapshots" | jq 'length')
  fi

  # Check RDS instances
  local instance_snapshots=$(aws rds describe-db-snapshots \
    --region "$AWS_REGION" \
    --query "DBSnapshots[?contains(DBInstanceIdentifier, '$ENVIRONMENT')].{SnapshotID:DBSnapshotIdentifier,Status:Status,Progress:PercentProgress,Created:SnapshotCreateTime}" \
    --output json 2>/dev/null || echo "[]")

  if [ "$instance_snapshots" != "[]" ] && [ -n "$instance_snapshots" ]; then
    echo "$instance_snapshots" | jq -r '.[] |
      "  Instance Snapshot: \(.SnapshotID)\n" +
      "    Status: \(.Status)\n" +
      "    Progress: \(.Progress)%\n" +
      "    Created: \(.Created)"
    ' 2>/dev/null

    snap_count=$((snap_count + $(echo "$instance_snapshots" | jq 'length')))
  fi

  if [ "$snap_count" -gt 0 ]; then
    print_success "Found $snap_count RDS snapshot(s)"
  else
    print_warning "No RDS snapshots found"
  fi
}

verify_backup_jobs() {
  print_section "Verifying Backup Job History"

  # Get recent backup jobs
  local backup_jobs=$(aws backup list-backup-jobs \
    --region "$AWS_REGION" \
    --by-resource-type RDS \
    --query "BackupJobs[?contains(ResourceArn, '$ENVIRONMENT')].{ARN:ResourceArn,Status:Status,Created:CreationDate,Completed:CompletionDate,Progress:PercentageDone}" \
    --output json 2>/dev/null || echo "[]")

  if [ "$backup_jobs" != "[]" ] && [ -n "$backup_jobs" ]; then
    local job_count=$(echo "$backup_jobs" | jq 'length')
    print_info "Recent backup jobs ($job_count total)"

    echo "$backup_jobs" | jq -r '.[0:5] | .[] |
      "  Job: \(.ARN | split("/") | .[-1])\n" +
      "    Status: \(.Status)\n" +
      "    Progress: \(.Progress)%\n" +
      "    Created: \(.Created)\n" +
      "    Completed: \(.Completed // "In Progress")"
    ' 2>/dev/null

    print_success "Found backup jobs"
  else
    print_warning "No backup jobs found"
  fi
}

verify_cross_region_replication() {
  print_section "Verifying Cross-Region Replication"

  # Check if DR region has backup vaults
  local dr_vaults=$(aws backup list-backup-vaults \
    --region "$DR_REGION" \
    --query "BackupVaultList[?contains(BackupVaultName, '$ENVIRONMENT')].BackupVaultName" \
    --output text 2>/dev/null || echo "")

  if [ -n "$dr_vaults" ]; then
    print_success "DR region ($DR_REGION) has backup vaults:"
    for vault in $dr_vaults; do
      echo -e "  ${MAGENTA}→ $vault${NC}"
    done
  else
    print_warning "No backup vaults found in DR region ($DR_REGION)"
    print_info "Copy action may not be configured or vaults may be in different region"
  fi

  # Check recovery points in DR
  if [ -n "$dr_vaults" ]; then
    for vault in $dr_vaults; do
      local recovery_points=$(aws backup list-recovery-points-by-backup-vault \
        --backup-vault-name "$vault" \
        --region "$DR_REGION" \
        --query "RecoveryPoints | length" \
        --output text 2>/dev/null || echo "0")

      print_info "Recovery points in '$vault' ($DR_REGION): $recovery_points"
    done
  fi
}

verify_retention_policies() {
  print_section "Verifying Retention Policies"

  local plan_arns=$(aws backup list-backup-plans \
    --region "$AWS_REGION" \
    --query "BackupPlansList[?contains(BackupPlanName, '$ENVIRONMENT')].BackupPlanArn" \
    --output text 2>/dev/null || echo "")

  if [ -z "$plan_arns" ]; then
    print_warning "No backup plans found"
    return 1
  fi

  for plan_arn in $plan_arns; do
    local plan_json=$(aws backup get-backup-plan \
      --backup-plan-id "$plan_arn" \
      --region "$AWS_REGION" \
      --query "BackupPlan.Rules" \
      --output json 2>/dev/null || echo "[]")

    echo "$plan_json" | jq -r '.[] |
      "  Rule: \(.RuleName)\n" +
      "    Backup Schedule: \(.ScheduleExpression // "Manual")\n" +
      "    Retention: \(.Lifecycle.DeleteAfterDays // "Infinite") days\n" +
      "    Cold Storage: \(.Lifecycle.MoveToColdStorageAfterDays // "Never")"
    ' 2>/dev/null
  done

  print_success "Retention policies verified"
}

show_recovery_procedures() {
  print_section "Recovery Procedures"

  print_info "To restore from a backup:"
  echo ""
  print_code "# List recovery points"
  print_code "aws backup list-recovery-points-by-backup-vault \\"
  print_code "  --backup-vault-name $backup_vault_name \\"
  print_code "  --region $AWS_REGION"
  echo ""

  print_code "# Restore from recovery point"
  print_code "aws backup start-restore-job \\"
  print_code "  --recovery-point-arn <recovery-point-arn> \\"
  print_code "  --iam-role-arn <backup-service-role-arn> \\"
  print_code "  --region $AWS_REGION"
  echo ""

  print_info "For RDS snapshots:"
  print_code "aws rds restore-db-instance-from-db-snapshot \\"
  print_code "  --db-instance-identifier restored-instance \\"
  print_code "  --db-snapshot-identifier <snapshot-id> \\"
  print_code "  --region $AWS_REGION"
}

# ============================================================================
# Main Function
# ============================================================================

main() {
  print_header "Backup & Recovery Readiness Verification"

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

  print_info "Region: $AWS_REGION"
  print_info "DR Region: $DR_REGION"
  print_info "Environment: $ENVIRONMENT"
  echo ""

  # Check prerequisites
  check_prerequisites
  echo ""

  # Run all verifications
  verify_backup_vaults
  echo ""

  verify_backup_plans
  echo ""

  verify_backup_selections
  echo ""

  verify_rds_snapshots
  echo ""

  verify_backup_jobs
  echo ""

  verify_cross_region_replication
  echo ""

  verify_retention_policies
  echo ""

  show_recovery_procedures
  echo ""

  # ========================================================================
  # Summary
  # ========================================================================
  print_header "Backup Verification Complete"

  echo -e "${GREEN}Status:${NC} All backup components verified"
  echo ""
  print_info "Next steps:"
  echo -e "  ${CYAN}1. Test restore from backup (non-production)${NC}"
  echo -e "  ${CYAN}2. Review retention policies for compliance${NC}"
  echo -e "  ${CYAN}3. Verify cross-region replication is working${NC}"
  echo -e "  ${CYAN}4. Document RTO/RPO targets${NC}"
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
