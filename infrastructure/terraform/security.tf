# ──────────────────────────────────────────────────────────────────────────────
# AWS Security Infrastructure
# ──────────────────────────────────────────────────────────────────────────────
# Compliance monitoring, threat detection, and service quotas management.

# ──────────────────────────────────────────────────────────────────────────────
# AWS Config — Compliance Monitoring
# ──────────────────────────────────────────────────────────────────────────────

# S3 bucket for Config logs and snapshots
resource "aws_s3_bucket" "config_logs" {
  bucket = "lons-aws-config-${data.aws_caller_identity.current.account_id}-${var.region}"
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "config_logs" {
  bucket = aws_s3_bucket.config_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config_logs" {
  bucket = aws_s3_bucket.config_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "config_logs" {
  bucket = aws_s3_bucket.config_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy to allow AWS Config to write logs
resource "aws_s3_bucket_policy" "config_logs" {
  bucket = aws_s3_bucket.config_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSConfigBucketPermissionsCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:GetBucketVersioning"
        Resource = aws_s3_bucket.config_logs.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketExistenceCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.config_logs.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketPutObject"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.config_logs.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# IAM role for AWS Config service
resource "aws_iam_role" "config_role" {
  name_prefix = "lons-aws-config-"
  tags        = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Attach the AWS managed policy for Config
resource "aws_iam_role_policy_attachment" "config_policy" {
  role       = aws_iam_role.config_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/ConfigRole"
}

# Additional policy for S3 bucket access
resource "aws_iam_role_policy" "config_s3_policy" {
  name_prefix = "lons-aws-config-s3-"
  role        = aws_iam_role.config_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetBucketVersioning"
        ]
        Resource = [
          aws_s3_bucket.config_logs.arn,
          "${aws_s3_bucket.config_logs.arn}/*"
        ]
      }
    ]
  })
}

# AWS Config Recorder
resource "aws_config_configuration_recorder" "main" {
  name              = "${local.namespace}-config-recorder"
  role_arn          = aws_iam_role.config_role.arn
  recording_group_id = "default"
  tags              = local.common_tags

  depends_on = [aws_iam_role_policy_attachment.config_policy]

  recording_mode {
    recording_frequency = "CONTINUOUS"

    recording_scope {
      compliance_resource_types = []
    }
  }
}

resource "aws_config_configuration_recorder_status" "main" {
  name              = aws_config_configuration_recorder.main.name
  is_enabled        = true
  depends_on        = [aws_s3_bucket_policy.config_logs]
  start_recording   = true
  depends_on        = [aws_iam_role_policy.config_s3_policy]
}

# AWS Config Delivery Channel
resource "aws_config_delivery_channel" "main" {
  name                           = "${local.namespace}-config-delivery"
  s3_bucket_name                 = aws_s3_bucket.config_logs.id
  depends_on                     = [aws_config_configuration_recorder_status.main]
  include_global_resources       = var.environment == "prod"
  include_global_resources_region = var.region
  sns_topic_arn                  = aws_sns_topic.config_notifications.arn

  recording_mode {
    recording_frequency = "CONTINUOUS"
  }
}

# SNS topic for Config notifications
resource "aws_sns_topic" "config_notifications" {
  name_prefix = "lons-aws-config-"
  tags        = local.common_tags
}

resource "aws_sns_topic_policy" "config_notifications" {
  arn = aws_sns_topic.config_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action = "SNS:Publish"
        Resource = aws_sns_topic.config_notifications.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# AWS Config Rules — Compliance Checks
# ──────────────────────────────────────────────────────────────────────────────

# Rule: Encrypted EBS volumes
resource "aws_config_config_rule" "encrypted_volumes" {
  name            = "${local.namespace}-encrypted-volumes"
  depends_on      = [aws_config_configuration_recorder_status.main]
  description     = "Checks whether EBS volumes are encrypted"
  source_identifier = "ENCRYPTED_VOLUMES"
  tags            = local.common_tags
}

# Rule: RDS storage encryption enabled
resource "aws_config_config_rule" "rds_storage_encrypted" {
  name            = "${local.namespace}-rds-storage-encrypted"
  depends_on      = [aws_config_configuration_recorder_status.main]
  description     = "Checks whether RDS instances have encryption at rest enabled"
  source_identifier = "RDS_STORAGE_ENCRYPTED"
  tags            = local.common_tags
}

# Rule: S3 bucket server-side encryption enabled
resource "aws_config_config_rule" "s3_bucket_server_side_encryption" {
  name            = "${local.namespace}-s3-bucket-server-side-encryption"
  depends_on      = [aws_config_configuration_recorder_status.main]
  description     = "Checks that S3 bucket policies explicitly deny put-object requests without server-side encryption"
  source_identifier = "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
  tags            = local.common_tags
}

# Rule: Required tags on resources
resource "aws_config_config_rule" "required_tags" {
  name            = "${local.namespace}-required-tags"
  depends_on      = [aws_config_configuration_recorder_status.main]
  description     = "Checks whether resources contain all required tags"
  source_identifier = "REQUIRED_TAGS"
  tags            = local.common_tags

  input_parameters = jsonencode({
    tag1Key = "Project"
    tag2Key = "Environment"
    tag3Key = "ManagedBy"
  })
}

# ──────────────────────────────────────────────────────────────────────────────
# AWS GuardDuty — Threat Detection
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_guardduty_detector" "main" {
  enable = true
  tags   = local.common_tags

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes = var.environment == "prod" ? true : false
      }
    }
  }
}

