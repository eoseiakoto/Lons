output "redis_endpoint" {
  description = "Redis replication group endpoint (primary node address)"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_auth_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the Redis auth token"
  value       = aws_secretsmanager_secret.redis_auth_secret.arn
}

output "replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.redis.id
}

output "replication_group_arn" {
  description = "ARN of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.redis.arn
}

output "engine_version" {
  description = "Redis engine version"
  value       = aws_elasticache_replication_group.redis.engine_version
}

output "node_type" {
  description = "ElastiCache node type"
  value       = aws_elasticache_replication_group.redis.node_type
}

output "num_cache_nodes" {
  description = "Number of cache nodes in the replication group"
  value       = aws_elasticache_replication_group.redis.num_cache_clusters
}

output "parameter_group_name" {
  description = "Name of the parameter group used by the replication group"
  value       = aws_elasticache_parameter_group.redis.name
}

output "automatic_failover_enabled" {
  description = "Whether automatic failover is enabled"
  value       = aws_elasticache_replication_group.redis.automatic_failover_enabled
}

output "multi_az_enabled" {
  description = "Whether Multi-AZ is enabled"
  value       = aws_elasticache_replication_group.redis.multi_az_enabled
}

output "at_rest_encryption_enabled" {
  description = "Whether encryption at rest is enabled"
  value       = aws_elasticache_replication_group.redis.at_rest_encryption_enabled
}

output "transit_encryption_enabled" {
  description = "Whether encryption in transit is enabled"
  value       = aws_elasticache_replication_group.redis.transit_encryption_enabled
}

output "connection_string" {
  description = "Redis connection string with auth token (do not log)"
  value       = "redis://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  sensitive   = true
}

output "slow_log_group_name" {
  description = "CloudWatch log group name for Redis slow-log"
  value       = aws_cloudwatch_log_group.redis_slow_log.name
}

output "engine_log_group_name" {
  description = "CloudWatch log group name for Redis engine-log"
  value       = aws_cloudwatch_log_group.redis_engine_log.name
}
