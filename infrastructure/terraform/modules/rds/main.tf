# RDS PostgreSQL Module — Main Configuration
# Fintech platform with strict monetary data handling (DECIMAL(19,4) for financial amounts)

# ──────────────────────────────────────────────────────────────────────
# Local values for this module
# ──────────────────────────────────────────────────────────────────────
locals {
  db_identifier = "${var.project_name}-postgres-${var.environment}"
  db_username   = "lonsadmin"

  # Common tags for all resources
  common_tags = merge(
    var.tags,
    {
      Module = "rds"
    }
  )
}

# ──────────────────────────────────────────────────────────────────────
# KMS Key for RDS Encryption
# ──────────────────────────────────────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS PostgreSQL encryption (${var.project_name} ${var.environment})"
  deletion_window_in_days = var.environment == "prod" ? 30 : 7
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.db_identifier}-key"
    }
  )
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.db_identifier}"
  target_key_id = aws_kms_key.rds.key_id
}

# ──────────────────────────────────────────────────────────────────────
# RDS Parameter Group
# ──────────────────────────────────────────────────────────────────────
# PostgreSQL parameters optimized for fintech platform:
# - log_statement = 'all' for comprehensive audit logging
# - log_min_duration_statement = 1000ms to log slow queries
# - pg_stat_statements for performance analysis
# - rds.force_ssl = 1 for encryption in transit
resource "aws_db_parameter_group" "main" {
  name_prefix = "${var.project_name}-postgres${replace(var.engine_version, ".", "-")}-"
  family      = "postgres${floor(tonumber(var.engine_version))}"
  description = "Parameter group for ${var.project_name} PostgreSQL ${var.engine_version} (${var.environment})"

  # Audit and security logging
  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Performance analysis
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  # Enforce SSL for all connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.db_identifier}-params"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# ──────────────────────────────────────────────────────────────────────
# RDS DB Instance
# ──────────────────────────────────────────────────────────────────────
# PostgreSQL with:
# - Encrypted storage (KMS) and encrypted backups
# - Performance Insights for monitoring
# - Enhanced Monitoring (1-minute granularity)
# - Automated minor version upgrades
# - Automatic failover backup snapshots
# - Multi-AZ for high availability (production)
resource "aws_db_instance" "main" {
  identifier     = local.db_identifier
  engine         = "postgres"
  engine_version = var.engine_version

  # Instance sizing and storage
  instance_class       = var.instance_class
  allocated_storage    = 20
  max_allocated_storage = 100  # Enable autoscaling

  # Database and authentication
  db_name  = var.database_name
  username = local.db_username
  password = random_password.db_password.result

  # Networking
  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  # Encryption
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  # Availability and backup
  multi_az                    = var.multi_az
  backup_retention_period     = var.backup_retention_days
  backup_window               = "03:00-04:00"  # UTC — low-traffic window
  maintenance_window          = "sun:04:00-sun:05:00"  # UTC
  copy_tags_to_snapshot       = true
  final_snapshot_identifier   = "${local.db_identifier}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  skip_final_snapshot         = var.environment == "dev"  # Dev can skip, others must snapshot
  delete_automated_backups    = var.environment == "dev"

  # Minor version management
  auto_minor_version_upgrade = true

  # Parameter group
  parameter_group_name = aws_db_parameter_group.main.name

  # Monitoring and logging
  enabled_cloudwatch_logs_exports = ["postgresql"]
  monitoring_interval             = 60  # Enhanced monitoring, 1-minute resolution
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_retention_period = var.environment == "prod" ? 31 : 7
  performance_insights_kms_key_id       = aws_kms_key.rds.arn

  # Deletion protection
  deletion_protection = var.deletion_protection

  tags = merge(
    local.common_tags,
    {
      Name = local.db_identifier
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.rds_monitoring_policy
  ]
}

# ──────────────────────────────────────────────────────────────────────
# RDS Database Credentials Management
# ──────────────────────────────────────────────────────────────────────
# Generate secure random password
resource "random_password" "db_password" {
  length  = 32
  special = true
  # Exclude characters that have special meaning in URLs or PostgreSQL
  override_special = "!&#$^<>-"
}

# Store credentials in AWS Secrets Manager
# Format: JSON with username and password for easy rotation
resource "aws_secretsmanager_secret" "db_credentials" {
  name_prefix = "${var.project_name}-postgres-${var.environment}-"
  description = "PostgreSQL database credentials for ${var.project_name} ${var.environment}"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.db_identifier}-credentials"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = local.db_username
    password = random_password.db_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = 5432
    dbname   = var.database_name
  })
}

# ──────────────────────────────────────────────────────────────────────
# Enhanced Monitoring IAM Role
# ──────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "rds_monitoring" {
  name_prefix = "${var.project_name}-rds-monitoring-${var.environment}-"
  description = "IAM role for RDS Enhanced Monitoring (${var.project_name} ${var.environment})"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring_policy" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Log Group for PostgreSQL Logs
# ──────────────────────────────────────────────────────────────────────
# Retain logs for audit and compliance
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${local.db_identifier}/postgresql"
  retention_in_days = var.environment == "prod" ? 90 : 30

  tags = merge(
    local.common_tags,
    {
      Name = "${local.db_identifier}-logs"
    }
  )
}

# ──────────────────────────────────────────────────────────────────────
# NOTE: The initial database is created via the `db_name` parameter on
# aws_db_instance.main (see above). No separate resource is needed.
#
# IMPORTANT: The database must support DECIMAL(19,4) for all monetary amounts.
# PostgreSQL's NUMERIC type supports arbitrary precision and is compatible
# with Prisma's Decimal type for fintech calculations.
