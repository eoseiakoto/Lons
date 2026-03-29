# AWS Resource Tagging Strategy

## Overview

This document defines the mandatory and optional tagging strategy for all AWS resources in the Lōns platform. Consistent tagging enables cost allocation, governance, automated resource management, and compliance tracking across all environments (dev, staging, preprod, prod).

**Key Principles:**
- Tags are enforced via AWS Config rules
- All Terraform-managed resources must include mandatory tags
- Cost reports are aggregated by CostCenter and Service tags
- PascalCase is used for tag keys (AWS convention)
- Tag values are lowercase except where noted

---

## Mandatory Tags

These tags **MUST** be applied to all AWS resources. Failure to apply mandatory tags will trigger AWS Config rule violations and block resource provisioning in production.

| Tag Key | Allowed Values | Purpose | Example |
|---------|---|---|---|
| `Project` | `lons` | Cost allocation and project identification | `Project=lons` |
| `Environment` | `dev`, `staging`, `preprod`, `prod` | Environment tier identification | `Environment=prod` |
| `ManagedBy` | `terraform`, `manual`, `helm` | Track provisioning method for drift detection | `ManagedBy=terraform` |
| `Service` | See service list below | Map resource to logical service component | `Service=graphql-server` |
| `Owner` | `deployment-engineer`, `dev-team`, `platform` | Accountability and escalation point | `Owner=deployment-engineer` |
| `CostCenter` | `dev`, `staging`, `preprod`, `prod`, `shared` | Cost allocation and budgeting | `CostCenter=prod` |

### Allowed Service Values

Use these exact values for the `Service` tag:

- `graphql-server` — NestJS GraphQL API
- `rest-server` — NestJS REST API
- `scheduler` — Cron job service (interest accrual, aging, reminders)
- `notification-worker` — BullMQ notification queue workers
- `scoring-service` — Python FastAPI credit scoring service
- `admin-portal` — Next.js admin/operations portal
- `database` — PostgreSQL RDS instance and related resources
- `cache` — Redis cluster
- `monitoring` — CloudWatch, Prometheus, Grafana, log aggregation
- `networking` — VPC, subnets, security groups, load balancers, NAT gateways
- `security` — KMS, Secrets Manager, IAM roles, WAF
- `storage` — S3 buckets (except Terraform state)
- `state` — Terraform state S3 bucket and DynamoDB lock table

---

## Optional Tags

These tags provide additional context and are strongly recommended but not enforced:

| Tag Key | Allowed Values | Purpose | Example |
|---------|---|---|---|
| `Backup` | `continuous`, `daily`, `weekly`, `none` | Backup schedule and retention | `Backup=continuous` |
| `Compliance` | `required`, `not-required` | Regulatory/compliance tracking | `Compliance=required` |
| `HA` | `required`, `not-required` | High availability requirement | `HA=required` |
| `DataClassification` | `public`, `internal`, `confidential`, `restricted` | Data sensitivity level | `DataClassification=restricted` |
| `Resettable` | `true`, `false` | Whether environment can be torn down and recreated | `Resettable=true` |

---

## Tagging by Resource Type

### Compute (EC2, ECS, Lambda)

**EC2 Instances (managed by Terraform):**
```hcl
tags = {
  Project         = "lons"
  Environment     = var.environment
  ManagedBy       = "terraform"
  Service         = "graphql-server"  # or appropriate service
  Owner           = "deployment-engineer"
  CostCenter      = var.cost_center
  Backup          = "daily"
  HA              = "required"
  DataClassification = "confidential"
}
```

**ECS Tasks/Services:**
```hcl
tags = [
  {
    key   = "Project"
    value = "lons"
  },
  {
    key   = "Environment"
    value = var.environment
  },
  {
    key   = "ManagedBy"
    value = "terraform"
  },
  {
    key   = "Service"
    value = "graphql-server"
  },
  {
    key   = "Owner"
    value = "deployment-engineer"
  },
  {
    key   = "CostCenter"
    value = var.cost_center
  }
]
```

**Lambda Functions:**
```hcl
tags = {
  Project     = "lons"
  Environment = var.environment
  ManagedBy   = "terraform"
  Service     = "notification-worker"
  Owner       = "dev-team"
  CostCenter  = var.cost_center
}
```

### Database & Cache

**RDS PostgreSQL:**
```hcl
tags = {
  Project              = "lons"
  Environment          = var.environment
  ManagedBy            = "terraform"
  Service              = "database"
  Owner                = "deployment-engineer"
  CostCenter           = var.cost_center
  Backup               = "continuous"
  HA                   = "required"
  DataClassification   = "restricted"
  Compliance           = "required"
}
```

**ElastiCache Redis:**
```hcl
tags = {
  Project             = "lons"
  Environment         = var.environment
  ManagedBy           = "terraform"
  Service             = "cache"
  Owner               = "deployment-engineer"
  CostCenter          = var.cost_center
  HA                  = "required"
  DataClassification  = "confidential"
}
```

### Storage (S3)

