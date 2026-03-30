# Root-level outputs for infrastructure state
# Sprint 1: Only VPC outputs active. Others uncomment as modules are implemented.

output "terraform_backend_config" {
  description = "Backend configuration for reference"
  value = {
    bucket         = local.state_bucket_name
    key            = "terraform.tfstate"
    region         = var.region
    dynamodb_table = local.state_table_name
    encrypt        = true
  }
}

output "environment_config" {
  description = "Environment-specific configuration used"
  value = {
    environment        = var.environment
    region             = var.region
    dr_region          = var.dr_region
    availability_zones = var.availability_zones
    subdomain          = local.subdomain
  }
}

output "account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "vpc_info" {
  description = "VPC information"
  value = {
    vpc_id            = module.vpc.vpc_id
    cidr_block        = var.vpc_cidr
    public_subnets    = module.vpc.public_subnet_ids
    private_subnets   = module.vpc.private_subnet_ids
    database_subnets  = module.vpc.database_subnet_ids
  }
}

output "monitoring" {
  description = "Monitoring and logging configuration"
  value = {
    enable_monitoring        = local.env_config.enable_monitoring
    cloudwatch_log_retention = local.env_config.log_retention_days
  }
}

output "deployment_instructions" {
  description = "Instructions for initializing terraform backend"
  value       = <<-EOT
    To initialize Terraform with remote backend, run:

    terraform init \
      -backend-config="bucket=${local.state_bucket_name}" \
      -backend-config="key=terraform.tfstate" \
      -backend-config="region=${var.region}" \
      -backend-config="dynamodb_table=${local.state_table_name}" \
      -backend-config="encrypt=true"

    For workspace selection:
    terraform workspace select ${var.environment}
  EOT
}

# ──────────────────────────────────────────────
# Sprint 2 outputs — uncomment as modules are implemented
# ──────────────────────────────────────────────

# output "eks_info" {
#   description = "EKS cluster information"
#   value = {
#     cluster_name     = module.eks.cluster_name
#     cluster_endpoint = module.eks.cluster_endpoint
#     cluster_version  = var.eks_cluster_version
#     node_role_arn    = module.eks.node_role_arn
#   }
#   sensitive = true
# }

# output "rds_info" {
#   description = "RDS database information"
#   value = {
#     endpoint      = module.rds.endpoint
#     port          = module.rds.port
#     database_name = var.rds_database_name
#     engine        = "postgres"
#     version       = var.rds_engine_version
#   }
#   sensitive = true
# }

# output "redis_info" {
#   description = "ElastiCache Redis information"
#   value = {
#     endpoint = module.elasticache.primary_endpoint_address
#     port     = module.elasticache.port
#     engine   = "redis"
#     version  = "7.0"
#   }
#   sensitive = true
# }

# output "alb_info" {
#   description = "Application Load Balancer information"
#   value = {
#     dns_name  = module.alb.dns_name
#     arn       = module.alb.arn
#     subdomain = local.subdomain
#   }
# }

# output "s3_info" {
#   description = "S3 bucket information"
#   value = {
#     document_bucket = module.s3.document_bucket_name
#   }
# }
