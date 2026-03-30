# Security Groups for Lōns Platform
# Implements network segmentation and least-privilege access

# ALB Security Group (inbound: 80, 443 from internet)
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  description = "Security group for Application Load Balancer - allows HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-sg-alb-${var.environment}"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id

  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow HTTP from anywhere"
  tags = {
    Name = "allow-http"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id

  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow HTTPS from anywhere"
  tags = {
    Name = "allow-https"
  }
}

resource "aws_vpc_security_group_egress_rule" "alb_egress" {
  security_group_id = aws_security_group.alb.id

  from_port   = 0
  to_port     = 65535
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow all outbound traffic"
  tags = {
    Name = "allow-all-egress"
  }
}

# EKS Nodes Security Group
resource "aws_security_group" "eks_nodes" {
  name_prefix = "${var.project_name}-eks-nodes-"
  description = "Security group for EKS worker nodes"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-sg-eks-nodes-${var.environment}"
    }
  )
}

# EKS Nodes: Allow inbound from ALB
resource "aws_vpc_security_group_ingress_rule" "eks_from_alb" {
  security_group_id = aws_security_group.eks_nodes.id

  from_port                    = 0
  to_port                      = 65535
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id

  description = "Allow all TCP from ALB"
  tags = {
    Name = "allow-from-alb"
  }
}

# EKS Nodes: Allow inbound from other nodes (pod-to-pod communication)
resource "aws_vpc_security_group_ingress_rule" "eks_node_to_node" {
  security_group_id = aws_security_group.eks_nodes.id

  from_port                    = 0
  to_port                      = 65535
  ip_protocol                  = "-1"
  referenced_security_group_id = aws_security_group.eks_nodes.id

  description = "Allow all traffic between nodes (pod networking)"
  tags = {
    Name = "allow-node-to-node"
  }
}

# EKS Nodes: Allow all outbound
resource "aws_vpc_security_group_egress_rule" "eks_nodes_egress" {
  security_group_id = aws_security_group.eks_nodes.id

  from_port   = 0
  to_port     = 65535
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow all outbound traffic"
  tags = {
    Name = "allow-all-egress"
  }
}

# RDS Security Group (PostgreSQL)
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  description = "Security group for PostgreSQL RDS database"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-sg-rds-${var.environment}"
    }
  )
}

# RDS: Allow inbound from EKS nodes on port 5432
resource "aws_vpc_security_group_ingress_rule" "rds_from_eks" {
  security_group_id = aws_security_group.rds.id

  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.eks_nodes.id

  description = "Allow PostgreSQL from EKS nodes"
  tags = {
    Name = "allow-from-eks-nodes"
  }
}

# RDS: Allow inbound from same SG (for replication)
resource "aws_vpc_security_group_ingress_rule" "rds_cluster_traffic" {
  security_group_id = aws_security_group.rds.id

  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.rds.id

  description = "Allow replication between RDS instances"
  tags = {
    Name = "allow-cluster-traffic"
  }
}

# RDS: Allow all outbound (for replication, backups)
resource "aws_vpc_security_group_egress_rule" "rds_egress" {
  security_group_id = aws_security_group.rds.id

  from_port   = 0
  to_port     = 65535
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow all outbound traffic"
  tags = {
    Name = "allow-all-egress"
  }
}

# Redis (ElastiCache) Security Group
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  description = "Security group for Redis ElastiCache cluster"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-sg-redis-${var.environment}"
    }
  )
}

# Redis: Allow inbound from EKS nodes on port 6379
resource "aws_vpc_security_group_ingress_rule" "redis_from_eks" {
  security_group_id = aws_security_group.redis.id

  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.eks_nodes.id

  description = "Allow Redis from EKS nodes"
  tags = {
    Name = "allow-from-eks-nodes"
  }
}

# Redis: Allow cluster communication
resource "aws_vpc_security_group_ingress_rule" "redis_cluster_traffic" {
  security_group_id = aws_security_group.redis.id

  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.redis.id

  description = "Allow cluster communication"
  tags = {
    Name = "allow-cluster-traffic"
  }
}

# Redis: Allow all outbound
resource "aws_vpc_security_group_egress_rule" "redis_egress" {
  security_group_id = aws_security_group.redis.id

  from_port   = 0
  to_port     = 65535
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow all outbound traffic"
  tags = {
    Name = "allow-all-egress"
  }
}

# VPC Endpoints Security Group
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${var.project_name}-vpc-endpoints-"
  description = "Security group for VPC Endpoints (ECR, STS, Secrets Manager, CloudWatch Logs)"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-sg-vpc-endpoints-${var.environment}"
    }
  )
}

# VPC Endpoints: Allow inbound HTTPS from private subnets
resource "aws_vpc_security_group_ingress_rule" "vpc_endpoints_from_private" {
  security_group_id = aws_security_group.vpc_endpoints.id

  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
  cidr_ipv4   = var.vpc_cidr

  description = "Allow HTTPS from VPC for endpoint access"
  tags = {
    Name = "allow-https-from-vpc"
  }
}

# VPC Endpoints: Allow all outbound
resource "aws_vpc_security_group_egress_rule" "vpc_endpoints_egress" {
  security_group_id = aws_security_group.vpc_endpoints.id

  from_port   = 0
  to_port     = 65535
  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  description = "Allow all outbound traffic"
  tags = {
    Name = "allow-all-egress"
  }
}
