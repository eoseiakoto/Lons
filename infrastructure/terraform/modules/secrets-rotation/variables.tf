variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, preprod, production)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "rds_instance_id" {
  description = "RDS instance ID for database credential rotation"
  type        = string
}

variable "rds_security_group_id" {
  description = "Security group ID of RDS instance"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where Lambda functions will run"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for Lambda deployment"
  type        = list(string)
}

variable "db_master_username" {
  description = "Master username for RDS database"
  type        = string
  sensitive   = true
}

variable "db_secret_arn" {
  description = "ARN of Secrets Manager secret containing database credentials"
  type        = string
}

variable "rotation_rules" {
  description = "Rotation rules for different secret types"
  type = object({
    database_rotation_days = number  # Database password rotation frequency (days)
    jwt_rotation_days      = number  # JWT keys rotation frequency (days)
    encryption_rotation_days = number # Encryption keys rotation frequency (days)
    automatically_after_days = number  # Auto rotate after N days
  })
  default = {
    database_rotation_days   = 30
    jwt_rotation_days        = 90
    encryption_rotation_days = 180
    automatically_after_days = 30
  }
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention period for rotation Lambda"
  type        = number
  default     = 14
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
}
