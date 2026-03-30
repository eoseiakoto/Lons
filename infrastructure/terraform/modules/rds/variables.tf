# RDS PostgreSQL Module Variables

variable "project_name" {
  description = "Project name (used for resource naming)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, preprod, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "preprod", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, preprod, prod."
  }
}

variable "database_name" {
  description = "Initial PostgreSQL database name"
  type        = string
  validation {
    condition     = length(var.database_name) <= 63 && can(regex("^[a-z_][a-z0-9_]*$", var.database_name))
    error_message = "Database name must be <= 63 characters, start with letter/underscore, contain only lowercase letters, digits, underscore."
  }
}

variable "engine_version" {
  description = "PostgreSQL engine version (e.g., 16.1)"
  type        = string
  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+(\\.[0-9]+)?$", var.engine_version))
    error_message = "Engine version must follow semantic versioning (e.g., 16.1 or 16.1.0)."
  }
}

variable "instance_class" {
  description = "RDS instance class (e.g., db.t4g.micro, db.r6g.xlarge)"
  type        = string
  validation {
    condition     = can(regex("^db\\.[a-z][0-9][a-z]?\\.[a-z]+$", var.instance_class))
    error_message = "Instance class must follow AWS naming (e.g., db.t4g.micro)."
  }
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups (0-35)"
  type        = number
  validation {
    condition     = var.backup_retention_days >= 0 && var.backup_retention_days <= 35
    error_message = "Backup retention must be between 0 and 35 days."
  }
}

variable "vpc_id" {
  description = "VPC ID where RDS will be deployed"
  type        = string
}

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group (from VPC module)"
  type        = string
}

variable "rds_security_group_id" {
  description = "Security group ID for RDS (from VPC module)"
  type        = string
}

variable "deletion_protection" {
  description = "Enable deletion protection for production RDS instances"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
