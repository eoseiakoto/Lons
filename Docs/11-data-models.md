# 11 — Data Models

This document defines the database schema, entity relationships, and data architecture for the Lōns platform.

---

## 1. Database Strategy

### 1.1 Multi-Tenancy Approach

Lōns uses a **shared database, tenant-scoped schemas** approach in PostgreSQL:

- A `platform` schema holds global/cross-tenant data (platform config, tenant registry, billing).
- Each tenant gets its own schema (e.g., `tenant_abc123`) containing all business data.
- Row-Level Security (RLS) policies enforce isolation.
- All application queries are automatically scoped to the active tenant's schema via a session variable (`SET search_path`).

### 1.2 Conventions

| Convention | Rule |
|---|---|
| Primary Keys | UUID v7 (time-sortable) |
| Timestamps | `created_at`, `updated_at` (UTC, timestamptz) |
| Soft Delete | `deleted_at` (nullable timestamptz) — no hard deletes for business data |
| Money | `DECIMAL(19,4)` with separate `currency` column (ISO 4217 code) |
| Enums | PostgreSQL native ENUMs for bounded value sets |
| Naming | snake_case for all tables and columns |
| Indexes | On all foreign keys, frequently filtered columns, and composite indexes for common query patterns |

---

## 2. Platform Schema

### 2.1 Entity: `tenants`

The root entity representing each Service Provider.

```
tenants
├── id                  UUID PK
├── name                VARCHAR(255) NOT NULL
├── legal_name          VARCHAR(255)
├── registration_number VARCHAR(100)
├── country             VARCHAR(3) -- ISO 3166-1 alpha-3
├── schema_name         VARCHAR(63) UNIQUE NOT NULL
├── plan_tier           ENUM('starter', 'professional', 'enterprise')
├── status              ENUM('provisioning', 'active', 'suspended', 'decommissioned')
├── settings            JSONB -- tenant-level config overrides
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ
```

### 2.2 Entity: `platform_users`

Platform admin accounts (cross-tenant).

```
platform_users
├── id                  UUID PK
├── email               VARCHAR(255) UNIQUE NOT NULL
├── password_hash       VARCHAR(255) NOT NULL
├── name                VARCHAR(255)
├── role                ENUM('platform_admin', 'platform_support')
├── mfa_secret          VARCHAR(255) -- encrypted
├── mfa_enabled         BOOLEAN DEFAULT false
├── last_login_at       TIMESTAMPTZ
├── locked_until        TIMESTAMPTZ
├── failed_login_count  INTEGER DEFAULT 0
├── status              ENUM('active', 'suspended', 'deactivated')
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ
```

---

## 3. Tenant Schema — Core Entities

All tables below exist within each tenant's schema.

### 3.1 Entity: `users`

SP operator accounts.

```
users
├── id                  UUID PK
├── email               VARCHAR(255) UNIQUE NOT NULL
├── password_hash       VARCHAR(255) NOT NULL
├── name                VARCHAR(255)
├── role_id             UUID FK → roles.id
├── mfa_secret          VARCHAR(255) -- encrypted
├── mfa_enabled         BOOLEAN DEFAULT false
├── last_login_at       TIMESTAMPTZ
├── locked_until        TIMESTAMPTZ
├── failed_login_count  INTEGER DEFAULT 0
├── status              ENUM('active', 'suspended', 'deactivated')
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ
```

### 3.2 Entity: `roles`

```
roles
├── id                  UUID PK
├── name                VARCHAR(100) UNIQUE NOT NULL
├── description         TEXT
├── permissions         JSONB NOT NULL -- array of permission strings
├── is_system           BOOLEAN DEFAULT false -- system roles can't be deleted
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ
```

### 3.3 Entity: `lenders`

Funding entities linked to this SP.

```
lenders
├── id                  UUID PK
├── name                VARCHAR(255) NOT NULL
├── license_number      VARCHAR(100)
├── country             VARCHAR(3)
├── funding_capacity    DECIMAL(19,4)
├── funding_currency    VARCHAR(3)
├── min_interest_rate   DECIMAL(7,4)
├── max_interest_rate   DECIMAL(7,4)
├── settlement_account  JSONB -- encrypted bank/wallet details
├── risk_parameters     JSONB
├── status              ENUM('active', 'suspended', 'inactive')
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ
```

