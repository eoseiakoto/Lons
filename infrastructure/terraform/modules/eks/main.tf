# EKS Cluster and Node Group Configuration

# ──────────────────────────────────────────────
# CloudWatch Log Group for EKS Cluster Logging
# ──────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "eks_cluster" {
  count             = var.enable_logging ? 1 : 0
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-logs"
  })
}

# ──────────────────────────────────────────────
# KMS Key for EKS Cluster Encryption (optional)
# ──────────────────────────────────────────────

resource "aws_kms_key" "eks" {
  count                   = var.kms_key_id == "" ? 1 : 0
  description             = "KMS key for EKS cluster ${var.cluster_name} encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-key"
  })
}

resource "aws_kms_alias" "eks" {
  count         = var.kms_key_id == "" ? 1 : 0
  name          = "alias/${var.cluster_name}"
  target_key_id = aws_kms_key.eks[0].key_id
}

# ──────────────────────────────────────────────
# EKS Cluster
# ──────────────────────────────────────────────

resource "aws_eks_cluster" "main" {
  name            = var.cluster_name
  role_arn        = aws_iam_role.cluster.arn
  version         = var.cluster_version
  enabled_cluster_log_types = var.enable_logging ? ["api", "audit", "authenticator", "controllerManager", "scheduler"] : []

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = var.endpoint_private_access
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.public_access_cidrs
  }

  # Enable control plane encryption using KMS
  encryption_config {
    provider {
      key_arn = var.kms_key_id != "" ? var.kms_key_id : aws_kms_key.eks[0].arn
    }
    resources = ["secrets"]
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.cluster_AmazonEKSVPCResourceController,
    aws_cloudwatch_log_group.eks_cluster,
  ]

  tags = merge(var.tags, {
    Name = var.cluster_name
  })
}

# ──────────────────────────────────────────────
# EKS Managed Node Group
# ──────────────────────────────────────────────

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.cluster_name}-node-group"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.private_subnet_ids
  version         = var.cluster_version

  scaling_config {
    desired_size = var.desired_nodes
    max_size     = var.max_nodes
    min_size     = var.min_nodes
  }

  update_config {
    max_unavailable_percentage = 25
  }

  instance_types = var.instance_types
  capacity_type  = var.capacity_type


  labels = {
    Environment = var.environment
    Project     = var.project_name
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-node-group"
  })

  depends_on = [
    aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.node_AmazonEC2ContainerRegistryReadOnly,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

# ──────────────────────────────────────────────
# EKS Cluster Addons
# ──────────────────────────────────────────────

# VPC CNI (networking)
resource "aws_eks_addon" "vpc_cni" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "vpc-cni"
  addon_version            = data.aws_eks_addon_version.vpc_cni.version
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
  service_account_role_arn = aws_iam_role.node_group.arn

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-vpc-cni"
  })

  depends_on = [aws_eks_node_group.main]
}

# CoreDNS (DNS resolution)
resource "aws_eks_addon" "coredns" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "coredns"
  addon_version     = data.aws_eks_addon_version.coredns.version
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-coredns"
  })

  depends_on = [aws_eks_node_group.main]
}

# Kube-proxy (network proxy)
resource "aws_eks_addon" "kube_proxy" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "kube-proxy"
  addon_version     = data.aws_eks_addon_version.kube_proxy.version
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-kube-proxy"
  })

  depends_on = [aws_eks_node_group.main]
}

# AWS EBS CSI Driver (for persistent volumes)
resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  addon_version            = data.aws_eks_addon_version.ebs_csi_driver.version
  service_account_role_arn = aws_iam_role.ebs_csi_driver.arn
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-ebs-csi"
  })

  depends_on = [aws_eks_node_group.main]
}

# ──────────────────────────────────────────────
# Data sources for addon versions (always latest compatible)
# ──────────────────────────────────────────────

data "aws_eks_addon_version" "vpc_cni" {
  addon_name             = "vpc-cni"
  kubernetes_version     = aws_eks_cluster.main.version
  most_recent            = true
}

data "aws_eks_addon_version" "coredns" {
  addon_name             = "coredns"
  kubernetes_version     = aws_eks_cluster.main.version
  most_recent            = true
}

data "aws_eks_addon_version" "kube_proxy" {
  addon_name             = "kube-proxy"
  kubernetes_version     = aws_eks_cluster.main.version
  most_recent            = true
}

data "aws_eks_addon_version" "ebs_csi_driver" {
  addon_name             = "aws-ebs-csi-driver"
  kubernetes_version     = aws_eks_cluster.main.version
  most_recent            = true
}

# ──────────────────────────────────────────────
# Security Group for cluster (VPC module already provides this via vpc_config)
# This is for documentation and any additional ingress rules
# ──────────────────────────────────────────────

resource "aws_security_group_rule" "cluster_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}
