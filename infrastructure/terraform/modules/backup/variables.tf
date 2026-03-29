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

variable "rds_arn" {
  description = "ARN of the RDS instance to backup"
  type        = string
}

variable "redis_arn" {
  description = "ARN of the ElastiCache replication group to backup"
  type        = string
  default     = ""
}

variable "dr_region" {
  description = "DR region for cross-region backup copies"
  type        = string
  default     = "eu-west-2"
}

variable "daily_retention_days" {
  description = "Number of days to retain daily backups"
  type        = number
  default     = 30
  validation {
    condition     = var.daily_retention_days >= 1 && var.daily_retention_days <= 3650
    error_message = "Daily retention must be between 1 and 3650 days."
  }
}

variable "monthly_retention_days" {
  description = "Number of days to retain monthly backups"
  type        = number
  default     = 365
  validation {
    condition     = var.monthly_retention_days >= 30 && var.monthly_retention_days <= 3650
    error_message = "Monthly retention must be between 30 and 3650 days."
  }
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
