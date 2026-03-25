# 10 — Security & Compliance

This document defines security, encryption, audit, and regulatory compliance requirements for the Lōns platform.

---

## 1. Authentication

### 1.1 Functional Requirements

#### FR-SEC-001: Portal Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-001.1 | All O&M Portal users SHALL authenticate with email + password, with mandatory MFA (TOTP or SMS-based). | Must |
| FR-SEC-001.2 | Passwords SHALL meet minimum complexity requirements: 12+ characters, mixed case, numbers, and special characters. | Must |
| FR-SEC-001.3 | Passwords SHALL be hashed using bcrypt (cost factor 12+) or Argon2id. Plain text passwords SHALL never be stored or logged. | Must |
| FR-SEC-001.4 | Sessions SHALL expire after configurable inactivity timeout (default: 30 minutes). | Must |
| FR-SEC-001.5 | The system SHALL enforce account lockout after 5 consecutive failed login attempts, with lockout duration configurable (default: 15 minutes). | Must |
| FR-SEC-001.6 | The system SHALL support Single Sign-On (SSO) via SAML 2.0 or OpenID Connect for enterprise SP customers. | Should |

#### FR-SEC-002: API Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-002.1 | API authentication SHALL use JWT tokens with RS256 signing. Tokens SHALL include tenant ID, user/service identity, roles, and expiry. | Must |
| FR-SEC-002.2 | API key pairs (client ID + secret) SHALL be generated per tenant with configurable scopes. | Must |
| FR-SEC-002.3 | API secrets SHALL be displayed only once at creation and stored as salted hashes. | Must |
| FR-SEC-002.4 | Token refresh SHALL be supported with short-lived access tokens (default: 1 hour) and longer-lived refresh tokens (default: 7 days). | Must |

---

## 2. Authorization

### 2.1 Functional Requirements

#### FR-SEC-003: Role-Based Access Control (RBAC)

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-003.1 | The system SHALL implement RBAC with the following default roles and permissions (customizable per tenant): **Platform Admin** — full system access, **SP Admin** — full tenant access, **SP Operator** — loan operations + customer management, **SP Analyst** — read-only reports and dashboards, **SP Auditor** — read-only access to all data including audit logs, **SP Collections** — collections queue + recovery actions. | Must |
| FR-SEC-003.2 | Permissions SHALL be granular, covering: resource type (product, customer, contract, etc.), action (create, read, update, delete, approve, export), and scope (own records, team records, all tenant records). | Must |
| FR-SEC-003.3 | Custom roles SHALL be creatable by SP Admins by combining granular permissions. | Should |

#### FR-SEC-004: Data Isolation

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-004.1 | Tenant data isolation SHALL be enforced at the database level using PostgreSQL Row-Level Security (RLS) policies. | Must |
| FR-SEC-004.2 | Every database query SHALL include a tenant context filter, applied automatically by the ORM middleware — never relying on application-level filtering alone. | Must |
| FR-SEC-004.3 | Cross-tenant data access SHALL be impossible through the API, even with a valid token from another tenant. | Must |
| FR-SEC-004.4 | Platform Admin access to tenant data SHALL be logged separately with enhanced audit detail. | Must |

---

## 3. Encryption

### 3.1 Functional Requirements

#### FR-SEC-005: Data in Transit

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-005.1 | All external communications SHALL use TLS 1.2 or higher. TLS 1.0 and 1.1 SHALL be disabled. | Must |
| FR-SEC-005.2 | Internal service-to-service communication SHALL use mutual TLS (mTLS) or encrypted channels. | Should |
| FR-SEC-005.3 | The system SHALL enforce HSTS (HTTP Strict Transport Security) for all web-facing endpoints. | Must |

#### FR-SEC-006: Data at Rest

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-006.1 | All PII fields SHALL be encrypted at rest using AES-256-GCM. Encrypted fields include: national ID numbers, full names (when combined with national ID), phone numbers, email addresses, and KYC documents. | Must |
| FR-SEC-006.2 | Encryption keys SHALL be managed by a dedicated key management system (AWS KMS, HashiCorp Vault, or equivalent). | Must |
| FR-SEC-006.3 | Key rotation SHALL be supported without downtime, on a configurable schedule (default: annual). | Must |
| FR-SEC-006.4 | Database backups SHALL be encrypted. | Must |

