# PII Masking Audit & Defense-in-Depth Strategy

## Overview

Lōns handles sensitive Personally Identifiable Information (PII) across multiple services. This document audits PII handling across the platform and enforces defense-in-depth masking at multiple layers: application, logging, and log ingestion.

**Last Updated:** 2026-03-29
**Compliance Scope:** GDPR, local African fintech regulations, secure logging best practices

---

## PII Data Fields

The Lōns platform processes the following PII fields:

| Field | Type | Example | Handling |
|-------|------|---------|----------|
| `national_id` | String (VarChar 255) | GHA-123456789-X | Encrypted at rest, masked in logs |
| `full_name` | String (VarChar 255) | John Doe Smith | Encrypted at rest, masked in logs |
| `phone_primary` | String (VarChar 50) | +233501234567 | Encrypted at rest, masked in logs |
| `phone_secondary` | String (VarChar 50) | +233509876543 | Encrypted at rest, masked in logs |
| `email` | String | user@domain.com | Masked in logs (if stored) |
| `date_of_birth` | Date | 1990-05-15 | Encrypted at rest, masked in logs |
| `account_number` | String | ACC-XXXXX | Masked in logs (if exposed) |

---

## Services Handling PII

### 1. Entity Service (`services/entity-service`)

**Responsibilities:**
- Customer CRUD operations
- Profile management
- Stores all customer PII fields

**PII Exposure Points:**
- Create customer (accepts national_id, full_name, phone_primary, phone_secondary, email, date_of_birth)
- Update customer profile
- GraphQL queries: `customer`, `customers` (returns full records)
- Database reads (PostgreSQL)

**Mitigation:**
- PII encrypted at rest in PostgreSQL using AES-256-GCM (encryption keys from AWS Secrets Manager)
- NestJS logger middleware masks PII in stdout before FluentBit collects
- Field-level authorization: sensitive fields require explicit permission checks
- Audit logs track all PII access

---

### 2. Process Engine (`services/process-engine`)

**Responsibilities:**
- Loan request → scoring → approval → offer → acceptance pipeline
- Creates contracts, reads customer data

**PII Exposure Points:**
- Loan request creation (reads customer PII for pre-qualification)
- Contract generation (may include customer name, ID)
- GraphQL queries: `loanRequest`, `loanRequests`

**Mitigation:**
- Reads customer PII from entity-service (encrypted)
- Masks PII in logs during request processing
- Contract PDFs should be generated server-side (never sent over logs)

---

### 3. Repayment Service (`services/repayment-service`)

**Responsibilities:**
- Payment processing
- Repayment schedule generation
- Reads customer data for reconciliation

**PII Exposure Points:**
- Payment instruction logs (may contain customer identification)
- Repayment records linked to customer

**Mitigation:**
- Masks customer identifiers in logs (only ID, not name/phone)
- Payment details (amounts, dates) are logged; PII fields are masked

---

### 4. Scoring Service (`services/scoring-service`)

**Responsibilities:**
- Credit scoring (rule-based and ML)
- Pre-qualification logic

**PII Exposure Points:**
- Accepts customer data for scoring input
- May generate feature vectors from PII fields

**Mitigation:**
- Python FastAPI service: implements PII masking in request/response logs
- Scoring results use only customer ID, not full PII
- ML models: trained on de-identified datasets

---

### 5. Recovery Service (`services/recovery-service`)

**Responsibilities:**
- Collections queue and workflow
- AI-driven recovery strategy

**PII Exposure Points:**
- Collections queue displays customer contact info
- SMS/email dispatch requires phone/email

**Mitigation:**
- Admin portal shows masked customer identifiers
- Actual phone/email fetched at dispatch time (from entity-service)
- Notification logs mask phone/email patterns

---

### 6. Notification Service (`services/notification-service`)

**Responsibilities:**
- SMS, email, push notification dispatch
- Logs for delivery tracking

**PII Exposure Points:**
- Phone numbers (SMS dispatch)
- Email addresses (email dispatch)
- Notification templates may include customer names

**Mitigation:**
- Masks phone/email in delivery logs
- Template rendering happens server-side
- No PII stored in message queue; only customer ID

