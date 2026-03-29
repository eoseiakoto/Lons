variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where ALB will be deployed"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for ALB deployment"
  type        = list(string)
}

variable "enable_waf" {
  description = "Enable AWS WAF on ALB"
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "ARN of ACM certificate for HTTPS listener"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name for routing rules and logging"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for DNS records"
  type        = string
  default     = ""
}

variable "enable_tenant_ip_restriction" {
  description = "Enable WAF rule for tenant IP allowlisting on tenant-specific endpoints"
  type        = bool
  default     = false
}

variable "tenant_allowed_ips" {
  description = "List of CIDR blocks allowed to access tenant-specific API endpoints (e.g., [\"203.0.113.0/24\", \"198.51.100.0/24\"])"
  type        = list(string)
  default     = null
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
}
