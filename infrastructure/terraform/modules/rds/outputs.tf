# RDS Module Outputs

output "db_instance_id" {
  description = "The RDS instance identifier"
  value       = aws_db_instance.main.id
}

output "db_instance_arn" {
  description = "The ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

output "db_instance_endpoint" {
  description = "The connection endpoint for the RDS instance (host:port)"
  value       = aws_db_instance.main.endpoint
}

output "db_instance_address" {
  description = "The address of the RDS instance (hostname only)"
  value       = aws_db_instance.main.address
}

output "db_instance_port" {
  description = "The port of the RDS instance"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "The name of the initial database"
  value       = aws_db_instance.main.db_name
}

output "db_username" {
  description = "The master username for the database"
  value       = local.db_username
  sensitive   = true
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "db_secret_id" {
  description = "ID of the Secrets Manager secret containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.id
}

output "db_connection_string" {
  description = "PostgreSQL connection string (use secrets manager for password)"
  value       = "postgresql://${local.db_username}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "kms_key_id" {
  description = "KMS key ID used for RDS encryption"
  value       = aws_kms_key.rds.id
}

output "kms_key_arn" {
  description = "KMS key ARN used for RDS encryption"
  value       = aws_kms_key.rds.arn
}

output "parameter_group_name" {
  description = "Name of the RDS parameter group"
  value       = aws_db_parameter_group.main.name
}

output "db_instance_resource_id" {
  description = "Resource ID of the RDS instance (used for CloudTrail logging)"
  value       = aws_db_instance.main.resource_id
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for PostgreSQL logs"
  value       = aws_cloudwatch_log_group.postgresql.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN for PostgreSQL logs"
  value       = aws_cloudwatch_log_group.postgresql.arn
}

output "db_connection_url_env" {
  description = "DATABASE_URL environment variable format (use secrets manager for password)"
  value       = "postgresql://${local.db_username}:PASS@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
  sensitive   = true
}
