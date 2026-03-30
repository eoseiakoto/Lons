# CloudFront ACM Certificate (us-east-1)
# AWS CloudFront requires ACM certificates to be issued in us-east-1, regardless of the primary region.
# This file manages the wildcard certificate for *.lons.io used by CloudFront in prod/preprod environments.

# ACM Certificate for *.lons.io (wildcard) and lons.io (SAN) in us-east-1
# Only provisioned when CloudFront is enabled (prod or preprod environments)
resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.us_east_1
  count                     = var.environment == "prod" || var.environment == "preprod" ? 1 : 0
  domain_name              = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method        = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name    = "${var.project_name}-cloudfront-cert"
      Purpose = "cloudfront-cdn"
    }
  )
}

# Create Route53 records for CloudFront ACM DNS validation
# Uses the primary region's Route53 zone for validation
resource "aws_route53_record" "cloudfront_acm_validation" {
  for_each = var.environment == "prod" || var.environment == "preprod" ? {
    for dvo in aws_acm_certificate.cloudfront[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.route53_zone_id
}

# Wait for CloudFront ACM certificate validation
resource "aws_acm_certificate_validation" "cloudfront" {
  provider            = aws.us_east_1
  count               = var.environment == "prod" || var.environment == "preprod" ? 1 : 0
  certificate_arn     = aws_acm_certificate.cloudfront[0].arn

  timeouts {
    create = "5m"
  }

  depends_on = [aws_route53_record.cloudfront_acm_validation]
}
