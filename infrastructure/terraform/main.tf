# Main composition file: orchestrates module instantiation
# Sprint 1: VPC module is implemented. Other modules are stubs (Sprint 2).
# Stub modules are commented out until implemented to allow terraform plan to succeed.

locals {
  cluster_name = "${var.project_name}-eks-${var.environment}"
}

# ──────────────────────────────────────────────
# VPC Module (Sprint 1 — implemented)
# ──────────────────────────────────────────────
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  cluster_name       = local.cluster_name
  single_nat_gateway = var.environment == "dev" || var.environment == "staging"
  enable_flow_logs   = var.environment != "dev"
  common_tags        = local.common_tags
}

# ──────────────────────────────────────────────
# Sprint 2 modules — uncomment as implemented
# ──────────────────────────────────────────────

# EKS Cluster Module
module "eks" {
  source = "./modules/eks"

  project_name       = var.project_name
  environment        = var.environment
  cluster_name       = local.cluster_name
  cluster_version    = var.eks_cluster_version
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  capacity_type      = var.eks_node_capacity_type
  desired_nodes      = local.env_config.eks_desired_nodes
  min_nodes          = local.env_config.eks_min_nodes
  max_nodes          = local.env_config.eks_max_nodes
  tags               = local.common_tags
}

# RDS PostgreSQL Module
module "rds" {
  source = "./modules/rds"

  project_name              = var.project_name
  environment               = var.environment
  database_name             = var.rds_database_name
  engine_version            = var.rds_engine_version
  instance_class            = local.env_config.rds_instance_class
  multi_az                  = local.env_config.rds_multi_az
  backup_retention_days     = local.env_config.rds_backup_retention
  vpc_id                    = module.vpc.vpc_id
  db_subnet_group_name      = module.vpc.db_subnet_group_name
  rds_security_group_id     = module.vpc.rds_security_group_id
  deletion_protection       = var.environment == "prod"
  tags                      = local.common_tags
}

# ElastiCache Redis Module
module "elasticache" {
  source = "./modules/elasticache"

  project_name           = var.project_name
  environment            = var.environment
  node_type              = local.env_config.redis_node_type
  num_cache_nodes        = local.env_config.redis_num_cache_nodes
  automatic_failover     = local.env_config.redis_auto_failover
  engine_version         = "7.0"
  vpc_id                 = module.vpc.vpc_id
  subnet_group_name      = module.vpc.elasticache_subnet_group_name
  redis_security_group_id = module.vpc.redis_security_group_id
  tags                   = local.common_tags
}

# S3 for Document Storage
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  dr_region    = var.dr_region
  tags         = local.common_tags

  providers = {
    aws    = aws
    aws.dr = aws.dr
  }
}

# Application Load Balancer (ALB)
module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  enable_waf        = local.env_config.enable_alb_waf
  certificate_arn   = var.acm_certificate_arn != "" ? var.acm_certificate_arn : module.dns.certificate_arn
  domain_name       = local.subdomain
  route53_zone_id   = local.route53_zone_id
  tags              = local.common_tags
}

# Route53 / ACM Module (DNS and certificates)
module "dns" {
  source = "./modules/dns"

  project_name           = var.project_name
  environment            = var.environment
  domain_name            = var.domain_name
  subdomain              = local.subdomain
  alb_dns_name           = module.alb.alb_dns_name
  alb_zone_id            = module.alb.alb_zone_id
  cloudfront_enabled     = var.environment == "prod" || var.environment == "preprod"
  cloudfront_domain_name = var.environment == "prod" || var.environment == "preprod" ? module.cdn[0].distribution_domain_name : ""
  cloudfront_zone_id     = var.environment == "prod" || var.environment == "preprod" ? module.cdn[0].distribution_zone_id : ""
  grafana_enabled        = var.grafana_enabled
  tags                   = local.common_tags
}

# ──────────────────────────────────────────────
# CloudFront CDN Module (Admin Portal)
# ──────────────────────────────────────────────