# GuardDuty publishing destination (S3 for findings)
resource "aws_s3_bucket" "guardduty_findings" {
  bucket = "lons-guardduty-findings-${data.aws_caller_identity.current.account_id}-${var.region}"
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "guardduty_findings" {
  bucket = aws_s3_bucket.guardduty_findings.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "guardduty_findings" {
  bucket = aws_s3_bucket.guardduty_findings.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "guardduty_findings" {
  bucket = aws_s3_bucket.guardduty_findings.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "guardduty_findings" {
  bucket = aws_s3_bucket.guardduty_findings.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GuardDutyBucketPermissionsCheck"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action   = "s3:GetBucketLocation"
        Resource = aws_s3_bucket.guardduty_findings.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "GuardDutyBucketPutObject"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.guardduty_findings.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_guardduty_publishing_destination" "s3" {
  detector_id             = aws_guardduty_detector.main.id
  destination_arn         = aws_s3_bucket.guardduty_findings.arn
  kms_key_arn             = aws_kms_key.guardduty.arn
  destination_type        = "S3"
  depends_on              = [aws_s3_bucket_policy.guardduty_findings]
}

# KMS key for GuardDuty findings encryption
resource "aws_kms_key" "guardduty" {
  description             = "KMS key for GuardDuty findings encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  tags                    = local.common_tags

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow GuardDuty to use the key"
        Effect = "Allow"
        Principal = {
          Service = "guardduty.amazonaws.com"
        }
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "guardduty" {
  name          = "alias/lons-guardduty-${var.environment}"
  target_key_id = aws_kms_key.guardduty.key_id
}

# ──────────────────────────────────────────────────────────────────────────────
# Service Quotas — Documentation and Review Notes
# ──────────────────────────────────────────────────────────────────────────────
#
# The following AWS service quotas should be reviewed and potentially increased
# depending on the scale of the Lōns platform:
#
# 1. **EKS Clusters per Region**
#    - Default: 100 clusters
#    - Current plan: 1 cluster per environment (4 total across dev, staging, preprod, prod)
#    - Status: Within default limits
#    - Action: Monitor if expanding to additional regions
#
# 2. **VPCs per Region**
#    - Default: 5 VPCs per region
#    - Current plan: 1 VPC per environment (assuming all in eu-west-1)
#    - Status: If consolidating all envs to single region, within limits
#    - Action: If deploying DR region separately, may need increase in eu-west-2
#    - Request via: AWS Console → Service Quotas → VPC → "VPCs per Region"
#
# 3. **Elastic IPs per Region**
#    - Default: 5 Elastic IPs per region
#    - Current usage: 1 NAT Gateway per AZ (3 IPs for prod, 1 for dev/staging)
#    - Status: Within default limits for single region
#    - Action: Request increase if planning multi-region active-active setup
#    - Request via: AWS Console → Service Quotas → EC2 → "Elastic IPs"
#
# 4. **RDS Instances per Region**
#    - Default: 40 RDS instances per region
#    - Current plan: 1 RDS instance per environment (4 total)
#    - Status: Within default limits
#    - Action: No action needed for current architecture
#
# 5. **ElastiCache Nodes per Region**
#    - Default: 300 cache nodes per region
#    - Current plan: 3 nodes for prod, 2 for staging, 1 for dev/preprod (6 total)
#    - Status: Within default limits
#    - Action: No action needed for current architecture
#
# 6. **ALB Target Groups per Region**
#    - Default: 1000 target groups per region
#    - Current plan: 1 ALB per environment (4 total)
#    - Status: Within default limits
#    - Action: No action needed
#
# Quota Increase Process:
# 1. AWS Console → Service Quotas
# 2. Search for the service (e.g., "VPC", "EC2")
# 3. Click on the quota name
# 4. Click "Request quota increase"
# 5. Enter desired count and submit
# 6. AWS will approve most increases within 1-2 hours
#
# Note: Some quotas (e.g., on-demand instance counts) may require additional
# vetting and can take 24-48 hours. Plan accordingly before production launches.
