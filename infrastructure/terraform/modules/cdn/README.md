# CloudFront CDN Module

CloudFront distribution for the Lōns admin portal, caching static Next.js assets at AWS edge locations while forwarding dynamic requests to the ALB.

## Features

- **Static asset caching**: `_next/static/*` cached for 7 days
- **Font caching**: Woff files cached for 30 days
- **Dynamic content**: No caching for HTML, JSON responses
- **Origin verification**: Custom header (`X-Origin-Verify`) prevents direct ALB access
- **Price class**: `PriceClass_200` (Africa + Europe) for prod, `PriceClass_100` for preprod
- **Security**: TLS 1.2+, SNI, optional WAF integration
- **Compression**: Gzip enabled for all cacheable content

## Usage

The module is conditionally enabled for `prod` and `preprod` environments only. See `infrastructure/terraform/main.tf` for integration.

### Example

```hcl
module "cdn" {
  source = "./modules/cdn"
  count  = var.environment == "prod" || var.environment == "preprod" ? 1 : 0

  project_name        = "lons"
  environment         = var.environment
  domain_name         = "admin.${local.subdomain}"
  origin_domain       = module.alb.alb_dns_name
  acm_certificate_arn = var.cloudfront_certificate_arn  # Must be in us-east-1
  origin_secret       = random_password.cdn_origin_secret.result
  waf_web_acl_id      = module.alb.waf_web_acl_arn
  tags                = local.common_tags
}
```

## Variables

- `project_name`: Project identifier (e.g., "lons")
- `environment`: Deployment environment (dev, staging, preprod, prod)
- `domain_name`: CloudFront alias domain (e.g., admin.staging.lons.io)
- `origin_domain`: ALB DNS name (e.g., lons-alb-staging-*.elb.eu-west-1.amazonaws.com)
- `acm_certificate_arn`: ACM certificate ARN **in us-east-1** (required for CloudFront)
- `origin_secret`: Random secret for `X-Origin-Verify` header (prevents direct ALB access)
- `waf_web_acl_id`: Optional WAF Web ACL ID (reuses existing ALB WAF)
- `price_class`: CloudFront pricing class (PriceClass_100, PriceClass_200, PriceClass_All)

## Outputs

- `distribution_id`: CloudFront distribution ID
- `distribution_arn`: CloudFront distribution ARN
- `distribution_domain_name`: CloudFront domain (*.cloudfront.net)
- `distribution_zone_id`: Zone ID for Route53 alias records

## DNS Integration

When CDN is enabled, the DNS module creates a Route53 alias record:

```
admin.{subdomain} ALIAS -> CloudFront distribution
```

This is automatically configured by `main.tf` when deploying to prod/preprod.

## Origin Security

The module uses a custom header (`X-Origin-Verify`) to verify requests come through CloudFront. The ALB listener rules should validate this header and reject direct access:

```hcl
# In ALB admin portal listener rule (future):
condition {
  http_header {
    http_header_name = "X-Origin-Verify"
    values           = [var.cdn_origin_secret]
  }
}
```

## Cache Behavior

| Path Pattern | Methods | TTL | Cache | Compress |
|---|---|---|---|---|
| `_next/static/*` | GET, HEAD | 7 days | Yes | Yes |
| `*.woff*` | GET, HEAD | 30 days | Yes | Yes |
| `*.ico` | GET, HEAD | 1 day | Yes | Yes |
| `*` (default) | All | 0s | No | Yes |

## Monitoring

Monitor CloudFront performance via AWS Console:
- Distribution status
- Cache hit ratio
- Edge location traffic
- Error rates (4xx, 5xx)

## Cost Optimization

- **PriceClass_200**: Excludes most expensive edge locations, suitable for Africa+Europe
- **PriceClass_100**: Further reduced coverage (dev/staging)
- **PriceClass_All**: All edge locations (not recommended for this use case)

Estimated costs (as of 2024):
- **PriceClass_200**: ~$0.085 per GB (EU region)
- **Data transfer out**: Depends on traffic volume

## Future Enhancements

- [ ] S3 bucket for CDN access logs
- [ ] Lambda@Edge for custom headers (e.g., security headers)
- [ ] Geographic restrictions (e.g., block sanctioned countries)
- [ ] Custom error pages
