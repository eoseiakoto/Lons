# Data source for current AWS account and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# KMS Key for S3 and ECR encryption
resource "aws_kms_key" "lons_encryption" {
  description             = "KMS key for ${var.project_name} S3 and ECR encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "lons_encryption" {
  name          = "alias/${var.project_name}-${var.environment}"
  target_key_id = aws_kms_key.lons_encryption.key_id
}

# ============================================================================
# S3 BUCKETS
# ============================================================================

# Documents bucket for loan documents and KYC files
resource "aws_s3_bucket" "documents" {
  bucket = "${var.project_name}-documents-${var.environment}"
  tags   = var.tags
}

# Enable versioning for documents bucket
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for documents bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.lons_encryption.arn
    }
    bucket_key_enabled = true
  }
}

# Block all public access for documents bucket
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules for documents bucket
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 365
      storage_class   = "GLACIER"
    }
  }
}

# Replication role for cross-region replication
resource "aws_iam_role" "s3_replication_role" {
  name = "${var.project_name}-s3-replication-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

# Replication policy
resource "aws_iam_role_policy" "s3_replication_policy" {
  name = "${var.project_name}-s3-replication-policy-${var.environment}"
  role = aws_iam_role.s3_replication_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.documents.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl"
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete"
        ]
        Resource = "${aws_s3_bucket.documents_dr.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.lons_encryption.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.lons_encryption_dr.arn
      }
    ]
  })
}

# DR KMS Key in disaster recovery region
resource "aws_kms_key" "lons_encryption_dr" {
  provider                = aws.dr
  description             = "KMS key for ${var.project_name} S3 and ECR encryption (DR region)"
  deletion_window_in_days = 10
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "lons_encryption_dr" {
  provider      = aws.dr
  name          = "alias/${var.project_name}-${var.environment}-dr"
  target_key_id = aws_kms_key.lons_encryption_dr.key_id
}

# DR Documents bucket
resource "aws_s3_bucket" "documents_dr" {
  provider = aws.dr
  bucket   = "${var.project_name}-documents-${var.environment}-dr"
  tags     = var.tags
}

# Enable versioning for DR documents bucket
resource "aws_s3_bucket_versioning" "documents_dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.documents_dr.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for DR documents bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "documents_dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.documents_dr.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.lons_encryption_dr.arn
    }
    bucket_key_enabled = true
  }
}

# Block all public access for DR documents bucket
resource "aws_s3_bucket_public_access_block" "documents_dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.documents_dr.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cross-region replication configuration
resource "aws_s3_bucket_replication_configuration" "documents" {
  depends_on = [
    aws_s3_bucket_versioning.documents,
    aws_s3_bucket_versioning.documents_dr
  ]

  bucket = aws_s3_bucket.documents.id
  role   = aws_iam_role.s3_replication_role.arn

  rule {
    id     = "replicate-documents"
    status = "Enabled"

    destination {
      bucket       = aws_s3_bucket.documents_dr.arn
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = aws_kms_key.lons_encryption_dr.arn
      }

      replication_time {
        status = "Enabled"
        time {
          minutes = 15
        }
      }

      metrics {
        status = "Enabled"
        event_threshold {
          minutes = 15
        }
      }
    }

    filter {
      prefix = ""
    }
  }
}

# Exports bucket for reports and reconciliation files
resource "aws_s3_bucket" "exports" {
  bucket = "${var.project_name}-exports-${var.environment}"
  tags   = var.tags
}

# Enable versioning for exports bucket
resource "aws_s3_bucket_versioning" "exports" {
  bucket = aws_s3_bucket.exports.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption for exports bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.lons_encryption.arn
    }
    bucket_key_enabled = true
  }
}

# Block all public access for exports bucket
resource "aws_s3_bucket_public_access_block" "exports" {
  bucket = aws_s3_bucket.exports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rule for exports bucket: expire after 90 days
resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id

  rule {
    id     = "expire-exports"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    expiration {
      days = 90
    }
  }
}

# ============================================================================
# ECR REPOSITORIES
# ============================================================================

# Map of ECR repositories to create
locals {
  ecr_repositories = {
    "graphql-server"     = "GraphQL API Server"
    "rest-server"        = "REST API Server"
    "scheduler"          = "Scheduler Service"
    "notification-worker" = "Notification Worker"
    "admin-portal"       = "Admin Portal"
    "scoring-service"    = "Scoring Service"
  }
}

# Create ECR repositories
resource "aws_ecr_repository" "services" {
  for_each = local.ecr_repositories

  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.lons_encryption.arn
  }

  tags = merge(
    var.tags,
    {
      Service = each.value
    }
  )
}

# Lifecycle policies for ECR repositories
resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
