# ──────────────────────────────────────────────────────────────────────────────
# GitHub OIDC Provider & IAM Roles for Keyless AWS Authentication
# ──────────────────────────────────────────────────────────────────────────────
# Enables GitHub Actions workflows to assume AWS roles without storing credentials.
# Trust policy restricts access to the Lōns repository with environment conditions.

# ──────────────────────────────────────────────────────────────────────────────
# GitHub OIDC Provider
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.common_tags
}

# ──────────────────────────────────────────────────────────────────────────────
# IAM Roles for Each Environment
# ──────────────────────────────────────────────────────────────────────────────
# Each environment has its own role with environment-specific conditions.
# Sprint 4: Permissions will be scoped down from AdministratorAccess.

locals {
  github_repo = "eoseiakoto/Lons"
}

# ──────────────────────────────────────────────────────────────────────────────
# Dev Environment Role
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "github_dev" {
  name_prefix = "lons-github-dev-"
  tags        = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:environment:dev"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_dev_admin" {
  role       = aws_iam_role.github_dev.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ──────────────────────────────────────────────────────────────────────────────
# Staging Environment Role
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "github_staging" {
  name_prefix = "lons-github-staging-"
  tags        = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:environment:staging"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_staging_admin" {
  role       = aws_iam_role.github_staging.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ──────────────────────────────────────────────────────────────────────────────
# Preprod Environment Role
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "github_preprod" {
  name_prefix = "lons-github-preprod-"
  tags        = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:environment:preprod"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_preprod_admin" {
  role       = aws_iam_role.github_preprod.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ──────────────────────────────────────────────────────────────────────────────
# Production Environment Role
# ──────────────────────────────────────────────────────────────────────────────
# NOTE: Production role uses AdministratorAccess for now but should be scoped down
# in Sprint 4 to least-privilege permissions (e.g., read-only + specific services).

resource "aws_iam_role" "github_prod" {
  name_prefix = "lons-github-prod-"
  tags        = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${local.github_repo}:environment:prod"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_prod_admin" {
  role       = aws_iam_role.github_prod.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ──────────────────────────────────────────────────────────────────────────────
# Outputs — IAM Role ARNs for GitHub Secrets
# ──────────────────────────────────────────────────────────────────────────────
# These ARNs must be stored as GitHub repository secrets:
#
#   - AWS_ROLE_ARN_DEV     → ARN of lons-github-dev-* role
#   - AWS_ROLE_ARN_STAGING → ARN of lons-github-staging-* role
#   - AWS_ROLE_ARN_PREPROD → ARN of lons-github-preprod-* role
#   - AWS_ROLE_ARN_PROD    → ARN of lons-github-prod-* role
#   - AWS_ACCOUNT_ID       → AWS account ID
#
# GitHub Actions workflow (terraform.yml) uses these secrets to assume roles:
#
#   - uses: aws-actions/configure-aws-credentials@v4
#     with:
#       role-to-assume: ${{ secrets[format('AWS_ROLE_ARN_{0}', matrix.environment)] }}
#       aws-region: eu-west-1
#
# See: .github/workflows/terraform.yml (lines 67-72, 161-166)

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "github_dev_role_arn" {
  description = "ARN of the GitHub Dev environment role (for AWS_ROLE_ARN_DEV secret)"
  value       = aws_iam_role.github_dev.arn
}

output "github_staging_role_arn" {
  description = "ARN of the GitHub Staging environment role (for AWS_ROLE_ARN_STAGING secret)"
  value       = aws_iam_role.github_staging.arn
}

output "github_preprod_role_arn" {
  description = "ARN of the GitHub Preprod environment role (for AWS_ROLE_ARN_PREPROD secret)"
  value       = aws_iam_role.github_preprod.arn
}

output "github_prod_role_arn" {
  description = "ARN of the GitHub Prod environment role (for AWS_ROLE_ARN_PROD secret)"
  value       = aws_iam_role.github_prod.arn
}

output "aws_account_id" {
  description = "AWS account ID (for AWS_ACCOUNT_ID secret)"
  value       = data.aws_caller_identity.current.account_id
}

# ──────────────────────────────────────────────────────────────────────────────
# Setup Instructions for GitHub
# ──────────────────────────────────────────────────────────────────────────────
#
# 1. Run Terraform to create the OIDC provider and roles:
#    $ terraform plan
#    $ terraform apply
#
# 2. Copy the outputs (use: terraform output -json)
#
# 3. Add GitHub repository secrets:
#    Repository → Settings → Secrets and variables → Actions → New repository secret
#
#    Add these secrets:
#    - AWS_ROLE_ARN_DEV     (from github_dev_role_arn output)
#    - AWS_ROLE_ARN_STAGING (from github_staging_role_arn output)
#    - AWS_ROLE_ARN_PREPROD (from github_preprod_role_arn output)
#    - AWS_ROLE_ARN_PROD    (from github_prod_role_arn output)
#    - AWS_ACCOUNT_ID       (from aws_account_id output)
#
# 4. Verify the GitHub Actions workflow uses these secrets:
#    See .github/workflows/terraform.yml (lines 67-72, 161-166)
#
# 5. Test a workflow run:
#    - Push a change to infrastructure/terraform/** on main branch
#    - Watch GitHub Actions → Terraform workflow
#    - Verify it successfully assumes the role and plans/applies Terraform
#
# Security Notes:
# - The OIDC provider restricts access to the specific GitHub repository (eoseiakoto/Lons)
# - Tokens can only be issued for workflows running in that repository
# - Each environment (dev, staging, preprod, prod) has a separate role with environment conditions
# - This prevents lateral movement between environments if a GitHub secret is compromised
# - Sprint 4: Reduce AdministratorAccess to least-privilege permissions per environment
