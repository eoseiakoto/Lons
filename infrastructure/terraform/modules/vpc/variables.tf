# VPC Module Variables

variable "project_name" {
  description = "Project name, used for naming resources"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must be lowercase alphanumeric with hyphens only."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, preprod, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "preprod", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, preprod, prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB) - must provide 3 for multi-AZ"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  validation {
    condition     = length(var.public_subnet_cidrs) == 3
    error_message = "Must provide exactly 3 public subnet CIDR blocks for multi-AZ deployment."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (EKS nodes) - must provide 3 for multi-AZ"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
  validation {
    condition     = length(var.private_subnet_cidrs) == 3
    error_message = "Must provide exactly 3 private subnet CIDR blocks for multi-AZ deployment."
  }
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets (RDS/ElastiCache) - must provide 3 for multi-AZ"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
  validation {
    condition     = length(var.database_subnet_cidrs) == 3
    error_message = "Must provide exactly 3 database subnet CIDR blocks for multi-AZ deployment."
  }
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway for cost savings (set to false for high availability)"
  type        = bool
  default     = true
  # Recommended: true for dev/staging, false for preprod/production
}

variable "cluster_name" {
  description = "EKS cluster name for subnet tagging (required for EKS node discovery)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.cluster_name))
    error_message = "Cluster name must be lowercase alphanumeric with hyphens only."
  }
}

variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs for network traffic analysis"
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "CloudWatch Logs retention period for VPC Flow Logs (in days)"
  type        = number
  default     = 30
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "Flow logs retention must be a valid CloudWatch Logs retention value."
  }
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Terraform = "true"
    Project   = "lons"
  }
}