#### FR-SEC-007: Application-Level Security

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-007.1 | API keys and secrets SHALL be stored as salted, hashed values — never in plain text. | Must |
| FR-SEC-007.2 | Sensitive data SHALL be masked in logs (e.g., phone: `+233***7890`, national ID: `GHA-***-XXX`). | Must |
| FR-SEC-007.3 | The system SHALL not expose sensitive data in error messages, stack traces, or API responses beyond what the caller is authorized to see. | Must |

---

## 4. Audit Trail

### 4.1 Functional Requirements

#### FR-SEC-008: Audit Logging

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-008.1 | The system SHALL log all significant actions in an immutable audit trail, including: user authentication events (login, logout, failed attempts, MFA), data access events (who viewed which customer records), data modification events (before and after values), configuration changes (product, tenant, user, role), financial events (disbursement, repayment, settlement, write-off), API key management (creation, rotation, revocation), and administrative actions (user creation, role assignment, blacklist management). | Must |
| FR-SEC-008.2 | Each audit entry SHALL include: event ID (UUID), timestamp (UTC, microsecond precision), actor (user ID or system service), actor IP address, tenant ID, action type, affected resource (type + ID), before/after values (for modifications), and correlation ID (linking related events). | Must |
| FR-SEC-008.3 | Audit logs SHALL be stored in an append-only store — modification and deletion SHALL be technically impossible. | Must |
| FR-SEC-008.4 | Audit logs SHALL be retained for a configurable period (minimum 7 years for financial regulations). | Must |

---

## 5. Regulatory Compliance

### 5.1 Functional Requirements

#### FR-SEC-009: KYC/AML Compliance

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-009.1 | The system SHALL support tiered KYC verification levels (e.g., Tier 1: basic ID, Tier 2: address proof, Tier 3: income verification), with product eligibility tied to KYC level. | Must |
| FR-SEC-009.2 | The system SHALL support AML screening by integrating with watchlist/sanctions databases (configurable per jurisdiction). | Should |
| FR-SEC-009.3 | Suspicious transaction patterns SHALL be flagged for manual review (configurable rules: unusual amount, unusual frequency, rapid borrowing across products). | Should |

#### FR-SEC-010: Data Protection Compliance

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-010.1 | The system SHALL support compliance with data protection regulations including Ghana Data Protection Act, Kenya Data Protection Act, Nigeria NDPR, GDPR (for any EU-based operations), and other jurisdiction-specific regulations. | Must |
| FR-SEC-010.2 | Compliance requirements SHALL include: consent management (see FR-CM-005), data minimization (only collect what's needed), right to access (customer data export), right to deletion (anonymization), data retention policies, and cross-border data transfer controls. | Must |

#### FR-SEC-011: Financial Regulation Compliance

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-011.1 | The system SHALL support configurable interest rate caps per jurisdiction (enforced at product configuration time). | Must |
| FR-SEC-011.2 | The system SHALL support configurable penalty caps and total cost of credit disclosures per jurisdiction. | Must |
| FR-SEC-011.3 | The system SHALL generate regulatory reports in formats required by local central banks and financial authorities. | Should |
| FR-SEC-011.4 | Loan contract terms SHALL be validated against jurisdiction-specific rules before activation. | Must |

---

## 6. Security Operations

### 6.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-SEC-012 | The system SHALL implement automated vulnerability scanning in the CI/CD pipeline. | Should |
| FR-SEC-013 | Dependencies SHALL be monitored for known vulnerabilities with automated alerts. | Must |
| FR-SEC-014 | The system SHALL implement Content Security Policy (CSP) headers for the O&M Portal. | Must |
| FR-SEC-015 | All user inputs SHALL be validated and sanitized to prevent injection attacks (SQL, XSS, CSRF). | Must |
| FR-SEC-016 | The system SHALL support IP whitelisting for API access (configurable per tenant). | Should |
| FR-SEC-017 | The system SHALL implement request signing for webhook deliveries (HMAC-SHA256). | Must |
