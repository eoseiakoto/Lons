# Lōns Terraform Infrastructure

Infrastructure-as-Code for the Lōns platform, supporting multi-environment deployment (dev, staging, preprod, prod) on AWS with Kubernetes (EKS), PostgreSQL (RDS), and Redis (ElastiCache).

## Structure

```
terraform/
├── backend.tf              # S3 + DynamoDB backend config (partial configuration pattern)
├── provider.tf             # AWS provider with default tags
├── versions.tf             # Provider and Terraform version constraints
├── variables.tf            # Root variables and inputs
├── locals.tf               # Local values, environment mappings, data sources
├── main.tf                 # Module composition (VPC, EKS, RDS, ElastiCache, S3, ALB)
├── outputs.tf              # Root outputs
├── README.md               # This file
├── environments/
│   ├── dev.tfvars          # Development environment variables
│   ├── staging.tfvars      # Staging environment variables
│   ├── preprod.tfvars      # Pre-production environment variables
│   └── prod.tfvars         # Production environment variables
└── modules/
    ├── vpc/                # VPC, subnets, security groups, NAT gateways
    ├── eks/                # EKS cluster, node groups, IAM roles
    ├── rds/                # RDS PostgreSQL instance with backups
    ├── elasticache/        # ElastiCache Redis cluster
    ├── s3/                 # S3 buckets for document storage
    └── alb/                # Application Load Balancer, Route53, WAF
```

## Prerequisites

1. **AWS Account** with appropriate permissions (AdministratorAccess or equivalent)
2. **Terraform** >= 1.5.0
3. **AWS CLI** configured with valid credentials
4. **kubectl** for EKS cluster access
5. **Route53 Hosted Zone** for `lons.io` already created in the AWS account

## Initial Setup

### 1. Create S3 Backend Bucket and DynamoDB Table

Before initializing Terraform, create the backend storage:

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket "lons-terraform-state-${AWS_ACCOUNT_ID}" \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Enable versioning on the bucket
aws s3api put-bucket-versioning \
  --bucket "lons-terraform-state-${AWS_ACCOUNT_ID}" \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket "lons-terraform-state-${AWS_ACCOUNT_ID}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name lons-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-west-1
```

### 2. Initialize Terraform

```bash
# Set your environment (dev, staging, preprod, or prod)
ENVIRONMENT=dev

# Initialize Terraform with remote backend
terraform init \
  -backend-config="bucket=lons-terraform-state-${AWS_ACCOUNT_ID}" \
  -backend-config="key=environments/${ENVIRONMENT}/terraform.tfstate" \
  -backend-config="region=eu-west-1" \
  -backend-config="dynamodb_table=lons-terraform-locks" \
  -backend-config="encrypt=true"

# Create and select workspace for environment
terraform workspace new ${ENVIRONMENT} 2>/dev/null || terraform workspace select ${ENVIRONMENT}
```

## Usage

### Plan Changes

```bash
# For a specific environment
terraform plan -var-file="environments/dev.tfvars" -out=plan.out

# Or using environment variable
TF_VAR_environment=dev terraform plan
```

### Apply Changes

```bash
# Apply changes
terraform apply plan.out

# Or directly (with confirmation prompt)
terraform apply -var-file="environments/dev.tfvars"
```

### Destroy Infrastructure

```bash
# For development or staging only
terraform destroy -var-file="environments/dev.tfvars"

# Production destruction requires additional safeguards — consult runbook
```

### Access EKS Cluster

```bash
# Update kubeconfig after EKS creation
aws eks update-kubeconfig \
  --name lons-dev \
  --region eu-west-1

