output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "graphql_target_group_arn" {
  description = "ARN of the GraphQL target group"
  value       = aws_lb_target_group.graphql.arn
}

output "graphql_target_group_name" {
  description = "Name of the GraphQL target group"
  value       = aws_lb_target_group.graphql.name
}

output "rest_target_group_arn" {
  description = "ARN of the REST API target group"
  value       = aws_lb_target_group.rest.arn
}

output "rest_target_group_name" {
  description = "Name of the REST API target group"
  value       = aws_lb_target_group.rest.name
}

output "admin_target_group_arn" {
  description = "ARN of the Admin Portal target group"
  value       = aws_lb_target_group.admin.arn
}

output "admin_target_group_name" {
  description = "Name of the Admin Portal target group"
  value       = aws_lb_target_group.admin.name
}

output "alb_security_group_id" {
  description = "Security group ID of the Application Load Balancer"
  value       = aws_security_group.alb.id
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL (empty if WAF is disabled)"
  value       = var.enable_waf ? aws_wafv2_web_acl.main[0].arn : ""
}

output "alb_logs_bucket_name" {
  description = "Name of the S3 bucket for ALB access logs"
  value       = aws_s3_bucket.alb_logs.id
}

output "https_listener_arn" {
  description = "ARN of the HTTPS listener"
  value       = var.certificate_arn != "" ? aws_lb_listener.https[0].arn : ""
}
