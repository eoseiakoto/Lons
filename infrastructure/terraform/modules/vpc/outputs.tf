# VPC Module Outputs

# VPC
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = aws_vpc.main.cidr_block
}

# Internet Gateway
output "internet_gateway_id" {
  description = "Internet Gateway ID"
  value       = aws_internet_gateway.main.id
}

# Public Subnets
output "public_subnet_ids" {
  description = "List of public subnet IDs (for ALB)"
  value       = aws_subnet.public[*].id
}

output "public_subnet_cidrs" {
  description = "List of public subnet CIDR blocks"
  value       = aws_subnet.public[*].cidr_block
}

output "public_subnets_by_az" {
  description = "Map of public subnets by availability zone"
  value = {
    for subnet in aws_subnet.public : subnet.availability_zone => subnet.id
  }
}

# Private Subnets
output "private_subnet_ids" {
  description = "List of private subnet IDs (for EKS nodes)"
  value       = aws_subnet.private[*].id
}

output "private_subnet_cidrs" {
  description = "List of private subnet CIDR blocks"
  value       = aws_subnet.private[*].cidr_block
}

output "private_subnets_by_az" {
  description = "Map of private subnets by availability zone"
  value = {
    for subnet in aws_subnet.private : subnet.availability_zone => subnet.id
  }
}

# Database Subnets
output "database_subnet_ids" {
  description = "List of database subnet IDs (for RDS/ElastiCache)"
  value       = aws_subnet.database[*].id
}

output "database_subnet_cidrs" {
  description = "List of database subnet CIDR blocks"
  value       = aws_subnet.database[*].cidr_block
}

output "database_subnets_by_az" {
  description = "Map of database subnets by availability zone"
  value = {
    for subnet in aws_subnet.database : subnet.availability_zone => subnet.id
  }
}

# Subnet Groups
output "db_subnet_group_name" {
  description = "DB Subnet Group name for RDS"
  value       = aws_db_subnet_group.main.name
}

output "elasticache_subnet_group_name" {
  description = "ElastiCache Subnet Group name for Redis"
  value       = aws_elasticache_subnet_group.main.name
}

# NAT Gateways
output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = aws_nat_gateway.main[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IPs of NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

output "nat_gateway_count" {
  description = "Number of NAT Gateways deployed"
  value       = var.single_nat_gateway ? 1 : 3
}

# Route Tables
output "public_route_table_id" {
  description = "Public Route Table ID"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "List of private Route Table IDs"
  value       = aws_route_table.private[*].id
}

output "database_route_table_id" {
  description = "Database Route Table ID"
  value       = aws_route_table.database.id
}

# Availability Zones
output "availability_zones" {
  description = "List of availability zones in use"
  value       = data.aws_availability_zones.available.names
}

# VPC Flow Logs
output "flow_logs_group_name" {
  description = "CloudWatch Log Group for VPC Flow Logs"
  value       = var.enable_flow_logs ? aws_cloudwatch_log_group.flow_logs[0].name : null
}

output "flow_logs_group_arn" {
  description = "CloudWatch Log Group ARN for VPC Flow Logs"
  value       = var.enable_flow_logs ? aws_cloudwatch_log_group.flow_logs[0].arn : null
}

# Security Groups (consumed by EKS, RDS, ElastiCache, ALB modules)
output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "eks_nodes_security_group_id" {
  description = "EKS nodes security group ID"
  value       = aws_security_group.eks_nodes.id
}

output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}

output "vpc_endpoints_security_group_id" {
  description = "VPC endpoints security group ID"
  value       = aws_security_group.vpc_endpoints.id
}
