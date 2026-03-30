# Email DNS records for lons.io
# MX, SPF, DKIM, DMARC — required for noreply@lons.io and support@lons.io

# Note: These records are created in the Route53 hosted zone.
# The actual email provider (e.g., AWS SES, Google Workspace) will be configured separately.
# For launch, we use AWS SES for transactional email.

locals {
  email_enabled = var.environment == "prod"  # Only production needs email DNS
}

# MX records — AWS SES inbound (for bounce handling)
resource "aws_route53_record" "mx" {
  count   = local.email_enabled ? 1 : 0
  zone_id = local.route53_zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = [
    "10 inbound-smtp.eu-west-1.amazonaws.com",
  ]
}

# SPF record — authorize AWS SES to send on behalf of lons.io
resource "aws_route53_record" "spf" {
  count   = local.email_enabled ? 1 : 0
  zone_id = local.route53_zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=spf1 include:amazonses.com ~all",
  ]
}

# DKIM records — AWS SES generates these (3 CNAME records)
# These will be populated after SES domain verification
resource "aws_ses_domain_identity" "lons" {
  count  = local.email_enabled ? 1 : 0
  domain = var.domain_name
}

resource "aws_ses_domain_dkim" "lons" {
  count  = local.email_enabled ? 1 : 0
  domain = aws_ses_domain_identity.lons[0].domain
}

resource "aws_route53_record" "dkim" {
  count   = local.email_enabled ? 3 : 0
  zone_id = local.route53_zone_id
  name    = "${aws_ses_domain_dkim.lons[0].dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.lons[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SES domain verification TXT record
resource "aws_route53_record" "ses_verification" {
  count   = local.email_enabled ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.lons[0].verification_token]
}

# DMARC record — reject policy (strict for fintech)
resource "aws_route53_record" "dmarc" {
  count   = local.email_enabled ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = [
    "v=DMARC1; p=reject; rua=mailto:dmarc-reports@lons.io; ruf=mailto:dmarc-reports@lons.io; pct=100; adkim=s; aspf=s",
  ]
}

# SES email addresses for platform use
resource "aws_ses_email_identity" "noreply" {
  count = local.email_enabled ? 1 : 0
  email = "noreply@${var.domain_name}"
}

resource "aws_ses_email_identity" "support" {
  count = local.email_enabled ? 1 : 0
  email = "support@${var.domain_name}"
}
