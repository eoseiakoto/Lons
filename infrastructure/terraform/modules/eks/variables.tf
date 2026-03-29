# EKS Module Variables

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

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.cluster_name))
    error_message = "Cluster name must be lowercase alphanumeric with hyphens only."
  }
}

variable "cluster_version" {
  description = "Kubernetes version for EKS cluster (e.g., 1.28, 1.29)"
  type        = string
  default     = "1.28"
  validation {
    condition     = can(regex("^1\\.[0-9]{2}$", var.cluster_version))
    error_message = "Cluster version must be in format 1.XX (e.g., 1.28, 1.29)."
  }
}

variable "vpc_id" {
  description = "VPC ID where the EKS cluster will be deployed"
  type        = string
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC ID (starts with vpc-)."
  }
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for EKS nodes (must be in at least 2 AZs)"
  type        = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Must provide at least 2 private subnet IDs (one per AZ)."
  }
}

variable "capacity_type" {
  description = "EKS node capacity type (on-demand or spot)"
  type        = string
  default     = "on-demand"
  validation {
    condition     = contains(["on-demand", "spot"], var.capacity_type)
    error_message = "Capacity type must be either on-demand or spot."
  }
}

variable "instance_types" {
  description = "List of EC2 instance types for the EKS node group (defaults to t3.medium for dev/staging, m6i.large for preprod/prod)"
  type        = list(string)
  default     = ["t3.medium"]
  validation {
    condition     = length(var.instance_types) >= 1
    error_message = "Must provide at least one instance type."
  }
}

variable "desired_nodes" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
  validation {
    condition     = var.desired_nodes >= 1 && var.desired_nodes <= 1000
    error_message = "Desired nodes must be between 1 and 1000."
  }
}

variable "min_nodes" {
  description = "Minimum number of worker nodes (for autoscaling)"
  type        = number
  default     = 1
  validation {
    condition     = var.min_nodes >= 1 && var.min_nodes <= 1000
    error_message = "Min nodes must be between 1 and 1000."
  }
}

variable "max_nodes" {
  description = "Maximum number of worker nodes (for autoscaling)"
  type        = number
  default     = 3
  validation {
    condition     = var.max_nodes >= 1 && var.max_nodes <= 1000
    error_message = "Max nodes must be between 1 and 1000."
  }
}

variable "kms_key_id" {
  description = "KMS key ID for EKS cluster encryption (if not provided, AWS managed key will be used)"
  type        = string
  default     = ""
}

variable "enable_logging" {
  description = "Enable CloudWatch logging for EKS cluster (api, audit, authenticator, controllerManager, scheduler)"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days for EKS logs"
  type        = number
  default     = 30
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention must be a valid CloudWatch Logs retention value."
  }
}

variable "endpoint_private_access" {
  description = "Enable private API server endpoint (required for EKS)"
  type        = bool
  default     = true
}

variable "endpoint_public_access" {
  description = "Enable public API server endpoint"
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "List of CIDR blocks that can access the public API server endpoint (default allows all: 0.0.0.0/0)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
