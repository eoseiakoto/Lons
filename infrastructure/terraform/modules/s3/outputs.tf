output "documents_bucket_arn" {
  description = "ARN of the documents S3 bucket"
  value       = aws_s3_bucket.documents.arn
}

output "documents_bucket_name" {
  description = "Name of the documents S3 bucket"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_dr_arn" {
  description = "ARN of the documents S3 bucket in DR region"
  value       = aws_s3_bucket.documents_dr.arn
}

output "documents_bucket_dr_name" {
  description = "Name of the documents S3 bucket in DR region"
  value       = aws_s3_bucket.documents_dr.id
}

output "exports_bucket_arn" {
  description = "ARN of the exports S3 bucket"
  value       = aws_s3_bucket.exports.arn
}

output "exports_bucket_name" {
  description = "Name of the exports S3 bucket"
  value       = aws_s3_bucket.exports.id
}

output "ecr_repository_urls" {
  description = "Map of ECR repository URLs by service name"
  value = {
    for repo_name, repo in aws_ecr_repository.services :
    repo_name => repo.repository_url
  }
}

output "ecr_repository_arns" {
  description = "Map of ECR repository ARNs by service name"
  value = {
    for repo_name, repo in aws_ecr_repository.services :
    repo_name => repo.arn
  }
}

output "kms_key_arn" {
  description = "ARN of the shared KMS encryption key"
  value       = aws_kms_key.lons_encryption.arn
}

output "kms_key_id" {
  description = "ID of the shared KMS encryption key"
  value       = aws_kms_key.lons_encryption.key_id
}

output "kms_key_arn_dr" {
  description = "ARN of the KMS encryption key in DR region"
  value       = aws_kms_key.lons_encryption_dr.arn
}

output "kms_key_id_dr" {
  description = "ID of the KMS encryption key in DR region"
  value       = aws_kms_key.lons_encryption_dr.key_id
}
