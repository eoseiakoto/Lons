# Backend configuration using S3 + DynamoDB for state storage and locking
# This uses partial configuration — run: terraform init -backend-config="bucket=lons-terraform-state-ACCOUNT_ID"
# See DEPLOYMENT.md for setup instructions

terraform {
  backend "s3" {
    # Partial configuration — these values must be provided via CLI flags or backend config file
    # Example: terraform init -backend-config="bucket=lons-terraform-state-123456789" \
    #                          -backend-config="key=terraform.tfstate" \
    #                          -backend-config="region=eu-west-1" \
    #                          -backend-config="dynamodb_table=lons-terraform-locks" \
    #                          -backend-config="encrypt=true"

    # These are provided at init time (do not hardcode)
    # bucket         = "lons-terraform-state-<account-id>"
    # key            = "terraform.tfstate"
    # region         = "eu-west-1"
    # dynamodb_table = "lons-terraform-locks"
    # encrypt        = true

    # These can be set here
    encrypt = true
  }
}