### 3.4 Entity: `customers`

```
customers
├── id                  UUID PK
├── external_id         VARCHAR(255) NOT NULL -- ID from EMI system
├── external_source     VARCHAR(100) -- which EMI system
├── full_name           VARCHAR(255) -- encrypted
├── date_of_birth       DATE -- encrypted
├── gender              ENUM('male', 'female', 'other', 'undisclosed')
├── national_id         VARCHAR(255) -- encrypted
├── national_id_type    VARCHAR(50)
├── phone_primary       VARCHAR(50) -- encrypted
├── phone_secondary     VARCHAR(50) -- encrypted
├── email               VARCHAR(255) -- encrypted
├── country             VARCHAR(3)
├── region              VARCHAR(100)
├── city                VARCHAR(100)
├── kyc_level           ENUM('none', 'tier_1', 'tier_2', 'tier_3')
├── kyc_verified_at     TIMESTAMPTZ
├── segment             VARCHAR(100)
├── status              ENUM('active', 'suspended', 'blacklisted', 'inactive')
├── blacklist_reason    TEXT
├── watchlist           BOOLEAN DEFAULT false
├── metadata            JSONB -- extensible custom fields
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ

UNIQUE INDEX ON (external_id, external_source)
INDEX ON phone_primary
INDEX ON national_id
INDEX ON status
INDEX ON segment
```

### 3.5 Entity: `customer_consents`

```
customer_consents
├── id                  UUID PK
├── customer_id         UUID FK → customers.id
├── consent_type        ENUM('data_access', 'auto_deduction', 'credit_reporting', 'alternative_data', 'communications')
├── granted             BOOLEAN NOT NULL
├── granted_at          TIMESTAMPTZ
├── revoked_at          TIMESTAMPTZ
├── channel             VARCHAR(50) -- how consent was captured
├── version             INTEGER DEFAULT 1
├── ip_address          VARCHAR(45)
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON (customer_id, consent_type)
```

---

## 4. Tenant Schema — Product Entities

### 4.1 Entity: `products`

```
products
├── id                  UUID PK
├── code                VARCHAR(50) UNIQUE NOT NULL
├── name                VARCHAR(255) NOT NULL
├── description         TEXT
├── type                ENUM('overdraft', 'micro_loan', 'bnpl', 'invoice_financing')
├── lender_id           UUID FK → lenders.id
├── currency            VARCHAR(3) NOT NULL
├── min_amount          DECIMAL(19,4)
├── max_amount          DECIMAL(19,4)
├── min_tenor_days      INTEGER
├── max_tenor_days      INTEGER
├── interest_rate_model ENUM('flat', 'reducing_balance', 'tiered')
├── interest_rate       DECIMAL(7,4) -- base rate (tiered uses rate_tiers JSONB)
├── rate_tiers          JSONB -- for tiered models
├── fee_structure       JSONB -- { origination_fee: {type, value}, service_fee: {...}, ... }
├── repayment_method    ENUM('lump_sum', 'equal_installments', 'reducing', 'balloon', 'auto_deduction')
├── grace_period_days   INTEGER DEFAULT 0
├── penalty_config      JSONB -- { type, rate, cap, compound }
├── approval_workflow   ENUM('auto', 'semi_auto', 'single_level', 'multi_level')
├── approval_thresholds JSONB -- for semi_auto and multi_level
├── scoring_model_id    VARCHAR(100)
├── eligibility_rules   JSONB -- pre-qualification criteria
├── revenue_sharing     JSONB -- { lender: 60, sp: 25, emi: 10, platform: 5 }
├── notification_config JSONB -- template IDs per event type
├── cooling_off_hours   INTEGER DEFAULT 0
├── max_active_loans    INTEGER DEFAULT 1 -- per customer
├── version             INTEGER DEFAULT 1
├── status              ENUM('draft', 'active', 'suspended', 'discontinued')
├── activated_at        TIMESTAMPTZ
├── created_by          UUID FK → users.id
├── created_at          TIMESTAMPTZ
├── updated_at          TIMESTAMPTZ
└── deleted_at          TIMESTAMPTZ

INDEX ON type
INDEX ON status
INDEX ON lender_id
```

