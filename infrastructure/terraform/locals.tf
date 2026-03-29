# Local values and derived configurations

locals {
  # Naming conventions
  namespace = "${var.project_name}-${var.environment}"

  # Common tags applied to all resources
  common_tags = merge(
    var.tags,
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  )

  # Environment-specific settings
  environment_settings = {
    dev = {
      eks_desired_nodes        = 2
      eks_min_nodes            = 1
      eks_max_nodes            = 3
      rds_instance_class       = "db.t4g.micro"
      rds_multi_az             = false
      rds_backup_retention     = 7
      redis_node_type          = "cache.t4g.micro"
      redis_num_cache_nodes    = 1
      redis_auto_failover      = false
      enable_monitoring        = false
      enable_alb_waf           = false
      log_retention_days       = 7
    }
    staging = {
      eks_desired_nodes        = 3
      eks_min_nodes            = 2
      eks_max_nodes            = 5
      rds_instance_class       = "db.t4g.small"
      rds_multi_az             = true
      rds_backup_retention     = 14
      redis_node_type          = "cache.t4g.small"
      redis_num_cache_nodes    = 2
      redis_auto_failover      = true
      enable_monitoring        = true
      enable_alb_waf           = true
      log_retention_days       = 14
    }
    preprod = {
      eks_desired_nodes        = 3
      eks_min_nodes            = 3
      eks_max_nodes            = 10
      rds_instance_class       = "db.r6g.large"
      rds_multi_az             = true
      rds_backup_retention     = 30
      redis_node_type          = "cache.r6g.large"
      redis_num_cache_nodes    = 3
      redis_auto_failover      = true
      enable_monitoring        = true
      enable_alb_waf           = true
      log_retention_days       = 30
    }
    prod = {
      eks_desired_nodes        = 5
      eks_min_nodes            = 5
      eks_max_nodes            = 20
      rds_instance_class       = "db.r6g.xlarge"
      rds_multi_az             = true
      rds_backup_retention     = 90
      redis_node_type          = "cache.r6g.xlarge"
      redis_num_cache_nodes    = 3
      redis_auto_failover      = true
      enable_monitoring        = true
      enable_alb_waf           = true
      log_retention_days       = 90
    }
  }

  # Get settings for current environment
  env_config = local.environment_settings[var.environment]

  # State bucket and DynamoDB table names (for reference in outputs)
  state_bucket_name  = "lons-terraform-state-${data.aws_caller_identity.current.account_id}"
  state_table_name   = "lons-terraform-locks"

  # Domain names by environment
  domain_mapping = {
    dev     = "dev.lons.io"
    staging = "staging.lons.io"
    preprod = "preprod.lons.io"
    prod    = "lons.io"
  }

  subdomain = local.domain_mapping[var.environment]

  # DNS settings — Route53 zone ID will be available after WS 9 (DNS module)
  route53_zone_id = data.aws_route53_zone.primary.zone_id
}

# Data source to get current AWS account ID
data "aws_caller_identity" "current" {}

# Route53 data source — uncomment after hosted zone is created (Sprint 2, WS 9)
data "aws_route53_zone" "primary" {
  name         = var.domain_name
  private_zone = false
}
