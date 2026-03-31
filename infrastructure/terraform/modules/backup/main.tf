terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ──────────────────────────────────────────────────────────────────────
# Local values for this module
# ──────────────────────────────────────────────────────────────────────
locals {
  backup_vault_name = "${var.project_name}-backup-${var.environment}"

  # Common tags for all resources
  common_tags = merge(
    var.tags,
    {
      Module = "backup"
    }
  )
}

# ──────────────────────────────────────────────────────────────────────
# KMS Key for Backup Vault Encryption
# ──────────────────────────────────────────────────────────────────────
resource "aws_kms_key" "backup" {
  description             = "KMS key for AWS Backup vault encryption (${var.project_name} ${var.environment})"
  deletion_window_in_days = var.environment == "prod" ? 30 : 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM policies"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow AWS Backup service"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name = "${local.backup_vault_name}-key"
    }
  )
}

resource "aws_kms_alias" "backup" {
  name          = "alias/${local.backup_vault_name}"
  target_key_id = aws_kms_key.backup.key_id
}

# ──────────────────────────────────────────────────────────────────────
# AWS Backup Vault
# ──────────────────────────────────────────────────────────────────────
resource "aws_backup_vault" "main" {
  name            = local.backup_vault_name
  kms_key_arn     = aws_kms_key.backup.arn
  tags            = local.common_tags
  force_destroy   = var.environment != "prod"  # Allow destroy in non-prod

  depends_on = [
    aws_kms_key.backup
  ]
}

# ──────────────────────────────────────────────────────────────────────
# IAM Role for AWS Backup Service
# ──────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "backup_service" {
  name_prefix = "${var.project_name}-backup-service-${var.environment}-"
  description = "IAM role for AWS Backup service (${var.project_name} ${var.environment})"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach AWS managed policy for backup service
resource "aws_iam_role_policy_attachment" "backup_service_policy" {
  role       = aws_iam_role.backup_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

# Attach restoration policy
resource "aws_iam_role_policy_attachment" "backup_restore_policy" {
  role       = aws_iam_role.backup_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Custom policy for cross-region snapshot copies
resource "aws_iam_role_policy" "backup_cross_region_copy" {
  name_prefix = "${var.project_name}-backup-cross-region-"
  role        = aws_iam_role.backup_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:CreateGrant",
          "kms:DescribeKey",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.backup.arn
      },
      {
        Effect = "Allow"
        Action = [
          "rds:CopyDBSnapshot",
          "rds:CopyDBClusterSnapshot",
          "rds:DescribeDBSnapshots",
          "rds:DescribeDBClusterSnapshots"
        ]
        Resource = "*"
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# AWS Backup Plan
# ──────────────────────────────────────────────────────────────────────
resource "aws_backup_plan" "main" {
  name = "${var.project_name}-${var.environment}-backup-plan"

  rule {
    rule_name         = "daily_snapshot"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 ? * * *)"  # 2 AM UTC daily
    start_window      = 60
    completion_window = 120

    # Copy daily snapshots to DR region for cross-region redundancy
    copy_action {
      destination_vault_arn = "arn:aws:backup:${var.dr_region}:${data.aws_caller_identity.current.account_id}:backup-vault:${local.backup_vault_name}"

      lifecycle {
        cold_storage_after = 0  # Do not transition to cold storage
        delete_after       = var.daily_retention_days
      }
    }

    lifecycle {
      delete_after = var.daily_retention_days
    }

    recovery_point_tags = merge(
      local.common_tags,
      {
        BackupType = "daily"
      }
    )
  }

  rule {
    rule_name         = "monthly_snapshot"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 3 1 * ? *)"  # 3 AM UTC on the 1st of each month
    start_window      = 60
    completion_window = 120

    # Copy monthly snapshots to DR region
    copy_action {
      destination_vault_arn = "arn:aws:backup:${var.dr_region}:${data.aws_caller_identity.current.account_id}:backup-vault:${local.backup_vault_name}"

      lifecycle {
        cold_storage_after = 0  # Do not transition to cold storage
        delete_after       = var.monthly_retention_days
      }
    }

    lifecycle {
      delete_after = var.monthly_retention_days
    }

    recovery_point_tags = merge(
      local.common_tags,
      {
        BackupType = "monthly"
      }
    )
  }

  tags = local.common_tags

  depends_on = [
    aws_backup_vault.main,
    aws_iam_role_policy_attachment.backup_service_policy
  ]
}

# ──────────────────────────────────────────────────────────────────────
# AWS Backup Selection (RDS Only)
# ──────────────────────────────────────────────────────────────────────
resource "aws_backup_selection" "rds" {
  name           = "${var.project_name}-${var.environment}-rds-selection"
  plan_id        = aws_backup_plan.main.id
  iam_role_arn   = aws_iam_role.backup_service.arn

  resources = [
    var.rds_arn
  ]
}

# ──────────────────────────────────────────────────────────────────────
# AWS Backup Selection (ElastiCache Redis)
# ──────────────────────────────────────────────────────────────────────
resource "aws_backup_selection" "redis" {
  count          = var.redis_arn != "" ? 1 : 0
  name           = "${var.project_name}-${var.environment}-redis-selection"
  plan_id        = aws_backup_plan.main.id
  iam_role_arn   = aws_iam_role.backup_service.arn

  resources = [
    var.redis_arn
  ]
}

# ──────────────────────────────────────────────────────────────────────
# SNS Topic for Backup Notifications
# ──────────────────────────────────────────────────────────────────────
resource "aws_sns_topic" "backup_notifications" {
  name              = "${var.project_name}-${var.environment}-backup-notifications"
  kms_master_key_id = aws_kms_key.backup.id
  tags              = local.common_tags
}

resource "aws_sns_topic_policy" "backup_notifications" {
  arn = aws_sns_topic.backup_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.backup_notifications.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# EventBridge Rule for Backup State Changes
# ──────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "backup_job_state_change" {
  name_prefix = "${var.project_name}-backup-job-state-"
  description = "Capture AWS Backup job state changes"

  event_pattern = jsonencode({
    source      = ["aws.backup"]
    detail-type = ["Backup Job State Change", "Copy Job State Change"]
    detail = {
      state = ["COMPLETED", "FAILED", "ABORTED"]
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "backup_job_state_change" {
  rule      = aws_cloudwatch_event_rule.backup_job_state_change.name
  target_id = "BackupNotificationTopic"
  arn       = aws_sns_topic.backup_notifications.arn

  input_transformer {
    input_paths = {
      detail     = "$.detail"
      account    = "$.account"
      region     = "$.region"
      time       = "$.time"
    }
    input_template = jsonencode({
      region                = "<region>"
      account               = "<account>"
      time                  = "<time>"
      jobId                 = "$.jobId"
      state                 = "$.state"
      backupVaultName       = "$.backupVaultName"
      resourceType          = "$.resourceType"
      recoveryPointArn      = "$.recoveryPointArn"
      statusMessage         = "$.statusMessage"
      percentageComplete    = "$.percentageComplete"
    })
  }
}

resource "aws_cloudwatch_event_target" "backup_job_state_change_sns" {
  rule      = aws_cloudwatch_event_rule.backup_job_state_change.name
  target_id = "BackupNotificationSNS"
  arn       = aws_sns_topic.backup_notifications.arn
}

# Allow EventBridge to publish to SNS
resource "aws_sns_topic_policy" "eventbridge_publish" {
  arn = aws_sns_topic.backup_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.backup_notifications.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.backup_job_state_change.arn
          }
        }
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# Data source for AWS account ID
# ──────────────────────────────────────────────────────────────────────
data "aws_caller_identity" "current" {}
