terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# CloudFront distribution for admin portal
# Caches Next.js static files (_next/static/*) at edge locations
# Forwards dynamic requests to ALB origin
resource "aws_cloudfront_distribution" "admin_portal" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name}-${var.environment}-admin-portal"
  default_root_object = ""
  price_class         = var.price_class
  aliases             = [var.domain_name]

  # Note: ACM cert for CloudFront MUST be in us-east-1
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  origin {
    domain_name = var.origin_domain
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Custom header to verify requests come through CloudFront
    # This prevents direct access to ALB bypassing WAF
    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_secret
    }
  }

  # Cache static assets aggressively (_next/static/*)
  ordered_cache_behavior {
    path_pattern     = "_next/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 86400      # 1 day
    default_ttl            = 604800     # 7 days
    max_ttl                = 2592000    # 30 days
    compress               = true
  }

  # Cache other static files (favicon, manifest, etc.)
  ordered_cache_behavior {
    path_pattern     = "*.ico"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 86400      # 1 day
    default_ttl            = 604800     # 7 days
    max_ttl                = 2592000    # 30 days
    compress               = true
  }

  # Cache font files with long TTL
  ordered_cache_behavior {
    path_pattern     = "*.woff*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 86400
    default_ttl            = 2592000    # 30 days
    max_ttl                = 31536000   # 365 days
    compress               = true
  }

  # Default behavior: forward to ALB (dynamic content)
  # No caching for HTML, API responses, etc.
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "alb-origin"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Accept", "Accept-Language", "Accept-Encoding"]
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0           # No caching for dynamic content
    max_ttl                = 0
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"  # Global access (African diaspora may access from anywhere)
    }
  }

  # Optional: Attach WAF Web ACL for additional rate limiting and DDoS protection
  web_acl_id = var.waf_web_acl_id != "" ? var.waf_web_acl_id : null

  # Access logging — enabled for production to provide CDN traffic audit trail
  dynamic "logging_config" {
    for_each = var.enable_access_logging && var.log_bucket_domain_name != "" ? [1] : []
    content {
      include_cookies = false
      bucket          = var.log_bucket_domain_name
      prefix          = var.log_prefix
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-admin-cdn-${var.environment}"
  })
}
