variable "project_name" {
  description = "Name of the project (e.g., 'lons')"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "node_type" {
  description = "ElastiCache node type (e.g., 'cache.t3.micro', 'cache.r7g.large')"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes in the replication group"
  type        = number
  default     = 2
  validation {
    condition     = var.num_cache_nodes >= 1
    error_message = "num_cache_nodes must be at least 1"
  }
}

variable "automatic_failover" {
  description = "Enable automatic failover for the replication group"
  type        = bool
  default     = true
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "vpc_id" {
  description = "VPC ID where ElastiCache will be deployed"
  type        = string
}

variable "subnet_group_name" {
  description = "Name of the ElastiCache subnet group"
  type        = string
}

variable "redis_security_group_id" {
  description = "Security group ID for Redis access control"
  type        = string
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}
