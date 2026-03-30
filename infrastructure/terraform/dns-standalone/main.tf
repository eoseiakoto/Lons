###############################################################################
# DNS Standalone Terraform Configuration
#
# Manages Route53 DNS records for Lōns staging environment.
# This config is isolated from the main Terraform modules to allow
# independent DNS management while the main modules are being stabilized.
#
# State: s3://lons-terraform-state-053414411791/dns/terraform.tfstate
#
# Usage:
#   terraform init \
#     -backend-config="bucket=lons-terraform-state-053414411791" \
#     -backend-config="key=dns/terraform.tfstate" \
#     -backend-config="region=eu-west-1" \
#     -backend-config="dynamodb_table=lons-terraform-locks" \
#     -backend-config="encrypt=true"
#
#   terraform plan
#   terraform apply
###############################################################################

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = "eu-west-1"
}

# ============================================================================
# Variables
# ============================================================================

variable "zone_id" {
  description = "Route53 Hosted Zone ID for lons.io"
  type        = string
  default     = "Z09151071W91RMNBP4IUI"
}

variable "alb_dns_name" {
  description = "DNS name of the staging ALB/NLB"
  type        = string
  default     = "a8896e30db7e64c968dd40496c37f7c3-f20a0d4361f15f8c.elb.eu-west-1.amazonaws.com"
}

variable "alb_zone_id" {
  description = "Hosted zone ID for the staging ALB in eu-west-1"
  type        = string
  default     = "Z2IFOLAFXWLO4F"
}

# ============================================================================
# Staging DNS Records
# ============================================================================

# Staging API — CNAME to ALB
resource "aws_route53_record" "staging_api" {
  zone_id = var.zone_id
  name    = "api.staging.lons.io"
  type    = "CNAME"
  ttl     = 300
  records = [var.alb_dns_name]
}

# Staging Admin Portal — CNAME to ALB
resource "aws_route53_record" "staging_admin" {
  zone_id = var.zone_id
  name    = "admin.staging.lons.io"
  type    = "CNAME"
  ttl     = 300
  records = [var.alb_dns_name]
}

# Staging Platform Portal — A alias to ALB
resource "aws_route53_record" "staging_platform" {
  zone_id = var.zone_id
  name    = "platform.staging.lons.io"
  type    = "A"
  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Staging Grafana — A alias to ALB
resource "aws_route53_record" "staging_grafana" {
  zone_id = var.zone_id
  name    = "grafana.staging.lons.io"
  type    = "A"
  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "staging_api_fqdn" {
  value = aws_route53_record.staging_api.fqdn
}

output "staging_admin_fqdn" {
  value = aws_route53_record.staging_admin.fqdn
}

output "staging_platform_fqdn" {
  value = aws_route53_record.staging_platform.fqdn
}

output "staging_grafana_fqdn" {
  value = aws_route53_record.staging_grafana.fqdn
}
