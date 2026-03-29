terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Create Route53 hosted zone only in prod environment
resource "aws_route53_zone" "root" {
  count = var.environment == "prod" ? 1 : 0
  name  = var.domain_name

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-root-zone"
      Environment = var.environment
    }
  )
}

# Data source to look up the hosted zone in non-prod environments
data "aws_route53_zone" "root" {
  count = var.environment == "prod" ? 0 : 1
  name  = var.domain_name
}

# Select the appropriate zone ID based on environment
locals {
  zone_id = var.environment == "prod" ? aws_route53_zone.root[0].zone_id : data.aws_route53_zone.root[0].zone_id
}

# ACM Certificate for *.lons.io (wildcard) and lons.io (SAN)
resource "aws_acm_certificate" "main" {
  domain_name              = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method        = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-wildcard-cert"
      Environment = var.environment
    }
  )
}

# Create Route53 records for ACM DNS validation
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.zone_id
}

# Wait for ACM certificate validation
resource "aws_acm_certificate_validation" "main" {
  certificate_arn           = aws_acm_certificate.main.arn
  timeouts {
    create = "5m"
  }
  depends_on = [aws_route53_record.acm_validation]
}

# Alias A record pointing subdomain to ALB
resource "aws_route53_record" "subdomain_alias" {
  zone_id = local.zone_id
  name    = var.subdomain
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}

# Alias A record for api.{subdomain} pointing to ALB
resource "aws_route53_record" "api_subdomain_alias" {
  zone_id = local.zone_id
  name    = "api.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}

# Alias A record for admin.{subdomain} pointing to CloudFront (when CDN is enabled)
resource "aws_route53_record" "admin_cloudfront_alias" {
  count   = var.cloudfront_enabled ? 1 : 0
  zone_id = local.zone_id
  name    = "admin.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}

# Alias A record for admin.{subdomain} pointing to ALB (when CDN is not enabled)
# Used for staging and dev environments
resource "aws_route53_record" "admin_alb_alias" {
  count   = var.cloudfront_enabled ? 0 : 1
  zone_id = local.zone_id
  name    = "admin.${var.subdomain}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [aws_acm_certificate_validation.main]
}
