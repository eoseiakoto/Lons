output "backup_vault_id" {
  description = "ID of the backup vault"
  value       = aws_backup_vault.main.id
}

output "backup_vault_arn" {
  description = "ARN of the backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_plan_id" {
  description = "ID of the backup plan"
  value       = aws_backup_plan.main.id
}

output "backup_plan_arn" {
  description = "ARN of the backup plan"
  value       = aws_backup_plan.main.arn
}

output "backup_service_role_arn" {
  description = "ARN of the IAM role used by AWS Backup"
  value       = aws_iam_role.backup_service.arn
}

output "backup_notifications_topic_arn" {
  description = "ARN of the SNS topic for backup notifications"
  value       = aws_sns_topic.backup_notifications.arn
}

output "kms_key_id" {
  description = "KMS key ID used for backup encryption"
  value       = aws_kms_key.backup.id
}

output "kms_key_arn" {
  description = "KMS key ARN used for backup encryption"
  value       = aws_kms_key.backup.arn
}

output "rds_backup_selection_id" {
  description = "ID of the RDS backup selection"
  value       = aws_backup_selection.rds.id
}

output "redis_backup_selection_id" {
  description = "ID of the Redis backup selection (if enabled)"
  value       = try(aws_backup_selection.redis[0].id, null)
}
