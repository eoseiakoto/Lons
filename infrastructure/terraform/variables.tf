variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "lons"
}

variable "environment" {
  description = "Environment name (dev, staging, preprod, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "preprod", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, preprod, prod."
  }
}

variable "region" {
  description = "AWS primary region (eu-west-1 Ireland — confirmed for Ghana latency, cost, and service availability)"
  type        = string
  default     = "eu-west-1"
}

variable "dr_region" {
  description = "AWS DR region for cross-region backups (eu-west-2 London)"
  type        = string
  default     = "eu-west-2"
}

variable "availability_zones" {
  description = "Availability zones for multi-AZ deployment"
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnet egress"
  type        = bool
  default     = true
}

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "eks_node_capacity_type" {
  description = "EKS node capacity type (on-demand or spot)"
  type        = string
  default     = "on-demand"
  validation {
    condition     = contains(["on-demand", "spot"], var.eks_node_capacity_type)
    error_message = "Capacity type must be either on-demand or spot."
  }
}

variable "eks_desired_nodes" {
  description = "Desired number of EKS nodes"
  type        = number
  default     = 3
}

variable "eks_min_nodes" {
  description = "Minimum number of EKS nodes"
  type        = number
  default     = 2
}

variable "eks_max_nodes" {
  description = "Maximum number of EKS nodes"
  type        = number
  default     = 10
}

variable "rds_database_name" {
  description = "Initial database name"
  type        = string
  default     = "lons"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.1"
}

variable "rds_instance_class" {
  description = "RDS instance class (e.g., db.t4g.medium, db.r6g.xlarge)"
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain RDS backups"
  type        = number
  default     = 30
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type (e.g., cache.t4g.micro, cache.r6g.xlarge)"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in Redis cluster"
  type        = number
  default     = 2
}

variable "redis_automatic_failover_enabled" {
  description = "Enable automatic failover for Redis"
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Primary domain name (e.g., lons.io)"
  type        = string
  default     = "lons.io"
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for TLS on ALB (optional — leave empty for auto-creation)"
  type        = string
  default     = ""
}

variable "cloudfront_certificate_arn" {
  description = "DEPRECATED: CloudFront ACM certificate is now auto-provisioned in us-east-1. This variable is no longer used and will be removed in a future version."
  type        = string
  default     = ""

  # Warn users if they're still trying to pass this variable
  validation {
    condition     = var.cloudfront_certificate_arn == ""
    error_message = "The cloudfront_certificate_arn variable is deprecated. CloudFront ACM certificates are now automatically provisioned in us-east-1 by cloudfront-cert.tf. Please remove this variable from your terraform.tfvars."
  }
}

variable "enable_alb_waf" {
  description = "Enable WAF on ALB"
  type        = bool
  default     = true
}

variable "grafana_enabled" {
  description = "Whether to create DNS record for Grafana dashboard"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alarms"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