---

### 7. Integration Service (`services/integration-service`)

**Responsibilities:**
- Wallet adapters (MTN MoMo, M-Pesa)
- Credit bureau integration
- Telecom system APIs

**PII Exposure Points:**
- Wallet API requests may include customer phone/ID
- Bureau queries pass customer ID and name
- Telecom integrations require phone numbers

**Mitigation:**
- Masks PII in request/response logs before transmission
- Wallet adapters use customer ID + encrypted phone lookup
- Bureau requests use ID-only queries where possible

---

### 8. Settlement & Reconciliation (`services/settlement-service`, `services/reconciliation-service`)

**Responsibilities:**
- Revenue settlement calculations
- Daily reconciliation batch

**PII Exposure Points:**
- Reconciliation reports may include customer identifiers
- Settlement ledgers linked to customer accounts

**Mitigation:**
- Reports use customer ID only (no name, phone, email)
- Ledger entries are append-only (no updates)
- Audit logs track all report access

---

## PII Masking Layers

### Layer 1: NestJS Logger Middleware (Application)

**Location:** `packages/common/src/logging/pii-mask.middleware.ts`

**Implementation:**
- Intercepts all HTTP requests/responses
- Regex patterns mask PII before logging to stdout
- Applied before logs leave the application process

**Patterns:**
```typescript
// Phone: +233501234567 → +233***4567
phone: /(\+\d{3})\d+(\d{4})/g

// National ID: GHA-123456789-X → GHA-***-X
national_id: /([A-Z]{3}-)\w+(-\w)/g

// Email: user@domain.com → u***@domain.com
email: /(\w)\w+(@[\w.]+)/g

// Full name: John Doe Smith → ***MASKED***
full_name: /^[A-Za-z\s]+$/  // Replace with ***MASKED***
```

**Coverage:**
- All NestJS services (graphql-server, rest-server, scheduler, notification-worker)
- Python FastAPI uses equivalent masking in `services/scoring-service/logging/pii_mask.py`

---

### Layer 2: FluentBit Lua Filter (Log Ingestion)

**Location:** `infrastructure/helm/lons/templates/logging/fluent-bit-config.yaml`

**Implementation:**
- DaemonSet deployed to every Kubernetes node
- Tails container logs from `/var/log/containers/lons-*.log`
- Lua script applies additional masking at container log boundary
- Defense-in-depth: catches any PII missed by application logging

**Patterns:** Same as Layer 1 (idempotent)

**Coverage:**
- All containerized services
- Catches PII in unstructured log lines

---

### Layer 3: CloudWatch Native Log Filtering (Optional)

**Location:** AWS CloudWatch Logs subscription filters

**Implementation:**
- Lambda function or CloudWatch Insights queries
- Optional third layer for compliance requirements

**Coverage:**
- Double-checks for residual PII patterns in production logs

---

## Exempt Fields

### Audit Logs

Audit logs are **exempt from PII masking** because they contain:
- User ID (never name, phone, or email)
- Action performed (e.g., "viewed_customer", "created_loan")
- Timestamp
- Service/API endpoint

**Rationale:** Audit logs must remain searchable and auditable; they are immutable, append-only, and retained separately from operational logs.

**Example:**
```json
{
  "timestamp": "2026-03-29T10:15:30Z",
  "userId": "usr-abc123",
  "action": "customer:view",
  "resourceId": "cust-xyz789",
  "ipAddress": "192.168.1.100",
  "outcome": "success"
}
```

---

## Data at Rest Encryption

In addition to log masking, PII fields are encrypted at rest in PostgreSQL:

| Field | Encryption | Key Management |
|-------|-----------|-----------------|
| `national_id` | AES-256-GCM | AWS Secrets Manager |
| `full_name` | AES-256-GCM | AWS Secrets Manager |
| `phone_primary` | AES-256-GCM | AWS Secrets Manager |
| `phone_secondary` | AES-256-GCM | AWS Secrets Manager |
| `date_of_birth` | AES-256-GCM | AWS Secrets Manager |

