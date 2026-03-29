# Production environment configuration

project_name   = "lons"
environment    = "prod"
region         = "eu-west-1"
vpc_cidr       = "10.2.0.0/16"

# EKS Configuration
eks_cluster_version   = "1.28"
eks_node_capacity_type = "on-demand"
eks_desired_nodes     = 5
eks_min_nodes         = 5
eks_max_nodes         = 20

# RDS Configuration
rds_database_name        = "lons"
rds_engine_version       = "16.1"
rds_instance_class       = "db.r6g.xlarge"
rds_multi_az             = true
rds_backup_retention_days = 90

# Redis Configuration
redis_node_type               = "cache.r6g.xlarge"
redis_num_cache_nodes         = 3
redis_automatic_failover_enabled = true

# Domain
domain_name = "lons.io"

# Features
enable_alb_waf = true

# Monitoring
log_retention_days = 90

# Additional tags specific to production
tags = {
  Team       = "operations"
  CostCenter = "prod"
  Resettable = "false"
  Backup     = "continuous"
  Compliance = "required"
  PCI        = "required"
  HA         = "required"
}
