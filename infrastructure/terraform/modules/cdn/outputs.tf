output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.admin_portal.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.admin_portal.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name (*.cloudfront.net)"
  value       = aws_cloudfront_distribution.admin_portal.domain_name
}

output "distribution_zone_id" {
  description = "CloudFront distribution zone ID (for Route53 alias records)"
  value       = aws_cloudfront_distribution.admin_portal.hosted_zone_id
}

output "etag" {
  description = "CloudFront distribution ETag (useful for invalidations)"
  value       = aws_cloudfront_distribution.admin_portal.etag
}
