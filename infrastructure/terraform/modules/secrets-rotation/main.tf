terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# Data source for RDS secret
data "aws_secretsmanager_secret" "db_secret" {
  arn = var.db_secret_arn
}

data "aws_secretsmanager_secret_version" "db_secret" {
  secret_id = data.aws_secretsmanager_secret.db_secret.id
}

# IAM Role for Secrets Manager Rotation Lambda
resource "aws_iam_role" "rotation_lambda_role" {
  name = "${var.project_name}-secrets-rotation-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.project_name}-secrets-rotation-lambda-role-${var.environment}"
  })
}

# IAM Policy: Allow Lambda to read/write secrets
resource "aws_iam_role_policy" "rotation_lambda_secrets_policy" {
  name   = "${var.project_name}-lambda-secrets-policy"
  role   = aws_iam_role.rotation_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage"
        ]
        Resource = [
          "${var.db_secret_arn}",
          "${var.db_secret_arn}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetRandomPassword"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Policy: Allow Lambda to access RDS
resource "aws_iam_role_policy" "rotation_lambda_rds_policy" {
  name   = "${var.project_name}-lambda-rds-policy"
  role   = aws_iam_role.rotation_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Policy: Allow Lambda to write CloudWatch logs
resource "aws_iam_role_policy_attachment" "rotation_lambda_logs" {
  role       = aws_iam_role.rotation_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM Policy: Allow Lambda to write VPC logs
resource "aws_iam_role_policy_attachment" "rotation_lambda_vpc_logs" {
  role       = aws_iam_role.rotation_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# CloudWatch Log Group for Rotation Lambda
resource "aws_cloudwatch_log_group" "rotation_lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-secrets-rotation-${var.environment}"
  retention_in_days = var.cloudwatch_log_retention_days

  tags = merge(var.tags, {
    Name = "${var.project_name}-rotation-lambda-logs-${var.environment}"
  })
}

# Security Group for Rotation Lambda (to communicate with RDS)
resource "aws_security_group" "rotation_lambda_sg" {
  name        = "${var.project_name}-rotation-lambda-sg-${var.environment}"
  description = "Security group for Secrets Manager rotation Lambda"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outbound to PostgreSQL"
  }

  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.rds_security_group_id]
    description     = "Allow HTTPS to AWS services"
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-rotation-lambda-sg-${var.environment}"
  })
}

# Lambda Layer for psycopg2 (PostgreSQL driver)
# Note: Built from infrastructure/scripts/build-rotation-lambda.sh
resource "aws_lambda_layer_version" "psycopg2" {
  filename   = "${path.module}/artifacts/lambda-layer-psycopg2.zip"
  layer_name = "${var.project_name}-psycopg2-${var.environment}"

  source_code_hash = filebase64sha256("${path.module}/artifacts/lambda-layer-psycopg2.zip")

  compatible_runtimes = ["python3.11", "python3.12"]

  depends_on = [aws_iam_role.rotation_lambda_role]
}

# Lambda Function for RDS PostgreSQL Rotation
resource "aws_lambda_function" "db_rotation" {
  filename         = "${path.module}/artifacts/lambda-db-rotation.zip"
  function_name    = "${var.project_name}-db-rotation-${var.environment}"
  role             = aws_iam_role.rotation_lambda_role.arn
  handler          = "lambda_function.lambda_handler"
  source_code_hash = filebase64sha256("${path.module}/artifacts/lambda-db-rotation.zip")
  runtime          = "python3.11"
  timeout          = 60

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.rotation_lambda_sg.id]
  }

  layers = [aws_lambda_layer_version.psycopg2.arn]

  environment {
    variables = {
      SECRETS_EXTENSION_HTTP_PORT = "2773"
      SECRETS_EXTENSION_VERSION   = "1.0.0"
    }
  }

  log_config {
    log_group  = aws_cloudwatch_log_group.rotation_lambda_logs.name
    log_format = "JSON"
  }

  depends_on = [
    aws_iam_role_policy.rotation_lambda_secrets_policy,
    aws_iam_role_policy.rotation_lambda_rds_policy,
    aws_iam_role_policy_attachment.rotation_lambda_logs,
    aws_iam_role_policy_attachment.rotation_lambda_vpc_logs,
  ]

  tags = merge(var.tags, {
    Name = "${var.project_name}-db-rotation-${var.environment}"
  })
}

# Secrets Manager Rotation Configuration - Database Credentials
resource "aws_secretsmanager_secret_rotation" "db_rotation" {
  secret_id           = data.aws_secretsmanager_secret.db_secret.id
  rotation_enabled    = true
  rotation_lambda_arn = "${aws_lambda_function.db_rotation.arn}:LIVE"

  rotation_rules {
    automatically_after_days = var.rotation_rules.automatically_after_days
    duration                 = "3h"
    schedule_expression      = "rate(${var.rotation_rules.database_rotation_days} days)"
  }

  depends_on = [
    aws_lambda_permission.secrets_manager_invoke_db_rotation,
    aws_secretsmanager_secret_version.db_secret_version
  ]
}

# Lambda permission: Allow Secrets Manager to invoke rotation function
resource "aws_lambda_permission" "secrets_manager_invoke_db_rotation" {
  statement_id  = "AllowSecretsManagerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.db_rotation.function_name
  principal     = "secretsmanager.amazonaws.com"
}

# Attach version to secret for rotation
resource "aws_secretsmanager_secret_version" "db_secret_version" {
  secret_id = data.aws_secretsmanager_secret.db_secret.id
  # Note: In real scenario, this would be managed by the rotation Lambda
}

# CloudWatch Alarms for Rotation Lambda Failures
resource "aws_cloudwatch_metric_alarm" "db_rotation_errors" {
  alarm_name          = "${var.project_name}-db-rotation-errors-${var.environment}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when database rotation Lambda has errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.db_rotation.function_name
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-db-rotation-alarm-${var.environment}"
  })
}

resource "aws_cloudwatch_metric_alarm" "db_rotation_duration" {
  alarm_name          = "${var.project_name}-db-rotation-duration-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Maximum"
  threshold           = "50000"  # 50 seconds
  alarm_description   = "Alert when database rotation Lambda takes too long"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.db_rotation.function_name
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-db-rotation-duration-alarm-${var.environment}"
  })
}

# EventBridge Rule for manual rotation trigger (optional)
resource "aws_cloudwatch_event_rule" "manual_rotation_trigger" {
  name        = "${var.project_name}-manual-rotation-trigger-${var.environment}"
  description = "Manual trigger for database credential rotation"

  # This rule can be triggered manually via AWS CLI or Console
  is_enabled = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-manual-rotation-${var.environment}"
  })
}

resource "aws_cloudwatch_event_target" "manual_rotation_target" {
  rule      = aws_cloudwatch_event_rule.manual_rotation_trigger.name
  target_id = "DBRotationLambda"
  arn       = aws_lambda_function.db_rotation.arn

  role_arn = aws_iam_role.eventbridge_rotation_role.arn
}

# IAM Role for EventBridge to invoke Lambda
resource "aws_iam_role" "eventbridge_rotation_role" {
  name = "${var.project_name}-eventbridge-rotation-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "eventbridge_rotation_policy" {
  name   = "${var.project_name}-eventbridge-rotation-policy"
  role   = aws_iam_role.eventbridge_rotation_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = aws_lambda_function.db_rotation.arn
      }
    ]
  })
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.db_rotation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.manual_rotation_trigger.arn
}
