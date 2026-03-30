# VPC Networking Module for Lōns Platform
# Production-grade VPC with multi-AZ subnets, NAT gateways, and VPC endpoints

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data source for available AZs
data "aws_availability_zones" "available" {
  state = "available"
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-vpc-${var.environment}"
    }
  )
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-igw-${var.environment}"
    }
  )
}

# Public Subnets (for ALB)
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.common_tags,
    {
      Name                                            = "${var.project_name}-public-subnet-${count.index + 1}-${var.environment}"
      "kubernetes.io/role/elb"                        = "1"
      "kubernetes.io/cluster/${var.cluster_name}"    = "shared"
    }
  )
}

# Private Subnets (for EKS worker nodes)
resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(
    var.common_tags,
    {
      Name                                            = "${var.project_name}-private-subnet-${count.index + 1}-${var.environment}"
      "kubernetes.io/role/internal-elb"              = "1"
      "kubernetes.io/cluster/${var.cluster_name}"   = "shared"
    }
  )
}

# Database Subnets (for RDS and ElastiCache)
resource "aws_subnet" "database" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.database_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-database-subnet-${count.index + 1}-${var.environment}"
    }
  )
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = var.single_nat_gateway ? 1 : 3
  domain = "vpc"

  depends_on = [aws_internet_gateway.main]

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-eip-nat-${count.index + 1}-${var.environment}"
    }
  )
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = var.single_nat_gateway ? 1 : 3
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  depends_on = [aws_internet_gateway.main]

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-nat-${count.index + 1}-${var.environment}"
    }
  )
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block      = "0.0.0.0/0"
    gateway_id      = aws_internet_gateway.main.id
  }

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-rt-public-${var.environment}"
    }
  )
}

# Public Route Table Associations
resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private Route Tables (one per AZ for NAT gateway isolation)
resource "aws_route_table" "private" {
  count  = var.single_nat_gateway ? 1 : 3
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-rt-private-${count.index + 1}-${var.environment}"
    }
  )
}

# Private Route Table Associations
resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = var.single_nat_gateway ? aws_route_table.private[0].id : aws_route_table.private[count.index].id
}

# Database Route Table (no internet gateway)
resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-rt-database-${var.environment}"
    }
  )
}

# Database Route Table Associations
resource "aws_route_table_association" "database" {
  count          = 3
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  count                   = var.enable_flow_logs ? 1 : 0
  iam_role_arn            = aws_iam_role.flow_logs[0].arn
  log_destination         = aws_cloudwatch_log_group.flow_logs[0].arn
  traffic_type            = "ALL"
  vpc_id                  = aws_vpc.main.id
  log_destination_type    = "cloud-watch-logs"
  log_format              = "$${version} $${account-id} $${interface-id} $${srcaddr} $${dstaddr} $${srcport} $${dstport} $${protocol} $${packets} $${bytes} $${windowstart} $${windowend} $${action} $${tcpflags} $${type} $${pkt-srcaddr} $${pkt-dstaddr} $${region} $${vpc-id} $${flow-logs-id} $${traffic-type} $${subnet-id} $${instance-id} $${interface-type} $${eni-id} $${local-gateway-route-table-id} $${tcp-flag}"

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-flow-logs-${var.environment}"
    }
  )
}

# CloudWatch Log Group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "flow_logs" {
  count             = var.enable_flow_logs ? 1 : 0
  name              = "/aws/vpc/flowlogs/${var.project_name}-${var.environment}"
  retention_in_days = var.flow_logs_retention_days

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-flow-logs-${var.environment}"
    }
  )
}

# IAM Role for VPC Flow Logs
resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.project_name}-flow-logs-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = var.common_tags
}

# IAM Policy for VPC Flow Logs
resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.project_name}-flow-logs-policy-${var.environment}"
  role  = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-db-subnet-group-${var.environment}"
  description = "Database subnet group for ${var.project_name} ${var.environment}"
  subnet_ids  = aws_subnet.database[*].id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-db-subnet-group-${var.environment}"
    }
  )
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-elasticache-subnet-group-${var.environment}"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(
    var.common_tags,
    {
      Name = "${var.project_name}-elasticache-subnet-group-${var.environment}"
    }
  )
}