### 4.2 Entity: `product_versions`

```
product_versions
├── id                  UUID PK
├── product_id          UUID FK → products.id
├── version             INTEGER NOT NULL
├── snapshot            JSONB NOT NULL -- full product config at this version
├── change_summary      TEXT
├── created_by          UUID FK → users.id
├── created_at          TIMESTAMPTZ

UNIQUE INDEX ON (product_id, version)
```

---

## 5. Tenant Schema — Loan Processing Entities

### 5.1 Entity: `subscriptions`

```
subscriptions
├── id                  UUID PK
├── customer_id         UUID FK → customers.id
├── product_id          UUID FK → products.id
├── credit_limit        DECIMAL(19,4)
├── available_limit     DECIMAL(19,4)
├── status              ENUM('active', 'suspended', 'deactivated')
├── activated_at        TIMESTAMPTZ
├── deactivated_at      TIMESTAMPTZ
├── last_limit_review   TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

UNIQUE INDEX ON (customer_id, product_id) WHERE status = 'active'
INDEX ON status
```

### 5.2 Entity: `loan_requests`

```
loan_requests
├── id                  UUID PK
├── idempotency_key     VARCHAR(255) UNIQUE
├── customer_id         UUID FK → customers.id
├── product_id          UUID FK → products.id
├── product_version     INTEGER
├── requested_amount    DECIMAL(19,4)
├── requested_tenor     INTEGER -- days
├── currency            VARCHAR(3)
├── channel             VARCHAR(50) -- API, USSD, wallet_app
├── status              ENUM('received', 'validated', 'pre_qualified', 'scored', 'approved', 'rejected', 'manual_review', 'offer_sent', 'accepted', 'declined', 'expired', 'contract_created', 'disbursing', 'disbursed', 'disbursement_failed', 'cancelled')
├── rejection_reasons   JSONB -- array of reason codes
├── scoring_result_id   UUID FK → scoring_results.id
├── approved_amount     DECIMAL(19,4)
├── approved_tenor      INTEGER
├── offer_details       JSONB -- full offer snapshot
├── offer_expires_at    TIMESTAMPTZ
├── accepted_at         TIMESTAMPTZ
├── contract_id         UUID FK → contracts.id
├── processed_by        UUID FK → users.id -- for manual review
├── processing_notes    TEXT
├── metadata            JSONB
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON customer_id
INDEX ON product_id
INDEX ON status
INDEX ON created_at
```

### 5.3 Entity: `scoring_results`

```
scoring_results
├── id                  UUID PK
├── customer_id         UUID FK → customers.id
├── product_id          UUID FK → products.id
├── model_type          ENUM('rule_based', 'ml_model', 'hybrid')
├── model_version       VARCHAR(50)
├── score               DECIMAL(7,2)
├── score_range_min     DECIMAL(7,2)
├── score_range_max     DECIMAL(7,2)
├── probability_default DECIMAL(5,4) -- 0.0000 to 1.0000
├── risk_tier           ENUM('low', 'medium', 'high', 'critical')
├── recommended_limit   DECIMAL(19,4)
├── contributing_factors JSONB -- top factors with weights
├── input_features      JSONB -- all features used (for auditability)
├── confidence          DECIMAL(5,4)
├── context             ENUM('application', 'review', 'renewal', 'monitoring')
├── created_at          TIMESTAMPTZ

INDEX ON customer_id
INDEX ON created_at
```

### 5.4 Entity: `contracts`