**Implementation:** See `packages/common/src/encryption/` for AES-256-GCM utilities.

**Key Rotation:** Keys rotated quarterly; old keys retained for decryption (linked to key version).

---

## Field-Level Authorization

PII fields are protected by field-level authorization checks in GraphQL:

**Example (GraphQL Resolver):**
```typescript
@Field(() => String, { nullable: true })
@Authorized(['read:customer:sensitive'])
public_id?: string;  // Only users with 'read:customer:sensitive' permission

@Field(() => String, { nullable: true })
@Authorized(['read:customer:sensitive'])
phone_primary?: string;
```

**Roles:**
- `read:customer:basic` — ID, status, created_at
- `read:customer:sensitive` — PII fields (name, phone, ID, DOB)
- `read:customer:full` — All fields (internal staff)

---

## Compliance & Regulatory Requirements

### GDPR Compliance

- **Article 32 (Security):** Encryption at rest + masking in logs ✓
- **Article 33 (Breach Notification):** Audit logs enable breach investigation ✓
- **Article 17 (Right to Erasure):** Soft deletes on customer records; encrypted PII can be securely deleted

### Local African Fintech Regulations

- **Responsible Lending (Ghana, Kenya, etc.):** Customer identification and KYC data secured ✓
- **Data Protection (South Africa POPIA, Nigeria NDPR):** Encryption + purpose limitation ✓
- **Audit Trail:** Immutable audit logs retained for 7 years ✓

---

## Testing & Verification

### Unit Tests

**Location:** `services/*/src/logging/__tests__/pii-mask.spec.ts`

**Coverage:**
- Phone number masking (multiple formats: +233, +254, etc.)
- National ID masking
- Email masking
- Edge cases (null, empty, short strings)

**Example Test:**
```typescript
describe('PII Masking', () => {
  it('should mask phone numbers', () => {
    const input = 'Contacted +233501234567 yesterday';
    const output = maskPII(input);
    expect(output).toMatch(/\+233\*\*\*4567/);
    expect(output).not.toContain('501234');
  });
});
```

### Integration Tests

**Location:** `tests/integration/logging/pii-masking.spec.ts`

**Coverage:**
- End-to-end PII masking: API request → stdout → FluentBit → CloudWatch
- Verify logs do not contain unmasked PII

---

## Operational Procedures

### Log Inspection (Troubleshooting)

When investigating issues:

1. **Search CloudWatch Logs** using customer ID (not name/phone)
   ```bash
   # Good: Search by customer ID
   fields @timestamp, @message | filter customerId = "cust-abc123"

   # Bad: Search by phone (will only find masked values)
   fields @timestamp, @message | filter phone = "+233501234567"
   ```

2. **Access PII values** from customer detail page in Admin Portal (requires `read:customer:sensitive` role)

3. **Audit trail:** All PII access is logged in audit logs

### Monitoring PII Leaks

**CloudWatch Insights Query:**
```sql
fields @timestamp, @message
| filter @message like /(\+\d{3})\d{4,}/ or @message like /[A-Z]{3}-\d{4,}/ or @message like /\w+@\w+\.\w+/
| stats count() as PII_PATTERNS_FOUND
```

**Alert:** Trigger SNS alert if PII patterns detected (should be ~0)

---

## Checklist for New Services

When adding a new service:

- [ ] Identify PII inputs (customer, personal data)
- [ ] Implement NestJS/FastAPI logger middleware (or import from `packages/common`)
- [ ] Add unit tests for PII masking
- [ ] Add to `CLAUDE.md` PII handling section
- [ ] Document service in this audit
- [ ] Test logs in dev environment before merge
- [ ] Review logs post-deployment in staging

---

## References

- **Database Schema:** `Docs/11-data-models.md` — Customer and PII field definitions
- **Security Policy:** `Docs/10-security-compliance.md` — Encryption, RBAC, audit trails
- **Deployment:** `Docs/13-deployment.md` — AWS Secrets Manager, log retention
- **Encryption Utilities:** `packages/common/src/encryption/` — AES-256-GCM helpers
- **Logger Middleware:** `packages/common/src/logging/` — PII masking implementation
