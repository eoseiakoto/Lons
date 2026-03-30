# DNS Delegation: GoDaddy → Route53

## Overview

After running `terraform apply` to create the Route53 hosted zone for `lons.io`, the nameservers from Route53 must be configured in GoDaddy to delegate DNS management to AWS. This runbook provides step-by-step instructions for completing the delegation and verifying successful propagation.

---

## Prerequisites

- Route53 hosted zone for `lons.io` created via Terraform (see `infrastructure/terraform/modules/dns/`)
- GoDaddy Domain Control Center admin access for `lons.io`
- Terraform outputs available (route53 nameservers)
- Local tools: `dig`, `jq`, `aws` CLI (optional but recommended)
- Internet connectivity to validate DNS propagation

---

## Step 1: Extract Route53 Nameservers

### Option A: From Terraform Output

```bash
# Display all nameservers from Terraform state
terraform output -json | jq -r '.name_servers.value[]'
```

**Expected output:**
```
ns-123.awsdns-45.com
ns-678.awsdns-90.co.uk
ns-901.awsdns-23.net
ns-456.awsdns-78.org
```

### Option B: From AWS Console

1. Open [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **Route53** → **Hosted zones**
3. Click on **lons.io**
4. Locate the **NS** (nameserver) record in the records list
5. Note all four nameserver values

### Document the Nameservers

Copy the four Route53 nameserver addresses. You will need them in the next step.

---

## Step 2: Update GoDaddy Nameservers

### Log In to GoDaddy

1. Go to [GoDaddy Domain Control Center](https://dcc.godaddy.com/)
2. Sign in with admin credentials
3. Locate **lons.io** in the domain list

### Access Nameserver Settings

1. Click on **lons.io** to open the domain management page
2. Scroll down to **DNS** section
3. Click the **Nameservers** option (or **Change nameservers**)
4. Select **Set custom nameservers (advanced)**

### Enter Route53 Nameservers

1. Clear any existing custom nameserver entries
2. Enter the four Route53 nameservers from Step 1 in the provided fields:
   - Field 1: `ns-123.awsdns-45.com`
   - Field 2: `ns-678.awsdns-90.co.uk`
   - Field 3: `ns-901.awsdns-23.net`
   - Field 4: `ns-456.awsdns-78.org`

3. Click **Save** (or **Apply**)

### Confirmation

GoDaddy will display a confirmation message. The nameserver change is submitted and will propagate globally within 24-48 hours.

---

## Step 3: Verify DNS Propagation

### Check NS Records Locally

Once GoDaddy confirms the nameserver update, verify that Route53 is responding:

```bash
# Query lons.io nameservers
dig lons.io NS +short
```

**Expected output:**
```
ns-123.awsdns-45.com.
ns-678.awsdns-90.co.uk.
ns-456.awsdns-78.org.
ns-901.awsdns-23.net.
```

If results still show GoDaddy nameservers, wait 15–30 minutes and retry.

### Check Subdomain Resolution

```bash
# Verify dev environment subdomain
dig dev.lons.io +short

# Verify API subdomain
dig api.dev.lons.io +short
```

### Worldwide DNS Propagation Check

Use a public DNS propagation checker to verify global distribution:

1. Open [whatsmydns.net](https://www.whatsmydns.net/#NS/lons.io)
2. Set query type to **NS**
3. Enter domain: `lons.io`
4. View propagation across global DNS resolvers

Most resolvers should return the Route53 nameservers within 4–12 hours. A few slow resolvers may take up to 48 hours.

---

## Step 4: Verify ACM Certificate Status

Route53 DNS delegation enables AWS Certificate Manager (ACM) to validate the SSL certificate for `lons.io` automatically via DNS CNAME validation.

### Check Certificate Status

```bash
# List ACM certificates
aws acm list-certificates --region us-east-1

# Describe certificate status (replace <cert_arn> with the actual ARN)
aws acm describe-certificate --certificate-arn <cert_arn> --region us-east-1 --query 'Certificate.Status'
```

**Expected output:**
```
ISSUED
```

### Alternative: AWS Console

1. Open [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **Certificate Manager (ACM)**
3. Locate the certificate for `lons.io`
4. Status should be **ISSUED**

---

## Step 5: Expected Timeline

| Event | Timeline | Notes |
|-------|----------|-------|
| Nameserver update submitted to GoDaddy | Immediate | Change is queued |
| GoDaddy nameserver change propagates | 30 mins – 2 hours | Most ISPs update quickly |
| Route53 responds authoritatively | 1–4 hours | Visible via `dig` |
| Global DNS propagation | 4–24 hours | Check with whatsmydns.net |
| ACM certificate validation | Automatic | Occurs once Route53 NS records are live |
| ACM certificate status: ISSUED | 1–12 hours after DNS propagation | Usually within 4 hours |
| Full SSL readiness | Within 24–48 hours | After ACM certificate is ISSUED |

**Note:** Most propagation completes within 4–8 hours in practice.

---

## Step 6: Rollback (If Required)

If issues occur during or after DNS delegation, nameserver changes can be reverted.

### Revert to GoDaddy Nameservers

1. Log in to [GoDaddy Domain Control Center](https://dcc.godaddy.com/)
2. Click on **lons.io**
3. Navigate to **DNS** → **Nameservers**
4. Select **Use GoDaddy nameservers**
5. Save changes

**Propagation time:** Same as initial change (30 mins – 2 hours)

### When to Rollback

- ACM certificate remains in PENDING_VALIDATION after 12 hours
- Subdomains (dev.lons.io, api.dev.lons.io) are not resolving after 8 hours
- Production DNS queries are returning incorrect results

---

## Post-Delegation Checklist

Use this checklist to confirm successful delegation:

- [ ] Route53 NS record values documented
- [ ] GoDaddy nameservers updated to Route53 values
- [ ] GoDaddy confirmation received
- [ ] `dig lons.io NS +short` returns Route53 nameservers
- [ ] `dig dev.lons.io +short` resolves correctly
- [ ] `dig api.dev.lons.io +short` resolves correctly
- [ ] whatsmydns.net shows Route53 NS records globally (or majority of resolvers)
- [ ] ACM certificate status is **ISSUED**
- [ ] No SSL certificate warnings in browser for lons.io or subdomains

---

## Important Notes

### Domain Registration & Renewal

- **GoDaddy domain registration** for `lons.io` remains active and managed by GoDaddy
- Domain expires: **March 28, 2027**
- Auto-renewal is **enabled** — no manual action required
- Only **DNS resolution** transfers to Route53; domain registration stays with GoDaddy

### What Stays with GoDaddy

- Domain registration
- WHOIS privacy settings
- Domain lock status
- Auto-renewal configuration
- Registrant contact information

### What Moves to Route53

- DNS resolution (nameserver delegation)
- DNS record management (A, CNAME, MX, TXT, NS, etc.)
- Subdomain creation and management
- ACM certificate DNS validation

### Support & Escalation

If DNS delegation fails or takes unusually long:

1. Confirm GoDaddy change was saved (check GoDaddy DNS settings)
2. Wait at least 2 hours
3. Clear local DNS cache: `sudo systemctl restart systemd-resolved` (Linux) or `sudo dscacheutil -flushcache` (macOS)
4. Retry `dig` queries
5. Contact AWS Support if ACM certificate remains PENDING_VALIDATION after 24 hours
6. Contact GoDaddy support if nameserver change is not reflecting

---

## Related Documentation

- Terraform DNS module: `infrastructure/terraform/modules/dns/`
- Route53 hosted zone configuration: `infrastructure/terraform/main.tf`
- ACM certificate setup: `infrastructure/terraform/modules/certificates/`
- Deployment runbook: `Docs/13-deployment.md`