# Verify cluster access
kubectl cluster-info
kubectl get nodes
```

## Module Details

### VPC
- Multi-AZ setup across 3 availability zones
- Public and private subnets
- NAT Gateway for private subnet egress (configurable per environment)
- Network ACLs and security group templates

### EKS
- Managed Kubernetes cluster
- Auto-scaling node groups with spot instances (dev) or on-demand (prod)
- RBAC and IAM roles for workload identity
- Container insights logging

### RDS
- PostgreSQL 16+
- Multi-AZ deployment (production)
- Automated backups with configurable retention
- Enhanced monitoring
- Encryption at rest

### ElastiCache
- Redis cluster mode enabled (production)
- Automatic failover
- Parameter groups and subnet groups
- Encryption in transit and at rest

### S3
- Document storage bucket
- Versioning and lifecycle policies
- Server-side encryption
- Access logging

### ALB
- Application Load Balancer
- TLS termination
- Route53 DNS integration
- Optional WAF (Web Application Firewall)
- Health checks for target groups

## Environment-Specific Configuration

Each environment (dev, staging, preprod, prod) has a dedicated `.tfvars` file with appropriate resource sizing:

| Aspect | Dev | Staging | Preprod | Prod |
|---|---|---|---|---|
| EKS Nodes | 2 (spot) | 3 (on-demand) | 3 (on-demand) | 5 (on-demand) |
| RDS Instance | t4g.micro | t4g.small | r6g.large | r6g.xlarge |
| RDS Multi-AZ | No | Yes | Yes | Yes |
| Redis Nodes | 1 | 2 | 3 | 3 |
| Backup Retention | 7 days | 14 days | 30 days | 90 days |
| WAF | Disabled | Enabled | Enabled | Enabled |

## State Management

Terraform state is stored remotely in S3 with DynamoDB locking:

- **Bucket**: `lons-terraform-state-{ACCOUNT_ID}`
- **Key**: `environments/{ENVIRONMENT}/terraform.tfstate`
- **Locking Table**: `lons-terraform-locks`
- **Encryption**: AES256

State files contain sensitive information (database passwords, API keys). **Never commit `.tfstate` files to version control.**

## Common Tasks

### Scale EKS Cluster

Edit the relevant `.tfvars` file:

```bash
# Update environment/dev.tfvars
eks_desired_nodes = 5   # Change desired node count
terraform apply -var-file="environments/dev.tfvars"
```

### Update RDS Instance Class

```bash
terraform apply -var-file="environments/staging.tfvars" -var="rds_instance_class=db.r6g.large"
```

### Rotate Database Credentials

Database credentials are managed via AWS Secrets Manager. Rotation is configured automatically in production environments. To manually rotate:

```bash
# Retrieve current password from Secrets Manager
aws secretsmanager get-secret-value --secret-id lons-rds-master-password

# Rotate secret (AWS manages password change)
aws secretsmanager rotate-secret --secret-id lons-rds-master-password
```

### Backup and Restore

RDS automated backups are enabled for all environments. To create a manual snapshot:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier lons-prod \
  --db-snapshot-identifier lons-prod-manual-$(date +%Y%m%d)
```

## Monitoring and Logging

- **CloudWatch**: Logs for EKS, RDS, ElastiCache
- **Container Insights**: EKS cluster and node performance
- **RDS Enhanced Monitoring**: Database performance metrics
- **VPC Flow Logs**: Network traffic analysis (optional)

Retention periods are configured per environment (7 days dev → 90 days prod).

## Security Considerations

1. **State File**: Stored encrypted in S3 with versioning and locking
2. **Secrets**: Database passwords, API keys stored in AWS Secrets Manager
3. **Network**: RDS and Redis in private subnets, no public internet access
4. **Encryption**: All data encrypted at rest and in transit
5. **IAM**: Least-privilege roles for services
6. **WAF**: Optional Web Application Firewall on ALB

## Troubleshooting

### "Resource already exists"

If Terraform fails due to existing resources, check if infrastructure was previously created:

```bash
# Import existing resource
terraform import aws_eks_cluster.main lons-dev
```

### "State lock timeout"

If a lock persists incorrectly, release it:

```bash
aws dynamodb delete-item \
  --table-name lons-terraform-locks \
  --key '{"LockID": {"S": "path/to/state"}}'
```

### Secrets Manager access issues

Ensure your IAM role has `secretsmanager:GetSecretValue` permissions:

```bash
aws iam attach-user-policy \
  --user-name terraform-user \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

## Disaster Recovery

### Snapshot and Restore RDS

```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier lons-prod \
  --db-snapshot-identifier lons-prod-backup-$(date +%s)

# Restore from snapshot to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier lons-prod-restored \
  --db-snapshot-identifier lons-prod-backup-{timestamp}
```

### Rebuild from State

Terraform state can be regenerated if lost (though backups are critical):

```bash
# Refresh state
terraform refresh -var-file="environments/prod.tfvars"
```

## Further Documentation

- Deployment requirements: `/Docs/13-deployment.md`
- AWS provider documentation: https://registry.terraform.io/providers/hashicorp/aws/latest
- Terraform best practices: https://www.terraform.io/docs/cloud/guides/recommended-practices
