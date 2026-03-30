output "rotation_lambda_function_arn" {
  description = "ARN of the database credential rotation Lambda function"
  value       = aws_lambda_function.db_rotation.arn
}

output "rotation_lambda_function_name" {
  description = "Name of the database credential rotation Lambda function"
  value       = aws_lambda_function.db_rotation.function_name
}

output "rotation_lambda_role_arn" {
  description = "ARN of the IAM role for rotation Lambda"
  value       = aws_iam_role.rotation_lambda_role.arn
}

output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group for rotation Lambda"
  value       = aws_cloudwatch_log_group.rotation_lambda_logs.name
}

output "rotation_lambda_security_group_id" {
  description = "Security group ID for the rotation Lambda function"
  value       = aws_security_group.rotation_lambda_sg.id
}

output "secrets_rotation_enabled" {
  description = "Whether secrets rotation is enabled"
  value       = aws_secretsmanager_secret_rotation.db_rotation.rotation_enabled
}

output "rotation_rule_schedule" {
  description = "The rotation schedule expression"
  value       = "rate(${var.rotation_rules.database_rotation_days} days)"
}

output "eventbridge_manual_trigger_rule_name" {
  description = "Name of the EventBridge rule for manual rotation triggers"
  value       = aws_cloudwatch_event_rule.manual_rotation_trigger.name
}

output "db_rotation_errors_alarm_arn" {
  description = "ARN of the CloudWatch alarm for rotation errors"
  value       = aws_cloudwatch_metric_alarm.db_rotation_errors.arn
}

output "db_rotation_duration_alarm_arn" {
  description = "ARN of the CloudWatch alarm for rotation duration"
  value       = aws_cloudwatch_metric_alarm.db_rotation_duration.arn
}
