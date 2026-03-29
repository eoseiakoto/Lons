# Compliance Pre-Launch Checklist

Comprehensive compliance verification for each jurisdiction before Lōns platform launches to production.

---

## Table of Contents

1. [Overview](#overview)
2. [General Platform Compliance](#general-platform-compliance)
3. [Ghana — Data Protection Act (2012)](#ghana--data-protection-act-2012)
4. [Kenya — Data Protection Act (2019)](#kenya--data-protection-act-2019)
5. [Nigeria — NDPR (2019) / NDPA (2023)](#nigeria--ndpr-2019--ndpa-2023)
6. [Technical Security Controls](#technical-security-controls)
7. [Financial Compliance](#financial-compliance)
8. [Operational Readiness](#operational-readiness)
9. [Verification & Sign-Off](#verification--sign-off)

---

## Overview

### Purpose

This checklist ensures the Lōns platform complies with all applicable regulatory and security requirements before launching in each jurisdiction and before accepting customer data.

### Scope

- **Jurisdictions**: Ghana, Kenya, Nigeria (plus any additional markets)
- **Regulations**: Data protection, financial lending, consumer protection
- **Teams Responsible**: Compliance, Engineering, Operations
- **Sign-Off Authority**: Chief Compliance Officer (final approval)

### Completion Timeline

- **Before Launch**: All items must be completed and verified
- **Review Frequency**: Quarterly (changes in regulations)
- **Update Cadence**: When new features launched, when expanding to new markets

### Success Criteria

- [ ] All "Must" items completed and documented
- [ ] All "Should" items completed (or documented exception)
- [ ] No open critical findings
- [ ] Legal counsel sign-off obtained
- [ ] Regulatory notification sent (if required)
- [ ] No customer data processed until sign-off complete

---

## General Platform Compliance

### Data Protection & Privacy

#### Encryption at Rest

- [ ] **AES-256-GCM Encryption Verified**
  - Implementation: All PII fields encrypted before database storage
  - PII fields: national_id, full_name, phone, email, date_of_birth
  - Algorithm: AES-256-GCM (authenticated encryption)
  - Verification method: Code review + unit test verification
  - Test case: Encrypt sensitive field → verify ciphertext ≠ plaintext
  - Documented in: `/packages/common/src/encryption/`

- [ ] **Encryption Key Management**
  - Key provider: AWS Secrets Manager / HashiCorp Vault / environment variable
  - Key rotation: Supported without downtime
  - Key access: Least privilege (only encryption service can decrypt)
  - Rotation schedule: Annually (configurable)
  - Tested: Key rotation in staging environment successful

- [ ] **Database Encryption**
  - PostgreSQL: At-rest encryption enabled (encryption per cloud provider)
  - RTO/RPO: Backup encryption tested and verified

#### PII Masking in Logs

- [ ] **Application-Level Masking**
  - Implementation: NestJS logger middleware masks PII
  - Pattern matching: `phone: +233***7890`, `national_id: GHA-***-XXX`
  - Verification: Search logs for unmasked PII → zero results
  - Test case: Log sensitive operation → verify PII masked in output

- [ ] **Log Aggregation Pipeline**
  - Shipper: FluentBit with Lua filter script
  - Lua script: Regex-based masking of PII patterns
  - Sink: Elasticsearch (with access controls)
  - Retention: 30 days hot, 90 days archive
  - Test case: Send log entry with PII → verify masked in ElasticSearch

- [ ] **Error Messages & Stack Traces**
  - PII never exposed in error responses
  - Stack traces: Not shown in production (only to authenticated admins)
  - Verification: Search error logs → no unmasked PII in user-facing messages

#### Audit Trail & Immutability

- [ ] **Audit Log Storage**
  - Table: `audit_logs` (append-only)
  - Fields: event_id, timestamp, actor, action, resource_id, before, after, correlation_id
  - Immutability: No UPDATE/DELETE permissions (database role restrictions)
  - Retention: Minimum 7 years (configurable per jurisdiction)
  - Verified: Attempt UPDATE audit_log → permission denied

- [ ] **Audit Entry Completeness**
  - User authentication events logged: login, logout, failed attempts
  - Data access logged: who viewed customer records (if sensitive access)
  - Data modification logged: before/after values for all updates
  - Configuration changes logged: product, tenant, user, role changes
  - Financial events logged: disbursement, repayment, settlement, write-off
  - API key management logged: creation, rotation, revocation
  - Administrative actions logged: user creation, role assignment

- [ ] **Audit Timestamp Accuracy**
  - Precision: Microsecond (6 decimal places)
  - Timezone: UTC (no timezone ambiguity)
  - Synchronized: NTP synced across all servers
  - Verification: Clock skew check in monitoring

#### Data Retention & Deletion

- [ ] **Retention Policies Configured**
  - Customer data: Retained for contract duration + jurisdiction minimum (7 years)
  - Audit logs: 7+ years (per financial regulations)
  - Backups: 90-day retention, encrypted
  - Logs: 30 days (hot) + 90 days (archive)
  - Documented in: `Docs/10-security-compliance.md`

- [ ] **Right to Erasure (GDPR/DPA Compliance)**
  - Soft delete implemented: `deleted_at` timestamp
  - Verification: Confirm deleted customers not queryable via API
  - Recovery: Reversible within 30-day grace period (configurable)
  - Hard delete: Only after retention period + legal hold release
  - Audit log: Deletion events logged with reason

- [ ] **Data Export & Portability**
  - Export format: JSON or CSV per customer request
  - Includes: All customer data, contracts, transactions
  - Timeline: Within 30 days of request
  - Process: Manual request → verification → export → delivery
  - Documented procedure in: Operations runbook

#### Consent Management

- [ ] **Customer Consent Collection**
  - Mechanism: Explicit checkbox during customer activation
  - Consent records: Stored in `customer_consents` table
  - Scope: Processing of personal data, marketing, analytics
  - Withdrawal: Customer can withdraw consent anytime
  - Verification: `consent_id` linked to each data processing event

- [ ] **Consent Documentation**
  - Consent text: Clear, plain language (translated per jurisdiction)
  - Consent timestamp: Captured at collection time
  - IP address: Recorded for audit trail
  - Revocation: Customers can revoke via portal
  - Logged: All consent events in audit trail

#### Data Breach Notification

- [ ] **Breach Response Procedure Documented**
  - Detection: Automated alerting on suspicious access patterns
  - Investigation: Root cause analysis within 24 hours
  - Notification: Affected customers within 72 hours (GDPR requirement)
  - Authorities: Notify regulatory body (DPA, NDPR commissioner, etc.)
  - Communication: Template letters prepared per jurisdiction
  - Documented in: Incident response playbook

---

## Ghana — Data Protection Act (2012)

### Regulatory Context

- **Regulator**: Data Protection Commission (if registration required)
- **Scope**: All processing of personal data of Ghanaian residents
- **Key Requirements**: Consent (§18), purpose limitation (§20), security (§28), cross-border transfer controls (§36)

### Compliance Checklist

#### DPA Registration & Notification

- [ ] **Assess Registration Requirement**
  - Determine: Is Lōns acting as Data Controller or Processor?
  - If Controller: Register with Ghana DPA (§10 and Part II)
  - Registration status: [COMPLETED / NOT REQUIRED / PENDING]
  - Registration number: [If applicable]
  - Registered: [Date]

- [ ] **Data Protection Policy Document**
  - Policy published: URL: [link to policy]
  - Covers: Data collection, processing, retention, security
  - Language: English (primary) + Twi or other local language (if required)
  - Review frequency: Annually

#### Consent & Transparency

- [ ] **Consent Mechanism Compliant with DPA §18**
  - Explicit opt-in: Customer must actively consent (no pre-checked boxes)
  - Timing: Before any personal data processing
  - Scope: Clear scope of data processing activities
  - Withdrawal: Easy withdrawal mechanism (no barriers)
  - Language: Plain language, translated to local language if needed

- [ ] **Privacy Notices**
  - Provided at: Point of data collection
  - Contains: Purpose, data types, retention, recipient details
  - Language: Accessible (English + Twi or local)
  - Format: Easy to read (not hidden in Terms & Conditions)

#### Purpose Limitation (DPA §20)

- [ ] **Data Processed Only for Declared Purposes**
  - Declared purposes: Loan origination, underwriting, repayment, collections
  - Verification: Audit logs confirm data used only for these purposes
  - Exception: Legal obligation or data subject consent for new purpose
  - Test case: Query database for any customer data usage outside declared scope

- [ ] **Purpose Change Procedure**
  - If new purpose identified: Obtain fresh consent from customer
  - Document: Purpose change in audit trail
  - Notify: Data Protection Commission (if required)

#### Data Security (DPA §28)

- [ ] **Security Measures Implemented**
  - Encryption: AES-256-GCM for all PII at rest (verified above)
  - Access controls: RBAC with least privilege
  - Audit logs: Append-only, immutable (verified above)
  - Incident response: Plan documented and tested
  - Penetration testing: Annual schedule confirmed

#### Cross-Border Data Transfer (DPA §36)

- [ ] **Data Location Assessment**
  - Primary storage: PostgreSQL in [AWS region: eu-west-1 Ireland]
  - Backup: Encrypted backups in [AWS region or similar jurisdiction]
  - Determination: Data transfer compliant? [YES / NO / PENDING]
  - Note: EU/EEA storage acceptable if not prohibited by Ghana DPA

- [ ] **Transfer Mechanism (if required)**
  - Adequacy decision: [GDPR adequacy or DPA equivalence]
  - Safeguards: Standard contractual clauses or binding corporate rules
  - Documentation: Data transfer agreement signed
  - Verified: [Date]

#### Subject Rights (DPA §§15-22)

- [ ] **Right to Access (DPA §15)**
  - Mechanism: Customer portal self-service data export
  - Timeline: Response within 30 days
  - Format: Structured, machine-readable (JSON/CSV)
  - Free: One request per year free; additional requests may have fee

- [ ] **Right to Correction (DPA §16)**
  - Mechanism: Customer can request correction of inaccurate data
  - Process: Verify request → correct data → notify relevant parties
  - Timeline: 30 days to complete

- [ ] **Right to Deletion**
  - Mechanism: Request deletion (right to be forgotten)
  - Exceptions: Legal obligation to retain (e.g., financial records)
  - Implementation: Soft delete (anonymize where possible)
  - Retention: Comply with 7-year financial record retention

### Ghana-Specific Financial Compliance

- [ ] **Interest Rate Caps Enforced**
  - Bank of Ghana guidance: Interest rates compliant with BoG directives
  - Configured: Maximum rate per product type
  - Verification: Code review confirms rate validation at product creation

- [ ] **Total Cost of Credit Disclosure**
  - Calculation: APR including all fees, interest, charges
  - Presentation: Clear on loan offer before customer acceptance
  - Format: [Verify language and display format]

- [ ] **Currency Compliance**
  - Lōns platform currency: GHS (Ghana Cedi)
  - Configured: All financial calculations in GHS
  - Verification: No currency conversion without explicit disclosure

---

## Kenya — Data Protection Act (2019)

### Regulatory Context

- **Regulator**: Office of the Data Protection Commissioner (ODPC)
- **Scope**: All processing of personal data of Kenyan residents
- **Key Aspects**: Lawful basis (Clause 2.3), privacy impact assessment, breach notification (Clause 43)

### Compliance Checklist

#### DPA Registration & Impact Assessment

- [ ] **Registration with ODPC**
  - Determine: Should Lōns register as Data Controller/Processor?
  - Registration status: [COMPLETED / PENDING / NOT REQUIRED]
  - Registration number: [If applicable]
  - Certificate: Obtained and stored
  - Valid until: [Date]

- [ ] **Data Protection Impact Assessment (DPIA)**
  - Completed: [Date]
  - Scope: Loan origination, credit scoring, collections
  - Identified risks: [High/Medium/Low]
  - Mitigation measures: [Documented]
  - ODPC notification: [If required for high-risk processing]
  - DPIA location: `/docs/compliance/dpia-kenya.pdf`

#### Lawful Basis for Processing (Clause 2.3)

- [ ] **Consent Mechanism (Primary Basis)**
  - Consent obtained: Before any personal data processing
  - Explicit opt-in: No pre-checked boxes or dark patterns
  - Scope clear: Customer understands what data processed and why
  - Withdrawal: Easy mechanism to withdraw consent
  - Recorded: Consent timestamp and data captured

- [ ] **Alternative Lawful Basis (if applicable)**
  - Contractual necessity: Processing required for loan contract
  - Legal obligation: Processing required by CBK or tax law
  - Legitimate interest: [If claimed, must pass balancing test]
  - Documentation: Basis for processing clearly documented

#### Data Subject Rights (DPA §26)

- [ ] **Right to Access (§26(1)(a))**
  - Mechanism: Self-service data export in portal
  - Timeline: Response within 30 days
  - Format: Portable format (JSON, CSV, PDF)
  - Fee: No charge for first request; reasonable fee for subsequent

- [ ] **Right to Rectification (§26(1)(b))**
  - Mechanism: Customer can request correction of inaccurate data
  - Process: Verify → correct → notify recipients
  - Timeline: 30 days to complete

- [ ] **Right to Erasure (§26(1)(c))**
  - Implementation: Right to be forgotten with exceptions
  - Exceptions: Legal/contractual retention obligations
  - Method: Soft delete (anonymization) where possible

- [ ] **Right to Restrict Processing (§26(1)(d))**
  - Mechanism: Customer can request processing suspension
  - Grounds: Accuracy dispute, unlawful processing, legitimate interest assessment
  - Implementation: Flag in system, prevent automated processing

- [ ] **Right to Data Portability (§26(1)(f))**
  - Format: Portable format (JSON, CSV)
  - Deadline: 30 days
  - Includes: All customer data

#### Data Breach Notification (§43)

- [ ] **Notification Timeline**
  - Timeframe: Within 72 hours of discovery
  - Method: Written notification to ODPC + affected individuals
  - Exceptions: If no material risk (low risk can notify later)

- [ ] **Breach Notification Content**
  - Notification template prepared: [Yes/No]
  - Includes: Nature of breach, data affected, likely consequences, measures taken
  - Language: Kenyan English + local language if necessary

- [ ] **Breach Register Maintained**
  - Log breaches: All suspected/confirmed breaches logged
  - Investigation: Root cause analysis documented
  - Resolution: Corrective actions documented
  - Retention: 3-year minimum

#### CBK Digital Lending Regulations

- [ ] **CBK Licensing Assessment**
  - Determine: Does Lōns need CBK license?
  - If SP acts as lender: SP must have appropriate CBK license
  - If Lōns acts as technology provider: Technology provider license (if required)
  - Status: [COMPLIANT / NOT APPLICABLE / PENDING]
  - License/exemption: [Number/status]

- [ ] **CBK Reporting Requirements**
  - Weekly reports: [If required] Digital lending platform status
  - Monthly reports: [If required] Lending volume, default rates
  - Quarterly reports: [If required] Compliance status
  - Reporting mechanism: CBK online portal / email
  - Verified: Latest report submitted [Date]

- [ ] **Interest Rate Caps**
  - CBK capped rate: Apply Central Bank capped lending rate (if applicable)
  - Configured: Maximum rate validated at product creation
  - Verification: Code review confirms rate validation

#### Data Location & Transfer

- [ ] **Data Residency**
  - Primary location: AWS Ireland (eu-west-1) [GDPR-compliant region]
  - Assessment: Acceptable under Kenya DPA? [YES / PENDING]
  - Alternative: [If data must be stored in Kenya]
  - Contract: Data processing agreement (DPA) in place

---

## Nigeria — NDPR (2019) / NDPA (2023)

### Regulatory Context

- **Regulator**: NITDA (National Information Technology Development Authority)
- **Acts**: NDPR (2019) + NDPA (2023, signed but pending full implementation)
- **Scope**: All personal data processing in/for Nigeria
- **Key Aspects**: Consent (Article 2.3), DPIA filing, DPO requirement, local data storage

### Compliance Checklist

#### NDPR Registration & DPIA Filing

- [ ] **NDPR Data Controller/Processor Status**
  - Determine: Lōns role as controller or processor?
  - Registration: [COMPLETED / PENDING / NOT REQUIRED]
  - Status: [COMPLIANT / NON-COMPLIANT / PENDING]
  - Registration date: [If completed]

- [ ] **Data Protection Impact Assessment (DPIA) with NITDA**
  - DPIA completed: [Date]
  - Scope: Loan origination, underwriting, collections, defaults
  - Risk assessment: High/Medium/Low
  - Mitigation measures: Documented
  - NITDA filing: Required? [YES / NO]
  - Filing status: [SUBMITTED / PENDING / NOT REQUIRED]
  - Filing reference: [If filed]

#### Data Protection Officer (DPO)

- [ ] **DPO Designated**
  - Name: [DPO Name]
  - Contact: [Email + Phone]
  - Qualifications: [Expert in data protection law]
  - Role: Appointed as independent data protection officer
  - Report to: [Board/Chief Compliance Officer]
  - Publicly visible: Contact info published (website + portal)

- [ ] **DPO Responsibilities Documented**
  - Monitor compliance: Ongoing NDPR compliance checks
  - Respond to requests: Handle customer data access/deletion requests
  - Support investigations: Cooperate with NITDA inquiries
  - Training: Conduct staff data protection training
  - Record-keeping: Maintain processing records and DPIAs

#### Consent Mechanism (Article 2.3)

- [ ] **Explicit Consent**
  - Timing: Before any personal data processing
  - Opt-in only: No pre-checked boxes (opt-out not acceptable)
  - Clarity: Purpose of processing stated in clear language
  - Language: Translated to local language (if applicable)
  - Withdrawal: Easy consent withdrawal mechanism

- [ ] **Consent Records**
  - Timestamp: Exact time consent obtained
  - IP address: For audit trail
  - Method: How consent obtained (checkbox, digital signature, etc.)
  - Scope: Specific purposes for which consent granted
  - Linked: To each data processing event

#### Mandatory Data Protection Rights

- [ ] **Right to Access (NDPR Article 2.2(a))**
  - Mechanism: Self-service portal or manual request
  - Timeline: Response within 30 days
  - Format: Portable format (JSON, CSV, PDF)
  - Cost: Free (one per year); reasonable fee thereafter

- [ ] **Right to Correction (NDPR Article 2.2(b))**
  - Mechanism: Request correction of inaccurate data
  - Process: Verify → correct → notify where shared
  - Timeline: 30 days

- [ ] **Right to Deletion (NDPR Article 2.2(c))**
  - Scope: Right to be forgotten with legal exceptions
  - Exceptions: Contractual obligations (7-year retention), law requirements
  - Implementation: Soft delete/anonymization where possible

- [ ] **Data Breach Notification (NDPR Article 5)**
  - Timeframe: Notify NITDA + individuals without undue delay (recommend ≤ 72 hours)
  - Content: Nature, scope, likely impact, remedial measures
  - Notification template: Prepared and translated
  - Breach register: Maintained for 3 years

#### Data Localization Requirements

- [ ] **Primary Data Location Assessment**
  - Requirement: Check if NDPR/NDPA requires data storage in Nigeria
  - Current setup: AWS Ireland (eu-west-1)
  - Compliance: Acceptable? [YES / NO / PENDING]
  - If NO: Plan for Nigeria data center
    - [ ] Identify: Nigeria-based AWS/GCP region or local provider
    - [ ] Timeline: Migration plan by [Date]
    - [ ] Cost: Budget approved?

- [ ] **Cross-Border Data Transfer Controls (NDPR Article 3)**
  - Transfer mechanism: Adequate safeguards in place?
  - Options: Standard contractual clauses, adequacy decision, binding rules
  - Documentation: Data transfer agreement (DTA) signed
  - Verified: [Date]

#### Sensitive Data Protections

- [ ] **Financial Data**
  - Encryption: AES-256-GCM at rest (verified above)
  - Access control: Restricted to authorized personnel only
  - Audit: All access logged and reviewed regularly

- [ ] **Biometric Data** (if used)
  - Explicit consent: Obtained separately from other consents
  - Storage: Encrypted and isolated
  - Deletion: Can be deleted on request (non-reversible)
  - Use: Only for authentication, not for profiling

### Nigeria-Specific Financial Compliance

- [ ] **CBN (Central Bank of Nigeria) Digital Lending Guidelines**
  - Applicability: [If SP is regulated by CBN]
  - Compliance status: [COMPLIANT / PENDING / NOT APPLICABLE]
  - Key requirements:
    - [ ] Interest rate cap compliance
    - [ ] APR disclosure
    - [ ] Total cost of credit
    - [ ] Customer protection
    - [ ] Complaint handling
    - [ ] Data security (as per CBN/NDPR)

- [ ] **Interest Rate Caps (CBN / NDPR)**
  - Maximum rate per product: [Verified and configured]
  - Validation: Code enforces rate cap at product creation
  - Test case: Attempt to create product with rate > cap → denied

- [ ] **Total Cost of Credit Disclosure**
  - Calculation: APR = base rate + fees + all charges
  - Disclosure: On loan offer before customer acceptance
  - Format: Clear, easy-to-understand
  - Translation: Available in English and local language

- [ ] **Complaint Handling**
  - Process: Documented procedure for customer complaints
  - Timeline: Respond within 30 days
  - Escalation: Path to ombudsman/CBN if unresolved
  - Records: Maintained for regulatory review

---

## Technical Security Controls

### Network & Transport Security

#### TLS/HTTPS

- [ ] **TLS 1.2+ Enforced**
  - External endpoints: All use HTTPS with TLS 1.2 minimum
  - Configuration: Verified via SSL Labs or similar test
  - Test result: Grade [A/A+]
  - Grade link: [URL]

- [ ] **TLS 1.0 and 1.1 Disabled**
  - Verification: Attempt connection with TLS 1.0 → rejected
  - Configuration: Server rejects deprecated protocols
  - Enforced globally: All endpoints

#### HSTS (HTTP Strict Transport Security)

- [ ] **HSTS Enabled**
  - Header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - Max-age: 1 year (31536000 seconds)
  - Preload: Submitted to HSTS preload list? [YES / PENDING]
  - Verified: HSTS header present on all HTTPS responses

#### Internal Service Communication

- [ ] **Mutual TLS (mTLS) Between Services**
  - Implementation: Internal service-to-service uses mTLS
  - Service mesh: [Istio / Linkerd / None]
  - Certificates: Auto-rotated, short-lived (24 hours)
  - Verification: Communication without mTLS certificate → denied

- [ ] **Network Segmentation**
  - Internal network: Isolated from public internet
  - Firewall rules: Service-to-service communication explicit
  - Denied: Internet → database, cache, internal services
  - Ingress: Only through API gateway

### API Security

#### Authentication

- [ ] **JWT Authentication (RS256)**
  - Algorithm: RS256 (asymmetric, RSA)
  - Signature: Private key signed, public key verification
  - Payload: Includes tenant_id, user_id, roles, expiry
  - Expiry: Short-lived (1 hour); refresh tokens for longer sessions
  - Verification: Token signature validated on every API call

- [ ] **API Key Pairs (Client ID + Secret)**
  - Secret storage: Hashed (bcrypt) in database, never returned after creation
  - Rotation: Supported (generate new, revoke old)
  - Scope: Configurable per key pair (read, write, delete)
  - Verification: API key authentication tested end-to-end

#### Rate Limiting

- [ ] **Rate Limiting Configured**
  - Policy: Per-tenant, per-IP, per-API-key
  - Limits: [e.g., 1000 req/min per tenant]
  - Implementation: Redis-backed (distributed)
  - Response: 429 (Too Many Requests) when limit exceeded
  - Headers: Retry-After included in response
  - Verified: Test with tool (e.g., Apache Bench)

#### Input Validation & Sanitization

- [ ] **Input Validation Implemented**
  - Framework: NestJS class-validator decorators
  - Coverage: All API endpoints
  - Validation rules: Type checking, length limits, format validation
  - Response: 400 Bad Request with validation errors
  - Test case: Send invalid email → validation error

- [ ] **Injection Attack Prevention**
  - SQL Injection: ORM (Prisma) prevents parameterized queries
  - XSS: HTML escaping on all user inputs
  - CSRF: CSRF tokens on state-changing operations
  - Command injection: No OS command execution of user inputs
  - Verification: Code review + automated testing (SAST)

#### CORS Configuration

- [ ] **CORS Properly Configured**
  - Allowed origins: Specific to legitimate domains only
  - Not: `*` (wildcard) in production
  - Allowed methods: POST, GET (as needed)
  - Allowed headers: Authorization, Content-Type (minimal)
  - Credentials: Only if necessary (with care)
  - Test: Preflight request from unauthorized origin → denied

### Application Security

#### Dependency Management

- [ ] **Dependency Vulnerability Scanning**
  - Tool: npm audit, Snyk, or Dependabot
  - Frequency: Continuous (on every commit)
  - Failed checks: CI/CD blocks merge if high/critical vulnerabilities
  - Update policy: Security updates applied within 7 days
  - Latest scan: [Date] - Result: [PASS/FAIL]

- [ ] **Supply Chain Security**
  - Lock files: `package-lock.json` / `pnpm-lock.yaml` committed
  - Integrity check: Dependencies verified by hash
  - License audit: No GPL/AGPL licenses in production code
  - Verification: [Date] - Result: COMPLIANT

#### Secret Management

- [ ] **No Secrets in Code/Logs**
  - Scan: Code repo scanned for secrets (API keys, passwords, tokens)
  - Tool: git-secrets, TruffleHog, or Semgrep
  - Result: [Date] - Zero secrets found
  - Prevention: Pre-commit hook blocks secrets in commits

- [ ] **Environment Variables for Sensitive Config**
  - Database URLs: Environment variable (not in code)
  - API keys: Environment variable or KMS
  - Encryption keys: KMS / Vault (not environment if possible)
  - .env file: Only in development (not in version control)

#### Code Quality & Analysis

- [ ] **Static Application Security Testing (SAST)**
  - Tool: SonarQube, Semgrep, or ESLint security plugins
  - Coverage: 100% of codebase
  - Severity levels: High/Critical issues blocking merge
  - Latest scan: [Date] - Result: [PASS/FAIL]

- [ ] **Dynamic Application Security Testing (DAST)**
  - Tool: OWASP ZAP, Burp Suite, or similar
  - Scope: All API endpoints
  - Frequency: Monthly or before release
  - Latest scan: [Date] - Result: [PASS/FAIL]
  - Issues: [List any findings + remediation]

### Infrastructure Security

#### Database Security

- [ ] **Row-Level Security (RLS) Enabled**
  - Implementation: PostgreSQL RLS policies enforced
  - Tenant isolation: Every table has RLS policy for tenant filtering
  - Verification: Query cross-tenant data without RLS → denied
  - Test case: Admin token from Tenant A cannot access Tenant B data

- [ ] **Database Access Controls**
  - Authentication: Strong credentials (not default passwords)
  - Network: Database not publicly accessible (private network only)
  - Firewall rules: Only application servers can connect
  - Monitoring: Connection logs reviewed regularly

- [ ] **Backup & Recovery**
  - Frequency: Daily automated backups
  - Encryption: Backups encrypted with separate key
  - Testing: Monthly restore test performed
  - Retention: 90 days (aligned with regulations)
  - Recovery time objective (RTO): < 4 hours
  - Recovery point objective (RPO): < 1 hour
  - Verified: [Date] - Last successful restore

#### Container Security

- [ ] **Container Image Scanning**
  - Tool: Trivy, Grype, or Docker Scout
  - Frequency: Every build (pre-push to registry)
  - Failed checks: Block push if high/critical vulnerabilities
  - Latest scan: [Date] - Result: [PASS/FAIL]

- [ ] **Secrets Not in Container Images**
  - Verification: No API keys, passwords, tokens in images
  - Tool: git-secrets or container scanning tool
  - Runtime injection: Secrets provided via environment/KMS only
  - Test: Inspect container filesystem → no secrets found

#### Monitoring & Logging

- [ ] **Application Logging**
  - Framework: Structured logging (JSON format)
  - Levels: DEBUG, INFO, WARN, ERROR (with correlation IDs)
  - Aggregation: Centralized log aggregation (ELK, CloudWatch, etc.)
  - Retention: 30 days hot, 90 days archive
  - PII Masking: Verified above

- [ ] **Security Event Monitoring**
  - Failed login attempts: Logged and alerted (5+ in 15 min)
  - API key generation: Logged with timestamp
  - Permission denials: Logged and reviewed
  - Configuration changes: Logged with before/after values
  - Anomaly detection: Configured for suspicious patterns

- [ ] **Intrusion Detection**
  - Tool: Host-based IDS or cloud provider native (CloudTrail, GuardDuty)
  - Coverage: All production infrastructure
  - Alerting: Real-time notifications for suspicious activity
  - Response: Automated or manual incident response procedure

### Incident Response

- [ ] **Incident Response Plan Documented**
  - Document: Location [/docs/security/incident-response-plan.md]
  - Scope: Data breaches, DDoS, service outages, credential compromise
  - Steps: Detection → containment → investigation → remediation → notification
  - Review: Annual review and testing
  - Last tested: [Date]

- [ ] **Security Incident Tracking**
  - Tool: GitHub Issues, JIRA, or dedicated security tracker
  - Labels: security, incident, severity:critical/high/medium/low
  - Response time SLA: Critical [2 hours], High [24 hours]
  - Closed incidents: Linked to post-mortem and remediation

---

## Financial Compliance

### Monetary Calculations

- [ ] **Decimal Data Type Enforced**
  - Database: `DECIMAL(19,4)` for all monetary amounts
  - ORM: Prisma `Decimal` type
  - Code: No use of JavaScript `number` for money
  - Test case: Calculate 1.23 + 4.56 → 5.79 (exact, no float error)

- [ ] **API Responses Use String Amounts**
  - Format: `{ "amount": "1234.5678", "currency": "GHS" }`
  - Never: `{ "amount": 1234.5678, "currency": "GHS" }`
  - Verification: API response inspection (no number type for amounts)
  - Test case: Query contract amount → returned as string, not number

- [ ] **Rounding: Banker's Rounding (Round Half to Even)**
  - Implementation: All interest/fee calculations use banker's rounding
  - Examples:
    - 2.5 rounds to 2 (nearest even)
    - 3.5 rounds to 4 (nearest even)
  - Test cases: Comprehensive unit tests for rounding corner cases
  - Verified: [Date] - Unit tests passing

#### Interest & Fee Calculations

- [ ] **Interest Rate Calculation Logic**
  - Formula: Interest = Principal × Rate × (Days / 365) [for annual rates]
  - Precision: Minimum 4 decimal places (DECIMAL(19,4))
  - Compounding: Specify if simple vs. compound interest
  - Test case: Calculate interest on GHS1000 at 10% for 30 days → verify result
  - Documentation: Interest calculation formula documented in product spec

- [ ] **APR (Annual Percentage Rate) Disclosure**
  - Calculation: Includes base interest + all fees + charges
  - Disclosure: On loan offer before customer acceptance
  - Format: Clear percentage (e.g., "14.5% APR")
  - Regulation: Compliant per jurisdiction (Ghana, Kenya, Nigeria)
  - Test case: Generate offer → verify APR includes all fees

- [ ] **Fee Calculations**
  - Origination fee: [Percentage or fixed amount]
  - Service fee: [Per installment or per contract]
  - Late payment penalty: [Fixed or percentage]
  - Insurance levy: [If applicable]
  - Implementation: All fees calculated deterministically
  - Test case: Create contract → verify all fees applied correctly

#### Repayment Allocation

- [ ] **Waterfall Allocation Logic**
  - Priority order: Fees → Interest → Principal
  - Deterministic: Same payment produces same allocation every time
  - Test cases: Multiple allocation scenarios (partial, full, over-payment)
  - Documentation: Waterfall logic documented in repayment spec
  - Verified: Unit tests covering all scenarios

- [ ] **Repayment Schedule Accuracy**
  - Generation: Schedule created at contract origination
  - Installment amount: Exact calculation (no rounding discrepancies)
  - Last installment: May be rounded to clear remaining balance
  - Test case: Generate schedule for GHS3000 at 10% over 3 months → verify total = GHS3300 + fees

#### Ledger & Settlement

- [ ] **Double-Entry Ledger**
  - Implementation: Every transaction has debit + credit entry
  - Balance: Total debits = Total credits (always)
  - Verification: Nightly reconciliation confirms balance
  - Immutable: Ledger entries append-only (no modification)
  - Test case: Post transaction → verify debit + credit entries created

- [ ] **Settlement Calculation Accuracy**
  - Gross revenue: Sum of all fees + interest for period
  - Net settlement: After expenses and revenue sharing
  - Revenue sharing: Split per configured percentages (SP / Lender / Lōns)
  - Verification: Settlement report line-items reconcile to ledger entries
  - Test case: Settle week's transactions → verify amounts match ledger

#### Default & Write-Off

- [ ] **Default Classification**
  - Trigger: [e.g., 90+ days overdue, 3+ missed payments]
  - Automatic: Triggered by scheduler on configurable schedule
  - Reversible: Can be reversed if customer cures default
  - Logged: Default event in audit trail with reason code

- [ ] **Write-Off Calculation**
  - Timing: After [e.g., 180 days] of non-payment
  - Amount: Remaining principal + accrued interest
  - Journal entry: Charge to provision for bad debts (revenue impact)
  - Reversal: Possible if amount recovered later
  - Verified: Write-off journal entries reconcile to contract defaults

---

## Operational Readiness

### Monitoring & Alerting

- [ ] **Application Performance Monitoring (APM)**
  - Tool: New Relic, DataDog, or Grafana Loki
  - Metrics: API latency (p50/p95/p99), error rate, throughput
  - Thresholds: Alert if p95 latency > [500ms], error rate > [1%]
  - Dashboard: Real-time monitoring dashboard accessible
  - Retention: 7-day detail, 1-year metrics data

- [ ] **Infrastructure Monitoring**
  - CPU/Memory: Alert if > 80% utilization
  - Disk: Alert if > 85% full
  - Network: Monitor for unusual traffic patterns
  - Database connections: Alert if > 80% of pool
  - Verified: Monitoring dashboards show all metrics

- [ ] **Security Event Alerting**
  - Failed logins (5+): Real-time alert
  - API key creation: Logged and alerted
  - Permission denials: Logged for audit review
  - Configuration changes: Logged with before/after
  - Incident response: Automated response for critical alerts

### Backup & Disaster Recovery

- [ ] **Backup Strategy**
  - Frequency: Daily automated backups (non-blocking)
  - Encryption: Backups encrypted with separate key
  - Location: Geographically diverse (different region)
  - Retention: 90 days
  - Testing: Monthly restore test from backup

- [ ] **Disaster Recovery Plan**
  - RTO (Recovery Time Objective): < 4 hours
  - RPO (Recovery Point Objective): < 1 hour
  - Failover: Automatic to backup infrastructure [if configured]
  - Testing: Annual DR drill scheduled
  - Last drill: [Date] - Result: SUCCESSFUL

- [ ] **Business Continuity**
  - Critical services: Identified and prioritized
  - Redundancy: Critical services have redundancy (active-active or active-passive)
  - Graceful degradation: Non-critical services can fail without impacting core
  - Communication plan: Stakeholder notification plan documented

### Incident Management

- [ ] **Incident Response Team**
  - On-call rotation: 24/7 on-call coverage established
  - Escalation path: L1 → L2 → L3 → CTO (documented)
  - Contact list: Updated (names, emails, phone numbers)
  - Training: Team trained in incident response procedures

- [ ] **Incident Tracking**
  - Tool: GitHub Issues, JIRA, or dedicated tracker
  - Severity levels: Critical, High, Medium, Low
  - Response time SLA: Critical [2 hours], High [24 hours]
  - Post-incident review: Scheduled within 5 business days
  - Root cause analysis: Documented for all incidents

- [ ] **Service Level Agreements (SLAs)**
  - Availability target: [e.g., 99.9% uptime]
  - Response time: [e.g., P95 < 500ms]
  - Error rate: [e.g., < 0.1% 5xx errors]
  - Reporting: Monthly SLA report to stakeholders

### Documentation & Training

- [ ] **Operational Runbooks**
  - Tenant onboarding: `scripts/tenant-onboarding/README.md`
  - Deployment: `Docs/13-deployment.md`
  - Incident response: `/docs/security/incident-response-plan.md`
  - Backup/restore: Documented procedure
  - Database migration: Documented procedure

- [ ] **Staff Training**
  - Security awareness: Annual training for all staff
  - Data protection: Training on GDPR/DPA/NDPR requirements
  - Incident response: Training for ops team
  - Customer data handling: Training for customer service team
  - Completion: [Date] - 100% staff trained

- [ ] **Customer-Facing Documentation**
  - Privacy policy: Compliant with regulations, translated
  - Terms of service: Clear, accessible language
  - API documentation: Complete with examples
  - Complaint procedure: Clear escalation path
  - Data rights: Explain right to access, deletion, portability

---

## Verification & Sign-Off

### Internal Verification

| Item | Owner | Verification Method | Status | Date |
|------|-------|----------------------|--------|------|
| Data encryption verified | Engineering | Code review + unit tests | [✓/✗] | [Date] |
| PII masking verified | Engineering | Log inspection + grep | [✓/✗] | [Date] |
| Audit logging enabled | Engineering | Query audit table | [✓/✗] | [Date] |
| TLS/HTTPS enforced | DevOps | SSL Labs test | [✓/✗] | [Date] |
| Rate limiting active | Engineering | Test with load tool | [✓/✗] | [Date] |
| Backup/restore tested | DevOps | Restore from backup | [✓/✗] | [Date] |
| Monitoring configured | DevOps | Dashboard review | [✓/✗] | [Date] |

### Legal & Compliance Verification

- [ ] **Privacy Policy Review**
  - Draft: Legal reviewed privacy policy
  - Status: [APPROVED / PENDING / REVISIONS]
  - Translated: English + [local language]
  - Published: URL [link to policy]
  - Review date: [Date]

- [ ] **Data Processing Agreement (DPA)**
  - Status: [SIGNED / PENDING / NOT REQUIRED]
  - Signatories: Lōns + Customer [if customer is data controller]
  - Scope: Processing of customer personal data
  - Review date: [Date]

- [ ] **Terms of Service**
  - Status: [APPROVED / PENDING]
  - Liability: Legal reviewed liability clauses
  - Governing law: [Ghana / Kenya / Nigeria] law applies
  - Dispute resolution: Arbitration / court jurisdiction

- [ ] **Regulatory Notification** (if required)
  - Ghana: DPA notification [if registration required]
  - Kenya: ODPC notification [per DPA 2019]
  - Nigeria: NITDA DPIA filing [if required]
  - Status: [COMPLETED / NOT REQUIRED / PENDING]

### Executive Sign-Off

- [ ] **Chief Compliance Officer**
  - Name: [Name]
  - Title: Chief Compliance Officer
  - Signature: _________________________
  - Date: [Date]
  - Attestation: "I certify that the Lōns platform complies with all applicable regulatory requirements and is ready for production launch."

- [ ] **Chief Information Security Officer**
  - Name: [Name]
  - Title: CISO / Head of Security
  - Signature: _________________________
  - Date: [Date]
  - Attestation: "I certify that the security controls documented above have been implemented, tested, and verified."

- [ ] **Chief Executive Officer / Chief Operating Officer**
  - Name: [Name]
  - Title: [CEO / COO]
  - Signature: _________________________
  - Date: [Date]
  - Attestation: "I authorize the launch of the Lōns platform in [jurisdiction] with the compliance measures documented in this checklist."

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-29 | Platform BA | Initial version covering GH, KE, NG |

---

## Related Documents

- `Docs/04-entity-management.md` — Tenant and product management
- `Docs/10-security-compliance.md` — Security and auth requirements
- `Docs/13-deployment.md` — Deployment and infrastructure
- `scripts/tenant-onboarding/README.md` — Onboarding automation
- `Docs/TENANT-ONBOARDING-RUNBOOK.md` — Operational procedures
