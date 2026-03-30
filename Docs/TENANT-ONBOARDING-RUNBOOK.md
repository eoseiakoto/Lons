# Tenant Onboarding Runbook

Operational procedures for onboarding new Service Provider (SP) tenants onto the Lōns platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Onboarding Phase](#pre-onboarding-phase)
3. [Onboarding Phase](#onboarding-phase)
4. [Post-Onboarding Phase](#post-onboarding-phase)
5. [Troubleshooting](#troubleshooting)
6. [Rollback Procedures](#rollback-procedures)

---

## Overview

### Onboarding Phases

| Phase | Duration | Owner | Deliverables |
|-------|----------|-------|--------------|
| Pre-Onboarding | 2–4 weeks | Sales + Legal | Signed agreement, KYC/KYB docs, jurisdiction confirmation |
| Onboarding (Automated) | 5–10 minutes | DevOps/Platform Ops | Tenant created, products configured, credentials issued |
| Onboarding (Manual) | 1–2 days | Platform Ops + SP Operations | Portal access, product customization, webhook setup |
| Integration Testing | 3–5 days | SP Technical + Platform Eng | API testing, transaction flows, error scenarios |
| Go-Live | Ongoing | Operations Center | Daily monitoring, performance tracking, incident response |

### Success Metrics

- Onboarding script execution: < 5 minutes
- Portal accessibility: 100% uptime during onboarding
- API key generation: immediate
- First transaction processing: within 24 hours of go-live
- No data loss or tenant isolation breaches

---

## Pre-Onboarding Phase

### Timeline: 2–4 weeks before go-live

This phase ensures the SP is legally and operationally ready before platform provisioning.

### Checklist: Pre-Onboarding Validation

**Legal & Compliance**

- [ ] **Signed Master Service Agreement**
  - Obtain fully executed MSA from Legal
  - Confirm terms: liability, indemnification, confidentiality, IP
  - Verify execution dates and authorized signatories

- [ ] **Data Processing Agreement (DPA)**
  - Required per GDPR, Ghana DPA, Kenya DPA, Nigeria NDPR
  - Specifies data controller/processor roles
  - Defines data handling procedures, retention, subject rights
  - Signed by authorized representative

- [ ] **KYC/KYB Documentation**
  - Company registration certificate
  - Tax identification number
  - Beneficial ownership declaration
  - Director/officer identity documents (national ID + photo)
  - Proof of address (business and individual)
  - Source of funds verification
  - Sanction list screening (OFAC, UN, local blacklists)

- [ ] **Regulatory Confirmations**
  - Lender license confirmation (if SP is licensed to lend)
  - Regulatory status in country of operation
  - Insurance (E&O, cyber) copies
  - Any required permits/approvals for digital lending

**Business & Product Configuration**

- [ ] **Jurisdiction Confirmation**
  - Primary country: Ghana (GH), Kenya (KE), Nigeria (NG), or other
  - Secondary markets: confirm if multi-country from start
  - Confirm applicable regulations:
    - **Ghana**: Data Protection Act (2012), Bank of Ghana licensing (if required)
    - **Kenya**: Data Protection Act (2019), CBK digital lending rules
    - **Nigeria**: NDPR (2019)/NDPA (2023), CBN digital lending guidelines

- [ ] **Product Selection & Terms**
  - [ ] Overdraft: confirm limits, grace period, interest rate
  - [ ] Micro-Loan: confirm tenor options, eligibility rules, APR limits
  - [ ] BNPL: confirm merchant integration, tenor options
  - [ ] Invoice Factoring: confirm business model, tenor, requirements
  - Document in Term Sheet with limits per jurisdiction

- [ ] **Integration Approach**
  - Confirm: API integration vs. O&M Portal only
  - Identify webhook callback URLs (if applicable)
  - Confirm notification preferences (SMS/Email templates)
  - Identify wallet/telecom partners for disbursement

- [ ] **Operational Contacts**
  - Primary Operations Contact (email + phone)
  - Technical Contact (API integration lead)
  - Compliance/Finance Contact (settlement queries)
  - Escalation Contact (for incidents)
  - Document in Onboarding Tracker spreadsheet

**Technical Readiness**

- [ ] **API Readiness** (if integration)
  - Confirm SP has API endpoint for callback webhooks
  - Confirm IP whitelist (if applicable)
  - Confirm mTLS requirements (if required)
  - Test connectivity to Lōns endpoint in staging environment

- [ ] **Data Mapping Review**
  - Customer data schema alignment
  - Product parameter mapping
  - Repayment schedule logic alignment
  - Error handling and retry strategies

### Sign-Off

Once all checks pass, Compliance + Sales obtain final sign-off from SP leadership and schedule onboarding session.

---

## Onboarding Phase

### Timeline: Day of activation (1–2 days)

### Step 1: Automated Tenant Provisioning

**Duration**: 5–10 minutes

**Prerequisites**:
- All pre-onboarding checks passed
- GraphQL server is running and accessible
- DevOps has `tenant-onboarding` script in PATH
- Credentials file (`.credentials-{TENANT_CODE}.env`) is prepared

**Procedure**:

```bash
# 1. Prepare environment
cd /path/to/lons/scripts/tenant-onboarding
export TENANT_NAME="Ghana Microfinance Ltd"
export TENANT_CODE="GMF_001"
export COUNTRY="GH"
export ADMIN_EMAIL="ops@ghanamic.com"
export CONTACT_PHONE="+233201234567"

# 2. Run onboarding script
./onboard-tenant.sh \
  --name "$TENANT_NAME" \
  --code "$TENANT_CODE" \
  --country "$COUNTRY" \
  --env staging \
  --admin-email "$ADMIN_EMAIL" \
  --contact-phone "$CONTACT_PHONE"

# 3. Verify outputs
ls -la .credentials-${TENANT_CODE}.env
ls -la onboarding-summary-${TENANT_CODE}.txt
cat onboarding-*.log | tail -50
```

**Verification**:

- [ ] Script exits with code 0 (success)
- [ ] Onboarding summary file created
- [ ] Credentials file created with mode 600
- [ ] Log file contains no ERROR entries
- [ ] Tenant ID printed in console

**Outputs**:
- `onboarding-summary-{TENANT_CODE}.txt` — Human-readable summary
- `.credentials-{TENANT_CODE}.env` — Secure credentials file
- `onboarding-{TIMESTAMP}.log` — Complete execution log

### Step 2: Secure Credential Handover

**Duration**: 1–2 hours

**Procedure**:

1. **Store credentials securely**
   ```bash
   # Move to secrets manager
   mv .credentials-${TENANT_CODE}.env ~/secrets/
   # Or use AWS Secrets Manager
   aws secretsmanager create-secret \
     --name "lons/${TENANT_CODE}/credentials" \
     --secret-string file://~/.credentials-${TENANT_CODE}.env
   ```

2. **Generate temporary access link**
   - Use secure portal access method (e.g., magic link)
   - Portal URL: `https://lons.io/portal` (or staging URL)
   - Temporary credentials: `{ADMIN_EMAIL}` + `{TEMP_PASSWORD}`
   - Validity: 24 hours only

3. **Communicate securely with SP**
   - Use encrypted email or secure document portal
   - Send:
     - `onboarding-summary-{TENANT_CODE}.txt`
     - Portal access link + temporary credentials
     - Integration guide (if API)
   - **DO NOT** send plain-text credentials in email body
   - Use separate channels for email and password

4. **Confirmation**
   - [ ] SP confirms receipt of credentials
   - [ ] SP admin logs in successfully
   - [ ] SP confirms temporary password changed
   - [ ] No credential sharing incidents reported

### Step 3: Product Configuration & Customization

**Duration**: 2–4 hours (SP operations team)

**SP Operations Tasks**:

1. **Log into O&M Portal**
   - URL: `https://lons.io/portal`
   - Credentials: email + new password (changed after first login)

2. **Review Default Products**
   - Navigate to Products → List
   - Verify all 4 default products created:
     - Overdraft
     - Micro-Loan
     - BNPL
     - Invoice Factoring
   - Review settings in light of term sheet

3. **Customize Product Terms** (if needed)
   - For each product:
     - [ ] Amount range (min/max) per agreement
     - [ ] Tenor options aligned with term sheet
     - [ ] Interest rates per jurisdiction requirements
     - [ ] Fee structure (origination, service, insurance, penalty)
     - [ ] Grace period
     - [ ] Repayment method
     - [ ] Eligibility rules (KYC level, account age, etc.)

4. **Configure Approval Workflows**
   - Loan approval method: Auto / Semi-Auto / Manual
   - If Semi-Auto: configure approval thresholds
   - If Manual: assign approval users/roles

5. **Set Notification Templates**
   - SMS: loan approval, disbursement, repayment reminder, overdue notice
   - Email: contract pdf, statement, failure notifications
   - **Language**: Configure per market (English, local language if supported)

6. **Save & Publish Products to Active**
   - Transition products from Draft → Active
   - Confirm visibility to customers

**Lōns Operations Tasks**:

1. **Validate Product Configurations**
   - Check interest rates against jurisdiction caps
   - Verify APR disclosures calculated correctly
   - Confirm fee structure is legal per jurisdiction
   - Verify total cost of credit is disclosed

2. **Configure Revenue Sharing** (if applicable)
   - Define revenue split: SP / Lender / Lōns platform
   - By product and/or by tier
   - Documented in tenant configuration

3. **Enable Integrations**
   - [ ] Wallet integration enabled (MTN MoMo, M-Pesa, etc.)
   - [ ] SMS gateway configured (Africa's Talking, Twilio)
   - [ ] Email gateway configured (SendGrid, SES)
   - [ ] Webhook signing key configured

### Step 4: Webhook Configuration (if API Integration)

**Duration**: 2–4 hours

**SP Technical Tasks**:

1. **Provide Webhook Endpoints**
   - Event: `contract.state_changed` → `https://sp.example.com/webhooks/contract`
   - Event: `repayment.received` → `https://sp.example.com/webhooks/payment`
   - Event: `disbursement.completed` → `https://sp.example.com/webhooks/disbursement`
   - All endpoints must:
     - Accept POST requests (JSON body)
     - Respond with HTTP 200–299 for success
     - Be reachable from Lōns platform IP range
     - Validate webhook signature (HMAC-SHA256)

2. **Webhook Signature Verification**
   - Retrieve webhook signing key from O&M Portal (Settings → Webhooks)
   - Implement signature verification in webhook handler:
     ```python
     import hmac
     import hashlib

     def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
         expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
         return hmac.compare_digest(expected, signature)
     ```

**Lōns Operations Tasks**:

1. **Register Webhook Endpoints**
   - In tenant config: add webhook callback URLs
   - Configure retry policy (exponential backoff, max retries)
   - Configure timeout (default: 30 seconds)

2. **Test Webhook Delivery**
   - Send test event from admin portal
   - Verify SP receives and processes correctly
   - Verify signature validation works
   - Test retry on SP endpoint failure

### Step 5: Verification Checklist

**Duration**: 1–2 hours

Before proceeding to integration testing, verify:

**Tenant Configuration**

- [ ] Tenant is Active in system
- [ ] All 4 products created and Active
- [ ] Product terms match signed term sheet
- [ ] Currency is correct for country
- [ ] Timezone is set correctly
- [ ] Revenue sharing configured (if applicable)

**User & Access Control**

- [ ] SP Admin user created and can log in
- [ ] SP Admin has changed temporary password
- [ ] MFA configured (if required)
- [ ] IP whitelist configured (if applicable)
- [ ] API key pair generated and stored securely

**Integrations**

- [ ] Wallet integration enabled and tested
- [ ] Notification gateway configured (SMS/Email)
- [ ] Webhook endpoints registered (if applicable)
- [ ] Webhook signatures verified in test

**Compliance**

- [ ] KYC documentation stored securely
- [ ] DPA executed
- [ ] Data consent collected
- [ ] Audit logging enabled
- [ ] Encryption verified for PII fields

### Verification Queries

Run these GraphQL queries to confirm configuration:

```bash
# Verify tenant
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { tenant(id: \"<TENANT_ID>\") { id organizationName status } }"
  }' | jq .

# List products
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { products(tenantId: \"<TENANT_ID>\") { id code type status } }"
  }' | jq .

# Verify API key
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{ "query": "{ __typename }" }' | jq .
```

---

## Post-Onboarding Phase

### Step 1: Integration Testing (3–5 days)

**Duration**: 3–5 business days

**Participants**: SP Technical Team + Lōns Engineering

**Testing Environment**: Staging

**Test Plan**:

1. **API Authentication**
   - [ ] Authenticate with Client ID + Client Secret
   - [ ] Verify JWT token issued
   - [ ] Verify token refresh mechanism
   - [ ] Verify token expiration

2. **Loan Origination Flow**
   - [ ] Customer activation (KYC verification)
   - [ ] Pre-qualification scoring
   - [ ] Loan application submission
   - [ ] Loan approval (auto/manual)
   - [ ] Offer generation
   - [ ] Customer acceptance
   - [ ] Disbursement to wallet
   - [ ] Repayment schedule generation

3. **Repayment & Collections**
   - [ ] Automatic repayment deduction
   - [ ] Manual payment submission
   - [ ] Partial payment allocation
   - [ ] Overdue detection
   - [ ] Penalty application
   - [ ] Payment receipts
   - [ ] Collections workflow

4. **Notifications**
   - [ ] SMS sent for loan approval
   - [ ] Email sent for contract PDF
   - [ ] Repayment reminders
   - [ ] Overdue notifications
   - [ ] Collection notices

5. **Reporting & Webhooks**
   - [ ] Webhook events delivered correctly
   - [ ] Webhook retry on failure
   - [ ] Reporting queries return correct data
   - [ ] Reconciliation reports accurate

6. **Error Handling**
   - [ ] Insufficient funds → error handling
   - [ ] Loan amount exceeds limit → error handling
   - [ ] Invalid customer data → validation error
   - [ ] Malformed requests → proper error response

**Test Scenarios**:

Document test scenarios in a shared Google Sheet or Confluence doc:

| Scenario | Input | Expected Result | Status |
|----------|-------|-----------------|--------|
| Happy path: Overdraft | Customer GHS100, OD limit GHS500 | Overdraft used, limit reduced | PASS/FAIL |
| Happy path: Micro-Loan | Customer applies for GHS1000, 30 days | Approved, disbursed, schedule generated | PASS/FAIL |
| Decline: Insufficient credit | Customer GHS100, OD limit GHS50 | Application declined | PASS/FAIL |
| Repayment: Partial | Customer owes GHS200, pays GHS50 | Payment received, balance GHS150 | PASS/FAIL |

**Sign-Off**:

When all test scenarios pass:
- [ ] SP Technical Lead signs off on API integration
- [ ] Lōns Engineering signs off on platform stability
- [ ] Both teams agree to production readiness

### Step 2: Go-Live Preparation (1 day before)

**Duration**: 4 hours

**Checklist**:

**Environment Transition**

- [ ] Confirm API endpoint switching (staging → production)
- [ ] Confirm database backup strategy
- [ ] Confirm monitoring/alerting active
- [ ] Confirm incident escalation contacts

**Operations Readiness**

- [ ] Operations Center staffed for first 7 days
- [ ] On-call engineer assigned
- [ ] Incident runbooks prepared
- [ ] Communication channels established (Slack, email, phone)
- [ ] Escalation contacts: SP operations + Lōns engineering

**Monitoring & Alerting**

- [ ] Transaction volume thresholds configured
- [ ] Error rate thresholds configured
- [ ] API latency thresholds configured
- [ ] Database connection pool monitoring
- [ ] Redis memory monitoring

**Customer Communication**

- [ ] SP has notified customers of launch
- [ ] Customer-facing documentation available
- [ ] Support email/phone published
- [ ] FAQ prepared for common issues

### Step 3: Go-Live (Day 1)

**Duration**: Ongoing

**Pre-Go-Live (T-30 minutes)**

1. **Final Verification**
   ```bash
   # Verify all systems green
   ./verify-tenant-production.sh <TENANT_CODE>
   ```

2. **Enable Tenant in Production**
   - Transition tenant from staging to production
   - Publish products to active
   - Enable API endpoints

3. **Notify Operations**
   - Slack: `#lons-operations` channel
   - Message: "Tenant {TENANT_NAME} ({TENANT_CODE}) going live in 30 minutes"

**During Go-Live (T+0 to T+4 hours)**

1. **Monitor Key Metrics**
   - API request volume
   - API error rate
   - Transaction latency
   - Customer activation rate
   - Disbursement success rate

2. **Watch for Issues**
   - Customer support queries
   - API errors in logs
   - Failed transactions
   - Notification delivery failures

3. **Communicate**
   - Slack updates every 30 minutes first 2 hours, then hourly
   - Include: transactions processed, errors, next check time

**First 24 Hours**

- [ ] Monitor 24/7 (on-call engineer)
- [ ] Log all issues
- [ ] Proactive support to SP
- [ ] Daily reconciliation successful
- [ ] No data integrity issues

### Step 4: Post-Go-Live Monitoring (Days 2–7)

**Duration**: 7 days

**Daily Checklist** (run each morning):

- [ ] Transaction volume within expected range
- [ ] Error rate < 0.5%
- [ ] API latency < 500ms (p95)
- [ ] No failed disbursements
- [ ] All notifications sent successfully
- [ ] No customer complaints escalated
- [ ] Daily settlement completed
- [ ] Audit logs showing normal activity

**Weekly Checklist** (end of week 1):

- [ ] Review transaction patterns
- [ ] Review error logs and fix any bugs
- [ ] Review customer feedback
- [ ] Verify compliance logging
- [ ] Confirm revenue calculations accurate
- [ ] SP operations team comfortable with platform

**Graduation Criteria** (after 7 days):

- [ ] > 100 transactions processed without critical incidents
- [ ] < 0.1% critical error rate
- [ ] All functionality working as documented
- [ ] SP operations team has processed refund/manual adjustments successfully
- [ ] No data loss or corruption
- [ ] Audit trail complete and correct

---

## Troubleshooting

### Issue: Onboarding Script Fails

**Error**: `ERROR: Cannot reach API endpoint`

**Solution**:
1. Verify GraphQL server is running: `pnpm --filter graphql-server dev`
2. Check endpoint URL is correct (staging: http://localhost:3000, prod: https://api.lons.io)
3. Check firewall/network rules
4. Check if SSL certificate is valid (production)

**Error**: `ERROR: Failed to create tenant`

**Solution**:
1. Review error response in log file
2. Verify tenant code is unique
3. Check database connectivity
4. Retry with `--force` flag (if supported) or use manual API call

### Issue: Product Configuration Not Saving

**Symptom**: Product created but changes not reflected in queries

**Solution**:
1. Refresh portal (F5)
2. Check browser console for errors
3. Verify user has SP Admin role
4. Check audit logs for permission denials
5. Try again via GraphQL API directly

### Issue: Webhook Not Receiving Events

**Symptom**: SP endpoint registered but no webhooks received

**Solution**:
1. Verify endpoint is publicly reachable: `curl https://sp.example.com/webhooks/contract`
2. Check webhook signing key is correct
3. Review webhook delivery logs in Lōns admin panel
4. Verify SP firewall allows inbound from Lōns IP range
5. Check SP webhook handler for exceptions

### Issue: Customer Cannot Activate Service

**Symptom**: Customer activation fails with unclear error

**Solution**:
1. Check customer KYC status (must be verified)
2. Review pre-qualification rules (does customer meet criteria?)
3. Check credit score availability (scoring service operational?)
4. Review customer transaction history (minimum requirements met?)
5. Check product eligibility rules

### Issue: API Key Not Working

**Symptom**: API requests fail with 401 Unauthorized

**Solution**:
1. Verify Client ID and Client Secret are correct
2. Check token expiration (renew if needed)
3. Verify tenant ID in token matches expected tenant
4. Check IP whitelist (if enabled)
5. Regenerate API key if secret was compromised

### Issue: Revenue Settlement Not Calculating

**Symptom**: Settlement report shows zero revenue or incorrect amounts

**Solution**:
1. Verify revenue sharing configuration is set
2. Check interest rate configuration in product
3. Verify transactions are marked as completed (not pending)
4. Check for overlapping settlement periods
5. Review ledger entries for consistency
6. Manually trigger settlement batch if stuck

---

## Rollback Procedures

### Scenario 1: Critical Bug Discovered Before Go-Live

**Decision Point**: Issue severity + time to fix

**If Fixable < 2 hours**:
1. Pause onboarding
2. Apply fix to staging environment
3. Re-run verification tests
4. Resume onboarding

**If Not Fixable < 2 hours**:
1. Roll back tenant to previous state
2. Reschedule for next week
3. Communicate with SP explaining issue
4. Plan fix for next iteration

### Scenario 2: Go-Live Issues Within First Hour

**Symptoms**: High error rate, disbursement failures, data corruption

**Steps**:

1. **Declare Incident**
   - Notify `#lons-incidents` Slack channel
   - Engage engineering lead
   - Initiate incident bridge (Zoom/phone)

2. **Stabilize**
   - Stop accepting new transactions (if necessary)
   - Revert to last known good state (from backup)
   - Verify data integrity

3. **Investigate**
   - Review error logs
   - Check code changes deployed
   - Check database/infrastructure changes
   - Identify root cause

4. **Fix & Redeploy**
   - Apply fix
   - Test in staging
   - Redeploy to production
   - Verify stability

5. **Resume**
   - Resume transaction processing
   - Monitor closely
   - Notify SP of resolution

### Scenario 3: Tenant Data Corruption

**Steps**:

1. **Isolate**
   - Disable tenant API access
   - Prevent new transactions
   - Lock tenant in portal

2. **Assess**
   - Identify scope of corruption
   - Review audit logs
   - Estimate data loss

3. **Restore**
   - Restore from backup (if available)
   - Replay transactions from audit log if necessary
   - Verify data consistency

4. **Remediate**
   - Identify and fix root cause
   - Implement preventive measures
   - Communicate with SP

5. **Resume**
   - Test in staging first
   - Gradually re-enable transactions
   - Monitor closely

### Scenario 4: Complete Rollback (Deprovisioning)

**Decision**: Legal dispute, SP insolvency, critical compliance breach

**Steps**:

1. **Legal Review**
   - Consult Legal on MSA termination terms
   - Verify authority to deactivate tenant

2. **Data Preservation**
   - Archive all tenant data (cold storage)
   - Maintain audit trail for 7+ years
   - Backup complete database state

3. **Deactivate**
   - Revoke API keys
   - Disable tenant portal access
   - Set tenant status to INACTIVE or DELETED

4. **Notify**
   - Notify SP leadership
   - Provide data export if required
   - Comply with data retention policies

5. **Cleanup**
   - Remove customer-facing links
   - Archive all documentation
   - Update status in CRM

---

## Appendix A: Contact Escalation

### Lōns Internal Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Operations Lead | [Name] | ops@lons.io | +[Country Code] |
| Engineering Lead | [Name] | eng@lons.io | +[Country Code] |
| Compliance Officer | [Name] | compliance@lons.io | +[Country Code] |
| Chief Operations Officer | [Name] | coo@lons.io | +[Country Code] |

### Incident Response

- **Page On-Call**: Use PagerDuty (link: https://lons.pagerduty.com)
- **Slack Bridge**: `#lons-incidents`
- **Escalation**: COO if severity = Critical

---

## Appendix B: Useful Commands

```bash
# Verify tenant exists in production
curl -X POST https://api.lons.io/graphql \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { tenant(id: \"<TENANT_ID>\") { id organizationName } }"}'

# List all products for tenant
curl -X POST https://api.lons.io/graphql \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { products(tenantId: \"<TENANT_ID>\") { id code type } }"}'

# Get API key details
curl -X POST https://api.lons.io/graphql \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { apiKeys(tenantId: \"<TENANT_ID>\") { clientId status createdAt } }"}'

# List all transactions for tenant (last 7 days)
curl -X POST https://api.lons.io/graphql \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { transactions(tenantId: \"<TENANT_ID>\", after: \"7 days ago\") { id type amount status } }"}'
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-29 | Platform BA | Initial version |

---

## Related Documents

- `scripts/tenant-onboarding/README.md` — Automated onboarding script documentation
- `Docs/COMPLIANCE-CHECKLIST.md` — Compliance verification for pre-launch
- `Docs/04-entity-management.md` — Tenant and product management requirements
- `Docs/10-security-compliance.md` — Security and regulatory requirements
