# IAM configuration for EKS cluster and node groups

# ──────────────────────────────────────────────
# Cluster IAM Role
# ──────────────────────────────────────────────

data "aws_iam_policy_document" "cluster_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name_prefix            = "${var.cluster_name}-cluster-"
  assume_role_policy     = data.aws_iam_policy_document.cluster_assume_role.json
  permissions_boundary   = null
  force_detach_policies  = true

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-cluster-role"
  })
}

# Attach required policies to cluster role
resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSVPCResourceController" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.cluster.name
}

# ──────────────────────────────────────────────
# Node Group IAM Role
# ──────────────────────────────────────────────

data "aws_iam_policy_document" "node_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node_group" {
  name_prefix            = "${var.cluster_name}-node-"
  assume_role_policy     = data.aws_iam_policy_document.node_assume_role.json
  permissions_boundary   = null
  force_detach_policies  = true

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-node-role"
  })
}

# Attach required policies to node group role
resource "aws_iam_role_policy_attachment" "node_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEC2ContainerRegistryReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

# Optional: Allow nodes to push logs to CloudWatch and metrics to CloudWatch
resource "aws_iam_role_policy_attachment" "node_CloudWatchAgentServerPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  role       = aws_iam_role.node_group.name
}

# Optional: Allow SSM Session Manager access for debugging nodes
resource "aws_iam_role_policy_attachment" "node_AmazonSSMManagedInstanceCore" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.node_group.name
}

# ──────────────────────────────────────────────
# IRSA (IAM Roles for Service Accounts) — OIDC Provider
# ──────────────────────────────────────────────

# Extract OIDC issuer URL from EKS cluster (created in main.tf)
locals {
  oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}"
}

data "aws_caller_identity" "current" {}

# Create OIDC provider for IRSA (required for service account to assume IAM roles)
resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-irsa"
  })

  depends_on = [aws_eks_cluster.main]
}

# Fetch the TLS certificate from the OIDC endpoint
data "tls_certificate" "cluster" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer

  depends_on = [aws_eks_cluster.main]
}

# ──────────────────────────────────────────────
# Example: AWS Load Balancer Controller Service Account Role
# (This is a common IRSA use case — can be expanded)
# ──────────────────────────────────────────────

data "aws_iam_policy_document" "aws_load_balancer_controller_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "aws_load_balancer_controller" {
  name_prefix        = "${var.cluster_name}-alb-controller-"
  assume_role_policy = data.aws_iam_policy_document.aws_load_balancer_controller_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-alb-controller-role"
  })
}

# Policy for AWS Load Balancer Controller (ALB/NLB)
resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  # This would require the ALB controller policy document
  # For now, we attach a minimal policy — in production, use the full AWSLoadBalancerControllerIAMPolicy
  role       = aws_iam_role.aws_load_balancer_controller.name
  policy_arn = aws_iam_policy.aws_load_balancer_controller.arn
}

resource "aws_iam_policy" "aws_load_balancer_controller" {
  name_prefix = "${var.cluster_name}-alb-controller-"
  policy      = data.aws_iam_policy_document.aws_load_balancer_controller_policy.json

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-alb-controller-policy"
  })
}

# Minimal ALB controller policy (production should use the full AWS managed policy)
data "aws_iam_policy_document" "aws_load_balancer_controller_policy" {
  statement {
    actions = [
      "elbv2:CreateLoadBalancer",
      "elbv2:DeleteLoadBalancer",
      "elbv2:DescribeLoadBalancers",
      "elbv2:DescribeTargetGroups",
      "elbv2:ModifyLoadBalancerAttributes",
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
    ]
    resources = ["*"]
  }
}

# ──────────────────────────────────────────────
# Example: EBS CSI Driver Service Account Role
# ──────────────────────────────────────────────

data "aws_iam_policy_document" "ebs_csi_driver_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ebs_csi_driver" {
  name_prefix        = "${var.cluster_name}-ebs-csi-"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_driver_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-ebs-csi-role"
  })
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi_driver.name
}