```
contracts
├── id                  UUID PK
├── contract_number     VARCHAR(50) UNIQUE NOT NULL -- human-readable
├── customer_id         UUID FK → customers.id
├── product_id          UUID FK → products.id
├── product_version     INTEGER
├── lender_id           UUID FK → lenders.id
├── loan_request_id     UUID FK → loan_requests.id
├── principal_amount    DECIMAL(19,4) NOT NULL
├── interest_rate       DECIMAL(7,4) NOT NULL
├── interest_amount     DECIMAL(19,4) -- total interest for the loan
├── total_fees          DECIMAL(19,4) -- total fees
├── total_cost_credit   DECIMAL(19,4) -- principal + interest + fees
├── currency            VARCHAR(3) NOT NULL
├── tenor_days          INTEGER
├── repayment_method    ENUM('lump_sum', 'equal_installments', 'reducing', 'balloon', 'auto_deduction')
├── start_date          DATE NOT NULL
├── maturity_date       DATE NOT NULL
├── first_payment_date  DATE
├── outstanding_principal DECIMAL(19,4)
├── outstanding_interest  DECIMAL(19,4)
├── outstanding_fees      DECIMAL(19,4)
├── outstanding_penalties DECIMAL(19,4)
├── total_outstanding   DECIMAL(19,4) -- sum of all outstanding
├── total_paid          DECIMAL(19,4)
├── days_past_due       INTEGER DEFAULT 0
├── status              ENUM('active', 'performing', 'due', 'overdue', 'delinquent', 'default', 'written_off', 'settled', 'cancelled')
├── classification      ENUM('performing', 'special_mention', 'substandard', 'doubtful', 'loss')
├── terms_snapshot      JSONB -- full terms at contract creation
├── restructured        BOOLEAN DEFAULT false
├── restructure_count   INTEGER DEFAULT 0
├── disbursement_id     UUID FK → disbursements.id
├── metadata            JSONB
├── settled_at          TIMESTAMPTZ
├── defaulted_at        TIMESTAMPTZ
├── written_off_at      TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON customer_id
INDEX ON product_id
INDEX ON status
INDEX ON classification
INDEX ON days_past_due
INDEX ON maturity_date
INDEX ON created_at
```

### 5.5 Entity: `repayment_schedule`

```
repayment_schedule
├── id                  UUID PK
├── contract_id         UUID FK → contracts.id
├── installment_number  INTEGER NOT NULL
├── due_date            DATE NOT NULL
├── principal_amount    DECIMAL(19,4)
├── interest_amount     DECIMAL(19,4)
├── fee_amount          DECIMAL(19,4)
├── total_amount        DECIMAL(19,4) NOT NULL
├── paid_amount         DECIMAL(19,4) DEFAULT 0
├── status              ENUM('pending', 'partial', 'paid', 'overdue', 'waived')
├── paid_at             TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

UNIQUE INDEX ON (contract_id, installment_number)
INDEX ON due_date
INDEX ON status
```

### 5.6 Entity: `disbursements`

```
disbursements
├── id                  UUID PK
├── contract_id         UUID FK → contracts.id
├── customer_id         UUID FK → customers.id
├── amount              DECIMAL(19,4) NOT NULL
├── currency            VARCHAR(3) NOT NULL
├── channel             VARCHAR(50) -- wallet_provider, bank_transfer
├── destination         VARCHAR(255) -- wallet ID or account number (encrypted)
├── external_ref        VARCHAR(255) -- provider transaction reference
├── status              ENUM('pending', 'processing', 'completed', 'failed', 'reversed')
├── retry_count         INTEGER DEFAULT 0
├── failure_reason      TEXT
├── completed_at        TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON contract_id
INDEX ON status
INDEX ON external_ref
```

### 5.7 Entity: `repayments`

```
repayments
├── id                  UUID PK
├── contract_id         UUID FK → contracts.id
├── customer_id         UUID FK → customers.id
├── amount              DECIMAL(19,4) NOT NULL
├── currency            VARCHAR(3) NOT NULL
├── method              ENUM('auto_deduction', 'manual', 'bulk', 'third_party', 'fee_recovery')
├── source              VARCHAR(50) -- wallet, bank, card
├── external_ref        VARCHAR(255) -- provider transaction reference
├── allocated_principal DECIMAL(19,4)
├── allocated_interest  DECIMAL(19,4)
├── allocated_fees      DECIMAL(19,4)
├── allocated_penalties DECIMAL(19,4)
├── status              ENUM('pending', 'processing', 'completed', 'failed', 'reversed')
├── failure_reason      TEXT
├── receipt_number      VARCHAR(50)
├── completed_at        TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON contract_id
INDEX ON customer_id
INDEX ON status
INDEX ON created_at
```

