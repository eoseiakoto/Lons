# ──────────────────────────────────────────────────────────────────────
# Slow Query Alerting for RDS PostgreSQL
# ──────────────────────────────────────────────────────────────────────
# Monitors PostgreSQL slow queries (> 1 second) via CloudWatch logs.
# Sends alerts when threshold is exceeded.

# ──────────────────────────────────────────────────────────────────────
# SNS Topic for Database Alerts
# ──────────────────────────────────────────────────────────────────────
resource "aws_sns_topic" "db_alerts" {
  name = "${var.project_name}-${var.environment}-db-alerts"

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-db-alerts"
    }
  )
}

# Policy to allow CloudWatch to publish to SNS
resource "aws_sns_topic_policy" "db_alerts" {
  arn = aws_sns_topic.db_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.db_alerts.arn
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Metric Filter for Slow Queries
# ──────────────────────────────────────────────────────────────────────
# Parses PostgreSQL logs for queries that exceed log_min_duration_statement (1000ms)
# Log format: [timestamp] [pid] [LOG] duration: XXXm.XXXs statement: SELECT...
resource "aws_cloudwatch_log_metric_filter" "slow_queries" {
  name           = "${var.project_name}-${var.environment}-slow-queries"
  log_group_name = module.rds.cloudwatch_log_group_name

  # Pattern matches PostgreSQL log format for slow queries:
  # [date, time, pid, level = "LOG", ..., duration keyword, ...]
  # This is a liberal pattern that will catch duration: entries in logs
  pattern = "[date, time, pid, level = \"LOG\", ..., \"duration:\", ...]"

  metric_transformation {
    name          = "SlowQueryCount"
    namespace     = "Lons/${var.environment}/Database"
    value         = "1"
    default_value = 0
  }

  depends_on = [
    module.rds
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Alarm: Warning Threshold
# ──────────────────────────────────────────────────────────────────────
# Warning: > 10 slow queries in 5 minutes
resource "aws_cloudwatch_metric_alarm" "slow_queries_warning" {
  alarm_name          = "${var.project_name}-${var.environment}-slow-queries-warning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2  # Alarm triggers if threshold exceeded in 2 consecutive 5-minute periods
  metric_name         = "SlowQueryCount"
  namespace           = "Lons/${var.environment}/Database"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "More than 10 slow queries (>1s) detected in 5 minutes"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.db_alerts.arn]
  ok_actions    = [aws_sns_topic.db_alerts.arn]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-slow-queries-warning"
    }
  )

  depends_on = [
    aws_cloudwatch_log_metric_filter.slow_queries
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Alarm: Critical Threshold
# ──────────────────────────────────────────────────────────────────────
# Critical: > 50 slow queries in 5 minutes
resource "aws_cloudwatch_metric_alarm" "slow_queries_critical" {
  alarm_name          = "${var.project_name}-${var.environment}-slow-queries-critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1  # Alarm triggers immediately on threshold exceeded
  metric_name         = "SlowQueryCount"
  namespace           = "Lons/${var.environment}/Database"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 50
  alarm_description   = "More than 50 slow queries (>1s) detected in 5 minutes - CRITICAL"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.db_alerts.arn]
  ok_actions    = [aws_sns_topic.db_alerts.arn]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-slow-queries-critical"
    }
  )

  depends_on = [
    aws_cloudwatch_log_metric_filter.slow_queries
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Alarm: Database CPU Utilization
# ──────────────────────────────────────────────────────────────────────
# Alert if CPU is consistently high (often causes slow queries)
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "RDS CPU utilization exceeds 85% - may cause slow queries"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = module.rds.db_instance_id
  }

  alarm_actions = [aws_sns_topic.db_alerts.arn]
  ok_actions    = [aws_sns_topic.db_alerts.arn]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-cpu-high"
    }
  )

  depends_on = [
    module.rds
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Alarm: Database Connections
# ──────────────────────────────────────────────────────────────────────
# Alert if connection count is near limit (default 122 for micro, scales with instance)
resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80  # Alert at 80% of typical max
  alarm_description   = "RDS database connections are high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = module.rds.db_instance_id
  }

  alarm_actions = [aws_sns_topic.db_alerts.arn]
  ok_actions    = [aws_sns_topic.db_alerts.arn]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-connections-high"
    }
  )

  depends_on = [
    module.rds
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Alarm: Database Storage Space
# ──────────────────────────────────────────────────────────────────────
# Alert if free storage space is low
resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120  # 5 GB in bytes
  alarm_description   = "RDS free storage space below 5 GB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = module.rds.db_instance_id
  }

  alarm_actions = [aws_sns_topic.db_alerts.arn]
  ok_actions    = [aws_sns_topic.db_alerts.arn]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-storage-low"
    }
  )

  depends_on = [
    module.rds
  ]
}

# ──────────────────────────────────────────────────────────────────────
# CloudWatch Dashboard for Database Monitoring
# ──────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_dashboard" "database_monitoring" {
  dashboard_name = "${var.project_name}-${var.environment}-database"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { stat = "Average" }],
            [".", "DatabaseConnections", { stat = "Average" }],
            [".", "FreeStorageSpace", { stat = "Average" }],
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "RDS Instance Metrics"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["Lons/${var.environment}/Database", "SlowQueryCount", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.region
          title  = "Slow Query Count (>1s)"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "ReadThroughput", { stat = "Average" }],
            [".", "WriteThroughput", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "RDS I/O Throughput"
        }
      },
      {
        type = "log"
        properties = {
          query   = "fields @timestamp, @message | filter @message like /duration:/ | stats count() as slow_query_count by bin(5m)"
          region  = var.region
          title   = "Slow Query Distribution (5-minute bins)"
        }
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# Output the SNS topic for notification configuration
# ──────────────────────────────────────────────────────────────────────
output "db_alerts_topic_arn" {
  description = "ARN of the SNS topic for database alerts"
  value       = aws_sns_topic.db_alerts.arn
}

output "slow_query_metric_filter_name" {
  description = "Name of the CloudWatch metric filter for slow queries"
  value       = aws_cloudwatch_log_metric_filter.slow_queries.name
}

output "database_dashboard_url" {
  description = "URL to the CloudWatch dashboard for database monitoring"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.database_monitoring.dashboard_name}"
}
