# GoDaddy Domain Setup Runbook

## Overview

This runbook provides step-by-step instructions for setting up the `lons.io` domain on GoDaddy as a registrar, with DNS delegation to AWS Route53. This is a prerequisite for all DNS management, SSL/TLS certificates, and application routing in the Lōns platform.

**Scope:** Domain registration, security settings, nameserver delegation to Route53
**Duration:** 10–15 minutes for configuration; 24–48 hours for DNS propagation
**Owner:** Deployment Engineer
**Frequency:** One-time setup + annual renewal verification

---

## Prerequisites

- **GoDaddy Account:** Existing account with admin access (or create at https://www.godaddy.com/account)
- **AWS Account:** Lōns AWS account set up per Docs/RUNBOOK-AWS-ACCOUNT-SETUP.md
- **Route53 Hosted Zone:** Must be created BEFORE delegating nameservers (see Step 5)
- **DNS Propagation Checker:** For verification (nslookup, dig, online tools)

---

## Step 1: Verify Domain Registration

**Objective:** Confirm that `lons.io` is registered and active on GoDaddy.

### Actions

1. Log in to GoDaddy account at https://www.godaddy.com/account
2. Navigate to **My Products** → **Domains**
3. Locate `lons.io` in the domain list
4. Verify the domain status is **Active** (not expired, not in transfer)
5. Note the **Expiry Date** (should be at least 12 months away)

### Expected Output

- Domain `lons.io` appears in "My Domains"
- Status shows "Active"
- Expiry date is clearly visible

### Troubleshooting

- If domain does not appear: Check email domain registration confirmation; if not found, purchase at https://www.godaddy.com/domains/find-and-buy
- If domain is expired: Contact GoDaddy support or renew immediately
- If domain is in transfer: Wait for transfer to complete, then proceed

---

## Step 2: Enable Domain Lock

**Objective:** Prevent unauthorized domain transfer.

### Actions

1. From **My Domains** list, click on `lons.io`
2. In the domain details page, locate **Domain Settings**
3. Find **Domain Lock** setting
4. If status is "Off," click **Enable**
5. Confirm the action (may require email verification)

### Expected Output

- Domain Lock status shows "On" (green checkmark)
- A confirmation message appears

### Verification Command

```bash
whois lons.io | grep -i "Domain Status"
```

Should show a status including `clientTransferProhibited`.

---

## Step 3: Enable WHOIS Privacy

**Objective:** Mask personal registrant information from public WHOIS records.

### Actions

1. From domain details page, locate **WHOIS Settings**
2. Find **Privacy Protection** (labeled as "WHOIS Privacy" or "Domain Privacy")
3. If status is "Off," click **Enable WHOIS Privacy**
4. Confirm the action

### Expected Output

- WHOIS Privacy status shows "On"
- Confirmation email sent to registrant email address

### Verification

```bash
whois lons.io | grep -i "registrant"
```

Should show privacy service contact, not personal details.

---

## Step 4: Enable Auto-Renewal

**Objective:** Prevent accidental domain expiration.

### Actions

1. From domain details page, locate **Auto Renew**
2. If status is "Off," click **Enable Auto Renew**
3. Verify billing method is current
4. Confirm the action

### Expected Output

- Auto Renew status shows "On"
- Next renewal date is displayed (typically 30 days before expiry)

---

## Step 5: Delegate Nameservers to Route53

**Objective:** Transfer DNS control from GoDaddy to AWS Route53.

### Prerequisites for This Step

Before delegating nameservers, **Route53 hosted zone must be created** in the Lōns AWS account:

```bash
# If not already created, execute from infrastructure/terraform:
terraform apply -target=aws_route53_zone.lons
```

### Actions

#### 5a. Retrieve Route53 Nameservers

1. Log in to AWS Console
2. Navigate to **Route53** → **Hosted Zones**
3. Click on `lons.io` hosted zone
4. In the **Details** section, note the **Name Servers** (4 values)

Example:
```
ns-1234.awsdns-12.com.
ns-5678.awsdns-34.org.
ns-9012.awsdns-56.net.
ns-3456.awsdns-78.co.uk.
```

**Save these values; you will need them in Step 5b.**

#### 5b. Update Nameservers in GoDaddy

1. Log in to GoDaddy account
2. Navigate to **My Products** → **Domains** → `lons.io`
3. In the domain details page, locate **DNS Management**
4. Click **Manage DNS** (or **Change Nameservers** depending on UI version)
5. Select **Custom** nameservers option
6. Enter the 4 Route53 nameserver values from Step 5a:
   - Nameserver 1: `ns-1234.awsdns-12.com.`
   - Nameserver 2: `ns-5678.awsdns-34.org.`
   - Nameserver 3: `ns-9012.awsdns-56.net.`
   - Nameserver 4: `ns-3456.awsdns-78.co.uk.`
7. Click **Save** (or **Update Nameservers**)
8. Confirm the changes

### Expected Output

- GoDaddy displays "Nameservers have been updated"
- Confirmation email sent to registrant email
- Nameserver values match Route53 exactly

### Important Notes

- **Do NOT include trailing dots** in GoDaddy (e.g., use `ns-1234.awsdns-12.com`, not `ns-1234.awsdns-12.com.`)
- **Order does not matter**, but use all 4 nameservers for redundancy
- Changes typically take effect within 30 minutes but may take up to 48 hours for full propagation

---

## Step 6: Verify DNS Propagation

**Objective:** Confirm that Route53 nameservers are authoritative for `lons.io`.

### Verification Method 1: Using `dig` (Linux/macOS)

```bash
dig NS lons.io

# Expected output:
# lons.io.		172800	IN	NS	ns-1234.awsdns-12.com.
# lons.io.		172800	IN	NS	ns-5678.awsdns-34.org.
# lons.io.		172800	IN	NS	ns-9012.awsdns-56.net.
# lons.io.		172800	IN	NS	ns-3456.awsdns-78.co.uk.
```

### Verification Method 2: Using `nslookup` (Cross-Platform)

```bash
nslookup -type=NS lons.io

# Expected output:
# Server:		8.8.8.8
# Address:	8.8.8.8#53
#
# Non-authoritative answer:
# lons.io	nameserver = ns-1234.awsdns-12.com.
# lons.io	nameserver = ns-5678.awsdns-34.org.
# lons.io	nameserver = ns-9012.awsdns-56.net.
# lons.io	nameserver = ns-3456.awsdns-78.co.uk.
```

### Verification Method 3: Online Tool

Use an online DNS propagation checker:
- https://www.whatsmydns.net/ — Enter `lons.io`, select "NS" record type
- Check propagation across multiple geographic locations
- All checks should show Route53 nameservers within 24–48 hours

### Verification Method 4: Query Route53 Directly

```bash
nslookup lons.io ns-1234.awsdns-12.com

# Expected: Returns all A/AAAA/CNAME records created in Route53 (if any)
```

### Timeline

- **Immediate (< 1 hour):** Changes visible from AWS Route53
- **1–24 hours:** Most public DNS resolvers updated
- **24–48 hours:** Full global propagation complete

---

## Step 7: Post-Delegation DNS Management

**Objective:** Confirm all future DNS management happens in Route53, not GoDaddy.

### Actions

1. **In GoDaddy:** Confirm DNS Management is now grayed out or shows "Managed by Custom Nameservers"
2. **In AWS Route53:** All A, CNAME, MX, TXT, and other records are managed here via Terraform
3. **Verify:** Create a test DNS record in Route53 and confirm it resolves:

```bash
# After creating a test A record in Route53 (e.g., test.lons.io → 1.2.3.4)
dig test.lons.io +short

# Expected output:
# 1.2.3.4
```

### Documentation Update

Update the team wiki/docs with:
- Confirmation that lons.io is delegated to Route53
- Link to the Route53 hosted zone in AWS Console
- Process for adding new DNS records (must go through Terraform)

---

## Troubleshooting

### Problem: Nameservers Still Show GoDaddy Values

**Cause:** DNS propagation delay or nameservers not saved correctly

**Solution:**
1. Wait 30–60 minutes and re-check with `dig NS lons.io`
2. Verify the exact nameserver values in GoDaddy match Route53 (no extra dots, same spelling)
3. If still incorrect after 1 hour, contact GoDaddy support

### Problem: Route53 Records Not Resolving

**Cause:** GoDaddy nameservers still authoritative, or Route53 records not created

**Solution:**
1. Verify GoDaddy is delegating to Route53: `dig NS lons.io` should show Route53 nameservers
2. Verify record exists in Route53: Check AWS Console → Route53 → `lons.io` hosted zone
3. Check record details: Ensure A/CNAME records have correct target IPs/aliases
4. Wait for TTL to expire (typically 300 seconds) before re-testing

### Problem: WHOIS Privacy Not Enabled

**Cause:** GoDaddy account settings may prevent privacy (e.g., some domain types)

**Solution:**
1. Check GoDaddy account privacy settings (Account → Settings)
2. Contact GoDaddy support if privacy unavailable for this TLD

### Problem: Domain Lock Cannot Be Enabled

**Cause:** Registrar locks may be disabled for transfers or disputes

**Solution:**
1. Check domain status in GoDaddy: If "Redemption" or "Pending Deletion," unable to lock
2. Contact GoDaddy support to restore domain to active status

---

## Rollback (If Nameservers Must Revert)

If DNS must temporarily revert to GoDaddy-managed nameservers:

1. In GoDaddy, navigate to DNS Management for `lons.io`
2. Change nameserver type back to "GoDaddy Nameservers" (or "Default")
3. Confirm the change
4. Verify: `dig NS lons.io` should return GoDaddy nameservers within 30 minutes
5. All DNS records in Route53 will stop resolving; recreate in GoDaddy if needed
6. Document reason for rollback and revert plan

---

## Post-Setup Checklist

- [ ] Domain `lons.io` is registered and active on GoDaddy
- [ ] Domain Lock is enabled
- [ ] WHOIS Privacy is enabled
- [ ] Auto-Renewal is enabled
- [ ] Route53 hosted zone is created
- [ ] Nameservers updated in GoDaddy to Route53 values
- [ ] DNS propagation verified with `dig NS lons.io`
- [ ] Test record created and resolving correctly
- [ ] Team notified of DNS management location (Route53)
- [ ] Calendar reminder set for annual renewal check (30 days before expiry)

---

## References

- GoDaddy Domain Management: https://www.godaddy.com/account
- AWS Route53: https://console.aws.amazon.com/route53/
- DNS Propagation Tool: https://www.whatsmydns.net/
- Nameserver Verification: `dig NS lons.io`, `nslookup -type=NS lons.io`