### 5.8 Entity: `ledger_entries`

```
ledger_entries
├── id                  UUID PK
├── contract_id         UUID FK → contracts.id
├── entry_type          ENUM('disbursement', 'interest_accrual', 'fee', 'penalty', 'repayment', 'adjustment', 'write_off', 'reversal')
├── debit_credit        ENUM('debit', 'credit')
├── amount              DECIMAL(19,4) NOT NULL
├── currency            VARCHAR(3) NOT NULL
├── running_balance     DECIMAL(19,4) NOT NULL
├── effective_date      DATE NOT NULL
├── value_date          DATE NOT NULL
├── description         TEXT
├── reference_type      VARCHAR(50) -- repayment, fee_rule, etc.
├── reference_id        UUID -- ID of the source record
├── created_at          TIMESTAMPTZ

-- Ledger entries are IMMUTABLE — no updated_at, no deletes
INDEX ON contract_id
INDEX ON effective_date
INDEX ON entry_type
```

---

## 6. Tenant Schema — Supporting Entities

### 6.1 Entity: `audit_logs`

```
audit_logs
├── id                  UUID PK
├── actor_id            UUID -- user or service ID
├── actor_type          ENUM('user', 'system', 'api_key')
├── actor_ip            VARCHAR(45)
├── action              VARCHAR(100) NOT NULL
├── resource_type       VARCHAR(100) NOT NULL
├── resource_id         UUID
├── before_value        JSONB
├── after_value         JSONB
├── correlation_id      UUID
├── metadata            JSONB
├── created_at          TIMESTAMPTZ NOT NULL

-- APPEND-ONLY: no update, no delete
INDEX ON actor_id
INDEX ON resource_type, resource_id
INDEX ON action
INDEX ON created_at
```

### 6.2 Entity: `notifications`

```
notifications
├── id                  UUID PK
├── customer_id         UUID FK → customers.id
├── contract_id         UUID FK → contracts.id (nullable)
├── event_type          VARCHAR(100) NOT NULL
├── channel             ENUM('sms', 'push', 'email', 'in_app')
├── recipient           VARCHAR(255) -- phone, email, device token
├── template_id         VARCHAR(100)
├── content             TEXT -- rendered message
├── status              ENUM('pending', 'sent', 'delivered', 'failed', 'bounced')
├── external_ref        VARCHAR(255) -- provider message ID
├── retry_count         INTEGER DEFAULT 0
├── sent_at             TIMESTAMPTZ
├── delivered_at        TIMESTAMPTZ
├── failed_at           TIMESTAMPTZ
├── failure_reason      TEXT
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON customer_id
INDEX ON status
INDEX ON event_type
INDEX ON created_at
```

### 6.3 Entity: `webhook_deliveries`

```
webhook_deliveries
├── id                  UUID PK
├── webhook_config_id   UUID FK → webhook_configs.id
├── event_type          VARCHAR(100) NOT NULL
├── payload             JSONB NOT NULL
├── target_url          VARCHAR(2048)
├── http_status         INTEGER
├── response_body       TEXT
├── response_time_ms    INTEGER
├── retry_count         INTEGER DEFAULT 0
├── status              ENUM('pending', 'delivered', 'failed', 'exhausted')
├── next_retry_at       TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── updated_at          TIMESTAMPTZ

INDEX ON webhook_config_id
INDEX ON status
INDEX ON event_type
INDEX ON created_at
```

---

## 7. Entity Relationship Diagram (Summary)

```
tenants (platform schema)
  │
  └── [tenant schema]
        ├── users ←──── roles
        ├── lenders
        ├── products ──── product_versions
        │     │
        ├── customers ──── customer_consents
        │     │
        ├── subscriptions (customer × product)
        │     │
        ├── loan_requests ──── scoring_results
        │     │
        ├── contracts ──── repayment_schedule
        │     │              ├── disbursements
        │     │              ├── repayments
        │     │              └── ledger_entries
        │     │
        ├── settlements
        ├── reconciliation_reports
        ├── audit_logs
        ├── notifications
        └── webhook_deliveries
```
