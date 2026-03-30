# Pre-production environment configuration

project_name   = "lons"
environment    = "preprod"
region         = "eu-west-1"
vpc_cidr       = "10.1.0.0/16"

# EKS Configuration
eks_cluster_version   = "1.28"
eks_node_capacity_type = "on-demand"
eks_desired_nodes     = 3
eks_min_nodes         = 3
eks_max_nodes         = 10

# RDS Configuration
rds_database_name        = "lons"
rds_engine_version       = "16.1"
rds_instance_class       = "db.r6g.large"
rds_multi_az             = true
rds_backup_retention_days = 30

# Redis Configuration
redis_node_type               = "cache.r6g.large"
redis_num_cache_nodes         = 3
redis_automatic_failover_enabled = true

# Domain
domain_name = "lons.io"

# Features
enable_alb_waf = true

# Monitoring
log_retention_days = 30

# Additional tags specific to preprod
tags = {
  Team       = "operations"
  CostCenter = "preprod"
  Resettable = "false"
  Backup     = "daily"
  Compliance = "required"
}
