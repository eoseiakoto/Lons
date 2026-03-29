variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "environment" {
  description = "The deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be 'dev', 'staging', or 'prod'."
  }
}

variable "domain_name" {
  description = "The root domain name (e.g., lons.io)"
  type        = string
  default     = "lons.io"
}

variable "subdomain" {
  description = "The environment-specific subdomain (e.g., dev.lons.io, lons.io for prod)"
  type        = string
}

variable "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer"
  type        = string
}

variable "alb_zone_id" {
  description = "The Route53 hosted zone ID of the ALB"
  type        = string
}

variable "cloudfront_enabled" {
  description = "Whether CloudFront CDN is enabled for admin portal"
  type        = bool
  default     = false
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name (admin portal)"
  type        = string
  default     = ""
}

variable "cloudfront_zone_id" {
  description = "CloudFront distribution zone ID (for Route53 alias)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
