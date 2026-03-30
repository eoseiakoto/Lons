# AWS Account Setup Runbook

## Overview

This runbook provides step-by-step instructions for initializing a new (or verifying an existing) AWS account for the Lōns platform. This is a prerequisite for all infrastructure deployment via Terraform.

**Scope:** AWS account creation, root account security, IAM setup, billing/cost management, CloudTrail, and Terraform state bootstrap
**Duration:** 1–2 hours (mostly waiting for propagation)
**Owner:** Deployment Engineer
**Frequency:** One-time setup per AWS account

---

## Prerequisites

- **Email address:** Dedicated AWS account owner email (recommended: `aws-admin@lons.io` or similar)
- **AWS CLI:** Version 2.x installed and configured (https://aws.amazon.com/cli/)
- **AWS credentials:** Temporary root credentials or existing admin user access
- **MFA device:** Hardware security key (YubiKey 5, Google Titan, etc.) strongly recommended for root account
- **Terraform:** Version 1.5+ installed locally for final state bootstrap

---

## Step 1: AWS Account Creation or Verification

**Objective:** Establish or verify the AWS account for Lōns.

### If Creating a New AWS Account

1. Go to https://aws.amazon.com/
2. Click **Create an AWS Account**
3. Enter email address (use `lons-aws-admin@gmail.com` or organization domain)
4. Choose a strong password (14+ characters, upper/lowercase, symbols, numbers)
5. Complete account setup with company details
6. Add payment method (credit/debit card required)
7. Verify email and phone number
8. Select **Business** support plan (recommended for production)

### If Using Existing AWS Account

1. Log in to AWS Console at https://console.aws.amazon.com/
2. Click account dropdown (top-right) → **Account**
3. Note the **Account ID** (12-digit number)
4. Verify account status is **Active**

### Expected Output

- AWS Console accessible
- Account ID known (e.g., `123456789012`)
- Billing information valid and payment method confirmed

### Save This Information

```
AWS Account ID: ________________
Email: ________________
Primary Region: eu-west-1 (Ireland)
DR Region: eu-west-2 (London)
```

---

## Step 2: Root Account Security Hardening

**Objective:** Secure the root account to prevent unauthorized access.

### 2a. Enable MFA on Root Account

**Important:** Do NOT skip MFA. Root account compromise is critical.

#### For Hardware Security Key (Recommended)

1. Log in as root using email and password
2. Click account dropdown (top-right) → **Account**
3. Under **AWS Account** section, find **Security credentials**
4. Click **Edit MFA device**
5. Select **MFA device type** → **U2F Security Key**
6. Insert and follow on-screen prompts for your hardware key
7. Confirm by pressing button on security key

#### For Virtual MFA (Authenticator App)

1. From **Edit MFA device**, select **Authenticator app**
2. Scan QR code with Google Authenticator, Authy, or Microsoft Authenticator
3. Enter 6-digit code from app
4. Confirm setup

### Expected Output

- MFA device shows as "Enabled"
- Backup codes generated (save in secure password manager)

---

### 2b. Create IAM Admin User (for daily operations)

**Important:** Do NOT use root account for daily development/operational tasks.

```bash
# Set up AWS CLI credentials (if not already done)
aws configure

# Enter:
# AWS Access Key ID: [root access key from AWS Console]
# AWS Secret Access Key: [root secret key]
# Default region: eu-west-1
# Default output format: json
```

**Create IAM admin user programmatically:**

```bash
# Create user
aws iam create-user --user-name lons-admin

# Create access key for programmatic access
aws iam create-access-key --user-name lons-admin

# Save the AccessKeyId and SecretAccessKey (will NOT be shown again)
```

**Attach AdministratorAccess policy:**

```bash
aws iam attach-user-policy \
  --user-name lons-admin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

**Create console login password:**

```bash
# Generate temporary password
aws iam create-login-profile \
  --user-name lons-admin \
  --password 'TempPassword!123456' \
  --password-reset-required
```

**Expected Output:**

- IAM user `lons-admin` created
- Access key and secret key generated
- AdministratorAccess policy attached

### 2c. Set Strong Password Policy

```bash
aws iam update-account-password-policy \
  --minimum-password-length 14 \
  --require-symbols \
  --require-numbers \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --allow-users-to-change-password \
  --expire-passwords
```

**Expected Output:**

```
Password policy updated successfully
```

---

## Step 3: IAM Setup for Terraform and CI/CD

**Objective:** Create IAM roles and policies for Infrastructure-as-Code automation.

### 3a. Create Terraform Admin Role

This role is used by Terraform to provision all AWS resources.

```bash
# Create trust policy document
cat > /tmp/terraform-trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:user/lons-admin"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "terraform-deployment-role"
        }
      }
    }
  ]
}
EOF

