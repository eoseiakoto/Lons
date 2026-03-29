# Development environment configuration

project_name   = "lons"
environment    = "dev"
region         = "eu-west-1"
vpc_cidr       = "10.0.0.0/16"

# EKS Configuration
eks_cluster_version   = "1.28"
eks_node_capacity_type = "spot"
eks_desired_nodes     = 2
eks_min_nodes         = 1
eks_max_nodes         = 3

# RDS Configuration
rds_database_name        = "lons"
rds_engine_version       = "16.1"
rds_instance_class       = "db.t4g.micro"
rds_multi_az             = false
rds_backup_retention_days = 7

# Redis Configuration
redis_node_type               = "cache.t4g.micro"
redis_num_cache_nodes         = 1
redis_automatic_failover_enabled = false

# Domain
domain_name = "lons.io"

# Features
enable_alb_waf = false

# Monitoring
log_retention_days = 7

# Additional tags specific to dev
tags = {
  Team       = "engineering"
  CostCenter = "dev"
  Resettable = "true"
}
