terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Generate a random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = true
  # ElastiCache auth tokens cannot start with special chars, so we enforce alphanumeric prefix
  override_special = "!&#$^<>-"
}

# Store the auth token securely in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_secret" {
  name                    = "${var.project_name}-${var.environment}-redis-auth-token"
  description             = "ElastiCache Redis auth token for ${var.project_name} ${var.environment}"
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_auth_secret_version" {
  secret_id     = aws_secretsmanager_secret.redis_auth_secret.id
  secret_string = random_password.redis_auth_token.result
}

# ElastiCache Parameter Group for Redis 7.0
resource "aws_elasticache_parameter_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis-params"
  family      = "redis7"
  description = "Parameter group for ${var.project_name} Redis ${var.environment}"

  # Eviction policy: remove least recently used keys when max memory is reached
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Enable TCP keepalive to detect connection issues
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  # Optimize for BullMQ (message queue) workloads
  parameter {
    name  = "timeout"
    value = "0"
  }

  tags = var.tags
}

# ElastiCache Replication Group (primary + replica(s) with automatic failover)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_description = "Redis replication group for ${var.project_name} ${var.environment}"
  engine                        = "redis"
  engine_version                = var.engine_version
  node_type                     = var.node_type
  num_cache_clusters            = var.num_cache_nodes
  parameter_group_name          = aws_elasticache_parameter_group.redis.name
  port                          = 6379
  automatic_failover_enabled    = var.automatic_failover
  multi_az_enabled              = var.automatic_failover
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  auth_token                    = random_password.redis_auth_token.result
  auth_token_update_strategy    = "ROTATE"
  security_group_ids            = [var.redis_security_group_id]
  subnet_group_name             = var.subnet_group_name

  # Maintenance and backup windows
  maintenance_window = "sun:03:00-sun:04:00"
  snapshot_window    = "01:00-02:00"

  # Retention: dev=1 day, staging=3 days, prod=7 days
  snapshot_retention_limit = var.environment == "dev" ? 1 : var.environment == "staging" ? 3 : 7

  # Enable CloudWatch logs for slow-log queries
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
    enabled          = true
  }

  # Enable CloudWatch logs for engine-log (general Redis logs)
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
    enabled          = true
  }

  tags = var.tags

  depends_on = [
    aws_elasticache_parameter_group.redis,
    aws_secretsmanager_secret_version.redis_auth_secret_version
  ]

  lifecycle {
    ignore_changes = [auth_token]
  }
}

# CloudWatch Log Group for Redis slow-log
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}-${var.environment}/slow-log"
  retention_in_days = var.environment == "dev" ? 7 : var.environment == "staging" ? 14 : 30

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-slow-log"
  })
}

# CloudWatch Log Group for Redis engine-log
resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${var.project_name}-${var.environment}/engine-log"
  retention_in_days = var.environment == "dev" ? 7 : var.environment == "staging" ? 14 : 30

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-engine-log"
  })
}

# CloudWatch Alarms for Redis replication group
resource "aws_cloudwatch_metric_alarm" "redis_cpu_utilization" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  alarm_description   = "Alert when Redis CPU utilization exceeds 75%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_utilization" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  alarm_description   = "Alert when Redis memory utilization exceeds 90%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_network_bytes_in" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-network-bytes-in-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "NetworkBytesIn"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 104857600  # 100 MB per 5 minutes
  alarm_description   = "Alert when Redis network bytes in exceeds 100MB/5min"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-evictions"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when Redis evictions occur (memory pressure)"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }

  tags = var.tags
}