# Replace ACCOUNT_ID with actual account ID (e.g., 123456789012)
sed -i 's/ACCOUNT_ID/123456789012/g' /tmp/terraform-trust-policy.json

# Create role
aws iam create-role \
  --role-name lons-terraform-admin \
  --assume-role-policy-document file:///tmp/terraform-trust-policy.json \
  --description "Role for Terraform to provision Lōns infrastructure"

# Attach AdministratorAccess policy
aws iam attach-role-policy \
  --role-name lons-terraform-admin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

**Expected Output:**

- Role `lons-terraform-admin` created
- Trust relationship established with `lons-admin` user
- AdministratorAccess attached

### 3b. Create GitHub Actions OIDC Role (for CI/CD in Sprint 2)

This allows GitHub Actions to assume a role without managing long-lived credentials.

```bash
# Create OIDC identity provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create trust policy for GitHub
cat > /tmp/github-trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:lons-platform/lons:ref:refs/heads/main"
        }
      }
    }
  ]
}
EOF

sed -i 's/ACCOUNT_ID/123456789012/g' /tmp/github-trust-policy.json

# Create role
aws iam create-role \
  --role-name lons-github-actions \
  --assume-role-policy-document file:///tmp/github-trust-policy.json \
  --description "Role for GitHub Actions to deploy Lōns infrastructure"

# Attach policy (will be restricted to specific actions in Sprint 2)
aws iam attach-role-policy \
  --role-name lons-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

**Expected Output:**

- OIDC provider created
- Role `lons-github-actions` created
- Trust relationship configured for GitHub

---

### 3c. Create Terraform State Access Policy

This policy is for the S3 state bucket and DynamoDB lock table.

```bash
# Create policy document
cat > /tmp/terraform-state-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::lons-terraform-state-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::lons-terraform-state-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/lons-terraform-locks"
    }
  ]
}
EOF

# Create policy
aws iam create-policy \
  --policy-name lons-terraform-state-access \
  --policy-document file:///tmp/terraform-state-policy.json \
  --description "Policy for Terraform state backend access"
```

**Expected Output:**

- Policy `lons-terraform-state-access` created with ARN

---

## Step 4: Billing & Cost Management

**Objective:** Set up monitoring and alerts for AWS spending.

### 4a. Enable Cost Explorer

```bash
# Cost Explorer cannot be enabled via CLI; must use AWS Console
# 1. Log in to AWS Console as lons-admin
# 2. Go to Billing Dashboard → Billing Preferences
# 3. Under "Cost Management Preferences," check "Receive Billing Alerts"
# 4. Save preferences
```

**Expected Output:**

- Billing Preferences saved
- "Receive Billing Alerts" is enabled

### 4b. Create AWS Budget

```bash
# Create SNS topic for alerts
aws sns create-topic --name lons-billing-alerts

# Save the TopicArn output (will look like: arn:aws:sns:eu-west-1:123456789012:lons-billing-alerts)
TOPIC_ARN="arn:aws:sns:eu-west-1:123456789012:lons-billing-alerts"

# Subscribe email to topic
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "deployment-engineer@lons.io"

# Confirm subscription in email when it arrives

# Create budget for prod environment
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file:///tmp/budget-prod.json \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{
      "SubscriptionType": "SNS",
      "Address": "'$TOPIC_ARN'"
    }]
  }]'
```

**Budget definition file (`/tmp/budget-prod.json`):**

```json
{
  "BudgetName": "lons-prod-budget",
  "BudgetLimit": {
    "Amount": "5000",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKeyValue": ["Project$lons", "Environment$prod"]
  }
}
```

**Expected Output:**

- SNS topic created
- Email subscription pending (confirm in inbox)
- Budget created with alerts at 80% and 100% thresholds

---

## Step 5: CloudTrail Setup

**Objective:** Enable comprehensive audit logging for all AWS API calls.

### 5a. Create S3 Bucket for CloudTrail Logs

```bash
# Create bucket (replace ACCOUNT_ID with actual ID)
aws s3api create-bucket \
  --bucket lons-cloudtrail-logs-546854093923 \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket lons-cloudtrail-logs-546854093923 \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket lons-cloudtrail-logs-546854093923 \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket lons-cloudtrail-logs-546854093923 \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create bucket policy to allow CloudTrail
