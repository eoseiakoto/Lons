output "zone_id" {
  description = "The Route53 hosted zone ID"
  value       = local.zone_id
}

output "name_servers" {
  description = "The name servers for NS delegation from domain registrar (e.g., GoDaddy)"
  value = var.environment == "prod" ? aws_route53_zone.root[0].name_servers : data.aws_route53_zone.root[0].name_servers
}

output "certificate_arn" {
  description = "The ARN of the ACM certificate"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "domain_name" {
  description = "The root domain name"
  value       = var.domain_name
}

output "api_domain_name" {
  description = "The API-specific domain name (api.{subdomain})"
  value       = "api.${var.subdomain}"
}

output "admin_domain_name" {
  description = "The admin portal domain name (admin.{subdomain})"
  value       = "admin.${var.subdomain}"
}

output "platform_domain_name" {
  description = "The platform portal domain name (platform.{subdomain})"
  value       = "platform.${var.subdomain}"
}

output "grafana_domain_name" {
  description = "The Grafana dashboard domain name (grafana.{subdomain})"
  value       = var.grafana_enabled ? "grafana.${var.subdomain}" : ""
}
