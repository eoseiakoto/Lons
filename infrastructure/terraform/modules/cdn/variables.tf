variable "project_name" {
  description = "Name of the project"
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

variable "domain_name" {
  description = "Domain name for CloudFront distribution (e.g., admin.staging.lons.io)"
  type        = string
}

variable "origin_domain" {
  description = "Origin domain name (ALB DNS name)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate in us-east-1 for CloudFront (wildcard *.lons.io)"
  type        = string
}

variable "waf_web_acl_id" {
  description = "Optional WAF Web ACL ID to attach to CloudFront distribution"
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100, PriceClass_200, PriceClass_All)"
  type        = string
  default     = "PriceClass_200"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Price class must be one of: PriceClass_100, PriceClass_200, PriceClass_All."
  }
}

variable "origin_secret" {
  description = "Secret header value to verify requests come through CloudFront (prevent direct ALB access)"
  type        = string
  sensitive   = true
}

variable "enable_access_logging" {
  description = "Enable CloudFront access logging to S3 (recommended for production)"
  type        = bool
  default     = false
}

variable "log_bucket_domain_name" {
  description = "S3 bucket domain name for CloudFront access logs (required when enable_access_logging is true)"
  type        = string
  default     = ""
}

variable "log_prefix" {
  description = "S3 key prefix for CloudFront access logs"
  type        = string
  default     = "cdn-logs/"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
