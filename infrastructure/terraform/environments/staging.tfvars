# Staging environment configuration

project_name   = "lons"
environment    = "staging"
region         = "eu-west-1"
vpc_cidr       = "10.0.0.0/16"

# EKS Configuration
eks_cluster_version   = "1.28"
eks_node_capacity_type = "on-demand"
eks_desired_nodes     = 3
eks_min_nodes         = 2
eks_max_nodes         = 5

# RDS Configuration
rds_database_name        = "lons"
rds_engine_version       = "16.1"
rds_instance_class       = "db.t4g.small"
rds_multi_az             = true
rds_backup_retention_days = 14

# Redis Configuration
redis_node_type               = "cache.t4g.small"
redis_num_cache_nodes         = 2
redis_automatic_failover_enabled = true

# Domain
domain_name = "lons.io"

# Features
enable_alb_waf = true

# Monitoring
log_retention_days = 14

# Additional tags specific to staging
tags = {
  Team       = "engineering"
  CostCenter = "staging"
  Resettable = "true"
  Backup     = "daily"
}