cat > /tmp/cloudtrail-bucket-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::lons-cloudtrail-logs-546854093923"
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::lons-cloudtrail-logs-546854093923/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      }
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket lons-cloudtrail-logs-546854093923 \
  --policy file:///tmp/cloudtrail-bucket-policy.json
```

**Expected Output:**

- S3 bucket created
- Versioning, encryption, and public access blocks enabled
- Bucket policy attached

### 5b. Enable CloudTrail

```bash
# Create CloudTrail (all regions)
aws cloudtrail create-trail \
  --name lons-audit-trail \
  --s3-bucket-name lons-cloudtrail-logs-546854093923 \
  --include-global-events \
  --multi-region-trail \
  --enable-log-file-validation

# Start logging
aws cloudtrail start-logging --trail-name lons-audit-trail

# Verify trail is logging
aws cloudtrail describe-trails --trail-name-list lons-audit-trail
```

**Expected Output:**

```json
{
  "trailList": [
    {
      "Name": "lons-audit-trail",
      "S3BucketName": "lons-cloudtrail-logs-546854093923",
      "IsMultiRegionTrail": true,
      "LogFileValidationEnabled": true,
      "HasCustomEventSelectors": false,
      "HasInsightSelectors": false,
      "IsOrganizationTrail": false
    }
  ]
}
```

### 5c. Configure S3 Lifecycle Policy (Archive Old Logs)

```bash
# Create lifecycle policy
cat > /tmp/lifecycle-policy.json <<'EOF'
{
  "Rules": [
    {
      "Id": "ArchiveOldLogs",
      "Status": "Enabled",
      "Prefix": "AWSLogs/",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket lons-cloudtrail-logs-546854093923 \
  --lifecycle-configuration file:///tmp/lifecycle-policy.json
```

**Expected Output:**

- Lifecycle configuration applied
- Logs older than 90 days will transition to Glacier automatically

---

## Step 6: Terraform State Bootstrap

**Objective:** Create the S3 bucket and DynamoDB table for Terraform state (these are the ONLY resources created manually).

### 6a. Create S3 Bucket for Terraform State

```bash
# Replace ACCOUNT_ID with actual account ID
S3_BUCKET="lons-terraform-state-546854093923"

aws s3api create-bucket \
  --bucket "$S3_BUCKET" \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Enable versioning (critical for state history and recovery)
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket "$S3_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable MFA delete (optional but recommended)
# Note: Requires root account MFA and temporarily disabling versioning management
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "DEVICE_SERIAL_NUMBER TOKEN"
```

**Expected Output:**

- S3 bucket created
- Versioning enabled
- Encryption and public access blocks configured

### 6b. Create DynamoDB Table for State Locking

```bash
# Create DynamoDB table for Terraform locks
aws dynamodb create-table \
  --table-name lons-terraform-locks \
  --attribute-definitions \
    AttributeName=LockID,AttributeType=S \
  --key-schema \
    AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput \
    ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region eu-west-1

# Enable encryption at rest
aws dynamodb update-table \
  --table-name lons-terraform-locks \
  --sse-specification Enabled=true,SSEType=KMS \
  --region eu-west-1

# Wait for table to be active
aws dynamodb wait table-exists \
  --table-name lons-terraform-locks
```

**Expected Output:**

```
{
  "TableDescription": {
    "TableName": "lons-terraform-locks",
    "TableStatus": "ACTIVE",
    "KeySchema": [
      {
        "AttributeName": "LockID",
        "KeyType": "HASH"
      }
    ]
  }
}
```

### 6c. Verify Bootstrap Resources

```bash
# Verify S3 bucket
aws s3 ls | grep lons-terraform-state

# Verify DynamoDB table
aws dynamodb describe-table --table-name lons-terraform-locks
```

**Expected Output:**

- S3 bucket listed
- DynamoDB table shows Status = ACTIVE

---

## Step 7: Update Terraform Backend Configuration

After bootstrap, update Terraform backend configuration in `infrastructure/terraform/main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "lons-terraform-state-546854093923"
    key            = "lons/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "lons-terraform-locks"
  }
}
```

Then initialize Terraform:

```bash
cd infrastructure/terraform
terraform init
```

**Expected Output:**

```
Initializing the backend...
Successfully configured the backend "s3"!
Terraform has been successfully initialized!
```

---

## Step 8: Verify AWS CLI Access

**Objective:** Confirm all setup is working by testing AWS CLI commands.

```bash
# Test with lons-admin user credentials
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"

# List IAM users
aws iam list-users --output table

# List S3 buckets
aws s3 ls

# List CloudTrail trails
aws cloudtrail describe-trails

# List DynamoDB tables
aws dynamodb list-tables
```

**Expected Output:**

- lons-admin user listed
- S3 state bucket listed
- CloudTrail trail listed
- DynamoDB locks table listed

---

## Actual Deployment Details (Nextacks Account)

| Resource | Value |
|---|---|
| **Management Account (Pantheon)** | `053414411791` |
| **Nextacks Account ID** | `546854093923` |
| **Primary Region** | `eu-west-1` (Ireland) |
| **DR Region** | `eu-west-2` (London) |
| **IAM Admin User** | `lons-admin` (AdministratorAccess) |
| **Terraform Role** | `lons-terraform-admin` (AdministratorAccess, ExternalID: `terraform-deployment-role`) |
| **CloudTrail** | `lons-audit-trail` (multi-region, logging to `lons-cloudtrail-logs-546854093923`) |
| **Terraform State Bucket** | `lons-terraform-state-546854093923` (eu-west-1, versioning enabled) |
| **Terraform Lock Table** | `lons-terraform-locks` (eu-west-1, on-demand, partition key: `LockID`) |
| **Console Sign-in (Nextacks)** | `https://546854093923.signin.aws.amazon.com/console` |
| **Password Policy** | 14 chars, all character types, 90-day expiry, 12-password reuse prevention |
| **Budget** | `lons-monthly-budget` ($500/mo, alerts at 85% + 100% actual, 100% forecasted, on Pantheon management account) |
| **Budget Alert Email** | `eoseiakoto@gmail.com` |

---

## Post-Setup Checklist

- [x] AWS account created (Nextacks `546854093923` under Pantheon org)
- [ ] Root account MFA enabled (hardware key preferred)
- [x] IAM admin user `lons-admin` created with AdministratorAccess
- [x] Password policy enforced (14 chars, all types, 90-day expiry, 12 reuse prevention)
- [x] Terraform admin role `lons-terraform-admin` created with external ID
- [ ] GitHub Actions OIDC role `lons-github-actions` created
- [x] AWS Budget `lons-monthly-budget` created ($500/mo, alerts at 85%/100% actual + 100% forecasted, on Pantheon management account)
- [x] CloudTrail enabled for all regions (`lons-audit-trail`)
- [x] CloudTrail S3 bucket created (`lons-cloudtrail-logs-546854093923`)
- [x] S3 Terraform state bucket created with versioning (`lons-terraform-state-546854093923`)
- [x] DynamoDB Terraform locks table created (`lons-terraform-locks`)
- [ ] Terraform backend configuration updated in `infrastructure/terraform/main.tf`
- [ ] `terraform init` successfully initialized
- [ ] AWS CLI tested and working with lons-admin credentials
- [x] Documentation updated with Account ID, role ARNs, S3 bucket names
- [ ] Calendar reminder set for S3 state bucket lifecycle review (quarterly)

---

## Troubleshooting

### Problem: CloudTrail Not Logging

**Cause:** S3 bucket policy not applied or trail not started

**Solution:**
```bash
# Verify trail is enabled
aws cloudtrail start-logging --trail-name lons-audit-trail

# Check S3 bucket policy
aws s3api get-bucket-policy --bucket lons-cloudtrail-logs-546854093923
```

### Problem: Terraform Init Fails with State Bucket Error

**Cause:** S3 bucket name mismatch or wrong region

**Solution:**
```bash
# Verify S3 bucket exists
aws s3 ls | grep lons-terraform-state

# Verify bucket is in correct region
aws s3api get-bucket-location --bucket lons-terraform-state-546854093923
```

### Problem: DynamoDB Table Not Found

**Cause:** Table created in wrong region

**Solution:**
```bash
# List tables in all regions
for region in eu-west-1 eu-west-2 us-east-1; do
  echo "Region: $region"
  aws dynamodb list-tables --region $region
done
```

---

## References

- AWS Getting Started: https://aws.amazon.com/getting-started/
- IAM Best Practices: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- CloudTrail Documentation: https://docs.aws.amazon.com/cloudtrail/
- Terraform AWS Backend: https://www.terraform.io/language/settings/backends/s3
- AWS CLI Documentation: https://docs.aws.amazon.com/cli/
