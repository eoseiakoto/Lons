# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.project_name}-waf-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {
      # Allow by default
    }
  }

  # Tenant IP Restriction Rule (optional, priority 0)
  dynamic "rule" {
    for_each = var.enable_tenant_ip_restriction && var.tenant_allowed_ips != null ? [1] : []
    content {
      name     = "TenantIPAllowList"
      priority = 0

      action {
        block {
          custom_response {
            response_code = 403
          }
        }
      }

      statement {
        and_statement {
          statement {
            byte_match_statement {
              search_string = "/v1/tenant"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "NONE"
              }
              positional_constraint = "STARTS_WITH"
            }
          }

          statement {
            not_statement {
              statement {
                ip_set_reference_statement {
                  arn = aws_wafv2_ip_set.tenant_allowed_ips[0].arn
                }
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "TenantIPAllowListMetric"
        sampled_requests_enabled   = true
      }
    }
  }

  # AWS Managed Rules: Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = var.enable_tenant_ip_restriction && var.tenant_allowed_ips != null ? 1 : 0

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # Exclude specific rules if needed
        rule_action_override {
          name = "SizeRestrictions_BODY"

          action_to_use {
            block {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules: Known Bad Inputs Rule Set
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = var.enable_tenant_ip_restriction && var.tenant_allowed_ips != null ? 2 : 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules: SQL Injection Rule Set
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = var.enable_tenant_ip_restriction && var.tenant_allowed_ips != null ? 3 : 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  # Rate-based Rule: Limit 2000 requests per 5 minutes per IP
  rule {
    name     = "RateLimitPerIP"
    priority = var.enable_tenant_ip_restriction && var.tenant_allowed_ips != null ? 4 : 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"

        # Optional: Scope down the rule to specific patterns
        scope_down_statement {
          byte_match_statement {
            search_string = "/"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
            positional_constraint = "STARTS_WITH"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIPMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf-${var.environment}"
    sampled_requests_enabled   = true
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-waf-${var.environment}"
  })
}

# WAF IP Set for Tenant IP Restrictions
resource "aws_wafv2_ip_set" "tenant_allowed_ips" {
  count              = var.enable_waf ? 1 : 0
  name               = "${var.project_name}-tenant-allowed-ips-${var.environment}"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"

  # Default empty - managed via Terraform variables per tenant
  addresses = var.tenant_allowed_ips != null ? var.tenant_allowed_ips : []

  tags = merge(var.tags, {
    Name = "${var.project_name}-tenant-allowed-ips-${var.environment}"
  })
}

# WAF Association with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn
}