**Application S3 Buckets:**
```hcl
tags = {
  Project              = "lons"
  Environment          = var.environment
  ManagedBy            = "terraform"
  Service              = "storage"
  Owner                = "deployment-engineer"
  CostCenter           = var.cost_center
  DataClassification   = "confidential"
  Compliance           = "required"
}
```

**Terraform State Bucket:**
```hcl
tags = {
  Project   = "lons"
  ManagedBy = "terraform"
  Service   = "state"
  Owner     = "deployment-engineer"
}
```

### Networking

**VPC, Subnets, Security Groups, NAT Gateway:**
```hcl
tags = {
  Project         = "lons"
  Environment     = var.environment
  ManagedBy       = "terraform"
  Service         = "networking"
  Owner           = "deployment-engineer"
  CostCenter      = var.cost_center
  HA              = "required"
}
```

**Application Load Balancer:**
```hcl
tags = {
  Project      = "lons"
  Environment  = var.environment
  ManagedBy    = "terraform"
  Service      = "networking"
  Owner        = "deployment-engineer"
  CostCenter   = var.cost_center
  HA           = "required"
}
```

### Security

**KMS Keys:**
```hcl
tags = {
  Project              = "lons"
  Environment          = var.environment
  ManagedBy            = "terraform"
  Service              = "security"
  Owner                = "deployment-engineer"
  CostCenter           = var.cost_center
  DataClassification   = "restricted"
  Compliance           = "required"
}
```

**Secrets Manager Secrets:**
```hcl
tags = {
  Project              = "lons"
  Environment          = var.environment
  ManagedBy            = "terraform"
  Service              = "security"
  Owner                = "deployment-engineer"
  CostCenter           = var.cost_center
  DataClassification   = "restricted"
}
```

**IAM Roles, Policies:**
IAM resources do not support tags directly, but can be annotated via resource names following the pattern: `lons-<environment>-<service>-<role-type>`

### Monitoring

**CloudWatch Log Groups:**
```hcl
tags = {
  Project     = "lons"
  Environment = var.environment
  ManagedBy   = "terraform"
  Service     = "monitoring"
  Owner       = "dev-team"
  CostCenter  = var.cost_center
}
```

---

## Enforcement via AWS Config

The following AWS Config rule must be enabled in all environments:

**Rule Name:** `required-tags`
**Description:** Checks whether resources have all required tags

**Parameters:**
```json
{
  "requiredTagKeys": "Project,Environment,ManagedBy,Service,Owner,CostCenter"
}
```

**Scope:** All resources except:
- IAM resources (not supported)
- Terraform state bucket (minimal tagging acceptable)

**Remediation:** Non-compliant resources will be flagged in AWS Config dashboard and must be remediated within 24 hours.

---

## Cost Reporting

### Cost Explorer Grouping

1. **By CostCenter + Service:**
   - Dimension: Tag Keys (CostCenter, Service)
   - Metric: Unblended Cost
   - Time Range: Monthly
   - Output: CSV export for billing reconciliation

2. **By Environment:**
   - Dimension: Tag Key (Environment)
   - Metric: Unblended Cost
   - Time Range: Monthly
   - Output: Dashboard for stakeholder review

3. **By Owner:**
   - Dimension: Tag Key (Owner)
   - Metric: Unblended Cost
   - Time Range: Monthly
   - Output: Team-level cost accountability

### AWS Budget Configuration

**Budget Name:** `lons-<environment>-budget`
**Scope:** Filtered by tag: `Environment=<environment>` AND `Project=lons`
**Alerts:**
- 80% of threshold: SNS notification to deployment-engineer@lons.io
- 100% of threshold: SNS notification + disable auto-scaling (manual approval required)

---

## Terraform Implementation

All Terraform modules must include a `tags` local variable:

```hcl
locals {
  tags = {
    Project         = "lons"
    Environment     = var.environment
    ManagedBy       = "terraform"
    Service         = var.service_name
    Owner           = var.owner
    CostCenter      = var.cost_center
    Backup          = try(var.backup_schedule, null)
    Compliance      = try(var.compliance_required, null)
    HA              = try(var.ha_required, null)
    DataClassification = try(var.data_classification, null)
    Resettable      = try(var.is_resettable, null)
  }
}
```

All resources apply tags via `tags = merge(local.tags, try(var.additional_tags, {}))`.

---

## Tag Cleanup & Governance

**Monthly Audit:**
- Run AWS Config query to identify untagged or non-compliant resources
- Generate report and assign to Owner tag for remediation
- Document exceptions in change log

**Deprecation Policy:**
- If a tag key falls out of use, it must be marked as deprecated in this document for 90 days
- After 90 days, deprecated tags may be removed via Terraform code
- Removal must be approved by deployment-engineer and platform-team

---

## Reference

- AWS Tagging Best Practices: https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html
- AWS Config Rules: https://docs.aws.amazon.com/config/latest/developerguide/managed-rules-by-aws-config.html
- Terraform AWS Provider Tagging: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