# S3 bucket for CloudFront access logs (production only)
resource "aws_s3_bucket" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = "${var.project_name}-cdn-logs-${var.environment}"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-cdn-logs-${var.environment}"
  })
}

resource "aws_s3_bucket_ownership_controls" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.cdn_logs[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.cdn_logs[0].id
  acl    = "log-delivery-write"

  depends_on = [aws_s3_bucket_ownership_controls.cdn_logs[0]]
}

resource "aws_s3_bucket_lifecycle_configuration" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.cdn_logs[0].id

  rule {
    id     = "cdn-log-retention"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.cdn_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cdn_logs" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.cdn_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

module "cdn" {
  source = "./modules/cdn"
  count  = var.environment == "prod" || var.environment == "preprod" ? 1 : 0

  project_name           = var.project_name
  environment            = var.environment
  domain_name            = "admin.${local.subdomain}"
  origin_domain          = module.alb.alb_dns_name
  acm_certificate_arn    = aws_acm_certificate.cloudfront[0].arn
  price_class            = var.environment == "prod" ? "PriceClass_200" : "PriceClass_100"
  origin_secret          = random_password.cdn_origin_secret.result
  waf_web_acl_id         = local.env_config.enable_alb_waf ? module.alb.waf_web_acl_arn : ""
  enable_access_logging  = var.environment == "prod"
  log_bucket_domain_name = var.environment == "prod" ? aws_s3_bucket.cdn_logs[0].bucket_domain_name : ""
  log_prefix             = "cdn-logs/"
  tags                   = local.common_tags

  depends_on = [aws_acm_certificate_validation.cloudfront]
}

# Random secret for CDN origin verification header
resource "random_password" "cdn_origin_secret" {
  length  = 32
  special = false
}

# ──────────────────────────────────────────────
# Backup & Disaster Recovery Module
# ──────────────────────────────────────────────
module "backup" {
  source = "./modules/backup"

  project_name           = var.project_name
  environment            = var.environment
  rds_arn                = module.rds.db_instance_arn
  redis_arn              = module.elasticache.replication_group_arn
  dr_region              = var.dr_region
  daily_retention_days   = var.environment == "prod" ? 30 : 7
  monthly_retention_days = var.environment == "prod" ? 365 : 90
  tags                   = local.common_tags
}

# ──────────────────────────────────────────────
# Outputs (Sprint 1 & 2)
# ──────────────────────────────────────────────

# Sprint 1 — VPC Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value       = module.vpc.database_subnet_ids
}

output "nat_gateway_ips" {
  description = "NAT Gateway public IPs"
  value       = module.vpc.nat_gateway_ips
}

# Sprint 2 — EKS Outputs
output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = module.eks.cluster_endpoint
}

# Sprint 2 — RDS Outputs
output "db_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_instance_endpoint
}

# Sprint 2 — ElastiCache Outputs
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.redis_endpoint
}

# Sprint 2 — ALB Outputs
output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.alb.alb_dns_name
}

# CDN Outputs
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (admin portal)"
  value       = var.environment == "prod" || var.environment == "preprod" ? module.cdn[0].distribution_id : ""
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = var.environment == "prod" || var.environment == "preprod" ? module.cdn[0].distribution_domain_name : ""
}

output "cloudfront_zone_id" {
  description = "CloudFront distribution zone ID (for Route53 alias)"
  value       = var.environment == "prod" || var.environment == "preprod" ? module.cdn[0].distribution_zone_id : ""
}

# Sprint 2 — S3 Outputs
output "ecr_repository_urls" {
  description = "ECR repository URLs for container images"
  value       = module.s3.ecr_repository_urls
}

# Sprint 2 — Backup & DR Outputs
output "backup_vault_arn" {
  description = "ARN of the AWS Backup vault"
  value       = module.backup.backup_vault_arn
}

output "backup_plan_id" {
  description = "ID of the backup plan"
  value       = module.backup.backup_plan_id
}

output "backup_notifications_topic_arn" {
  description = "ARN of the SNS topic for backup notifications"
  value       = module.backup.backup_notifications_topic_arn
}
