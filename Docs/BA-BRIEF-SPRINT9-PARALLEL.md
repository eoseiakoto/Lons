# BA Brief — Parallel Spec Work During Sprint 9

**From:** PM (Claude)
**To:** BA (Claude)
**Date:** 2026-04-14
**Priority:** HIGH — these specs are on the critical path for Sprints 10-12

---

## Context

Sprint 9 focuses on regulatory foundations (AML, cooling-off, exposure rules, data anonymization, CI quality). While the dev agent executes Sprint 9, the BA must produce specs for the three product-type epics (Sprints 10-12) and one outstanding item from Sprint 8. These specs must be ready before the respective sprint starts — they are blocking dependencies.

All four product types are confirmed in-scope for v1.0 launch (per Project Owner, April 14).

---

## Deliverable 1: Overdraft Architecture ADR

**Needed by:** Sprint 10 start
**Output:** `Docs/ADR-overdraft-realtime.md`
**Monday.com:** 11743596951

The current process engine is application-triggered with a linear state machine (received → validated → scored → approved → disbursed). Overdraft requires an event-driven real-time path that is fundamentally different from the existing flow.

### What the BA must define:

**1. Architecture decision: Separate service vs process engine extension**

Evaluate two approaches and recommend one with trade-offs:

- **Option A — Separate `overdraft-service`**: A lightweight, dedicated service that handles real-time credit line management independently. Receives wallet webhook events, makes sub-second drawdown decisions, and emits events back to the core system for ledger/settlement. Pros: isolation, no risk to existing flows, optimized for latency. Cons: code duplication, separate deployment, cross-service consistency.

- **Option B — Product-type branching in process engine**: Extend the existing state machine with an overdraft-specific pipeline branch triggered by product type. Pros: single service, shared infrastructure. Cons: adds complexity to a working system, latency requirements may conflict with batch-oriented design.

Consider: the process engine currently has no real-time event hooks, no CreditLine model, and no wallet balance event types in event-contracts. What's the path of least resistance that still meets the sub-second requirement?

**2. CreditLine entity model**

Define the CreditLine model for Prisma schema:
- Fields: customerId, tenantId, productId, approvedLimit, availableBalance, currency, status (active/frozen/closed/suspended), interestRate, activatedAt, expiresAt, lastDrawdownAt
- Relationships: belongs to Customer, belongs to Product, has many Drawdowns
- Status transitions and rules (e.g., freeze on overdue, auto-close on expiry)

**3. Drawdown and auto-repayment flows**

- Drawdown trigger: wallet insufficient balance webhook → credit line check → auto-disburse shortfall
- Auto-repayment trigger: wallet credit event → check outstanding overdraft → auto-collect repayment
- Intra-day interest accrual: how frequently (hourly? per-drawdown?), calculation method
- What happens when drawdown would exceed credit limit? Partial drawdown or reject?

**4. Event types needed**

Define new events for `packages/event-contracts/`:
- `wallet.balance.insufficient` (from integration service webhook handler)
- `creditline.drawdown.initiated`, `creditline.drawdown.completed`, `creditline.drawdown.failed`
- `creditline.repayment.auto_collected`
- `creditline.limit.changed`, `creditline.frozen`, `creditline.closed`

**5. Integration requirements**

- What wallet webhook events are needed from MTN MoMo / M-Pesa? (insufficient balance callback, transaction notification)
- Is this a push model (wallet pushes event to Lōns) or pull model (Lōns polls wallet balance)?
- Latency SLA: what's the acceptable time from wallet event to drawdown completion?

### Reference docs:
- `Docs/01-loan-portfolio.md` §2 (Overdraft product type, FR-OD-001 through FR-OD-005)
- `Docs/05-process-engine.md` (current state machine design)
- `Docs/09-integrations.md` §2 (wallet adapter interface, webhook registration)
- Current codebase: `services/process-engine/src/loan-request-state-machine.ts`, `services/integration-service/src/webhook/`

---

## Deliverable 2: BNPL Merchant Entity & Flow Spec

**Needed by:** Sprint 11 start
**Output:** `Docs/SPEC-bnpl-merchant.md`
**Monday.com:** 11743576673

The BNPL product type introduces a new entity (Merchant) and a new origination flow (purchase-triggered, not application-based). Neither exists in the current system.

### What the BA must define:

**1. Merchant entity model**

Define the Merchant model for Prisma schema:
- Core fields: name, registrationNumber, country, category/MCC, contactEmail, contactPhone, settlementAccount (JSON), status
- KYC fields: What merchant due diligence is required? (business registration, tax ID, bank account verification)
- Relationship to Tenant: A Merchant belongs to a Tenant (SP onboards their own merchants)
- Merchant tiers/limits: transaction caps, daily/monthly volume limits
- Onboarding flow: Who creates the merchant — SP via admin portal, or merchant self-registers via API? What approval steps?

**2. Purchase-triggered origination flow**

Map the end-to-end BNPL flow as a state machine:
- Merchant initiates checkout → customer selects BNPL → Lōns pre-qualifies customer → loan offer presented → customer accepts → merchant receives settlement → customer repays in installments
- How does the merchant initiate? API call with cart/invoice data? Redirect flow? SDK?
- What customer data does the merchant pass? (customer ID, amount, item description)
- What's the response time SLA for pre-qualification at checkout? (customer is waiting)

**3. Installment schedule mechanics**

- Standard split: 3 installments? 4? Configurable per product?
- First installment timing: at purchase (pay-now portion) or deferred?
- Zero-interest promotional periods: how configured? Per merchant agreement or per product?
- Late payment handling: penalty on missed installment? Entire balance acceleration?

**4. Merchant settlement flow**

- Settlement timing: T+0 (immediate) or T+1? Configurable?
- Settlement amount: full purchase price minus discount fee? Or advance percentage?
- Discount fee: who sets it — Lōns, SP, or negotiated per merchant?
- Settlement reconciliation: how does merchant confirm receipt?

**5. Refund handling**

- Full refund: cancel remaining installments, reverse merchant settlement?
- Partial refund: reduce remaining installment amounts? Which installments?
- Refund window: time limit? Merchant-initiated only or customer can request?

**6. Merchant-facing interface**

- Is there a merchant portal (separate Next.js app) or merchant API only for v1.0?
- What does the merchant need to see? Transactions, settlements, refunds, customer disputes?
- PM recommendation: API-only for v1.0, merchant portal as post-launch follow-up (similar to USSD decision)

### Reference docs:
- `Docs/01-loan-portfolio.md` §4 (BNPL, FR-BN-001 through FR-BN-005)
- `Docs/04-entity-management.md` (entity patterns, tenant-scoping)
- `Docs/05-process-engine.md` (origination pipeline design)
- Current codebase: `packages/database/prisma/schema.prisma` (Lender model as entity pattern reference)

---

## Deliverable 3: Invoice Factoring Debtor Entity & Flow Spec

**Needed by:** Sprint 12 start
**Output:** `Docs/SPEC-invoice-factoring.md`
**Monday.com:** 11743617096

Invoice Factoring introduces a third-party collection model (payment comes from the debtor/buyer, not the borrower/seller) and new financial mechanics (advance rate, reserve release).

### What the BA must define:

**1. Debtor (Buyer) entity model**

Define the Debtor model for Prisma schema:
- Core fields: companyName, registrationNumber, country, contactEmail, contactPhone, paymentTerms, creditRating, status
- Is Debtor a separate entity or a sub-type of Customer? (Recommendation: separate entity — debtors are third parties, not borrowers)
- Relationship: A Debtor is linked to invoices, not directly to contracts. Multiple sellers (customers) may have invoices against the same debtor.
- Debtor risk assessment: how is debtor creditworthiness evaluated? External credit check? Payment history within the platform?
- Concentration limits: max exposure per debtor, per industry sector

**2. Invoice entity model**

Define the Invoice model:
- Fields: sellerId (Customer), debtorId, invoiceNumber, issueDate, dueDate, faceValue, currency, advanceRate, advancedAmount, reserveAmount, status, verificationStatus
- Invoice statuses: submitted → verified → funded → debtor_notified → payment_received → reserve_released → closed (or: disputed, defaulted)
- Verification: Is invoice verification mandatory or optional? Manual or automated? Phone call to debtor?

**3. Factoring origination flow**

Map the end-to-end flow:
- Seller uploads invoice → system validates format and debtor → advance rate calculated → seller accepts offer → advance disbursed to seller → debtor notified → debtor pays on due date → reserve released to seller (minus fees) → closed
- What if debtor disputes the invoice?
- What if debtor pays late? Penalty to debtor? Recourse to seller?

**4. Recourse vs non-recourse**

- Recourse: if debtor defaults, seller must repay the advance. How is this enforced?
- Non-recourse: Lōns/lender absorbs the loss. Higher fees to compensate.
- Is this configurable per product? Per invoice? Per debtor risk tier?

**5. Reserve mechanics**

- Advance rate: typically 70-90% of face value. Configurable per product and debtor risk?
- Reserve: held amount (face value minus advance) released after debtor payment
- Reserve release: automatic on payment confirmation, or manual approval?
- Partial payment: how is reserve adjusted?

**6. Aging and concentration limits**

- Debtor concentration: max percentage of portfolio exposed to a single debtor
- Industry concentration: max percentage exposed to a single industry/sector
- Invoice aging: 30/60/90+ day buckets for unpaid invoices
- These need to be configurable per tenant/product

### Reference docs:
- `Docs/01-loan-portfolio.md` §5 (Invoice Factoring, FR-IF-001 through FR-IF-005)
- `Docs/04-entity-management.md` (entity patterns)
- `Docs/03-repayments-recovery.md` (collection model — needs adaptation for third-party collection)
- Current codebase: `packages/database/prisma/schema.prisma` (Customer/Lender as entity pattern reference)

---

## Deliverable 4: Plan Tier Feature Matrix

**Needed by:** Sprint 13 (can be lower priority than Deliverables 1-3)
**Output:** `Docs/SPEC-plan-tiers.md`
**Monday.com:** 11694495574

This was sent back to BA in Sprint 8 for definition. Define what each plan tier unlocks for SPs.

### What the BA must define:

For each tier (Starter, Professional, Enterprise — or whatever naming is chosen):
- Maximum number of active products
- Enabled product types (e.g., Starter = Micro-Loan only, Enterprise = all 4)
- Enabled modules/features (e.g., ML scoring, custom reports, API access)
- API rate limits per tier
- White-label/branding options
- Support SLA (response time, dedicated account manager)
- Maximum customers / monthly transaction volume
- SSO availability (Enterprise only?)
- Custom integration support

### Reference docs:
- `Docs/04-entity-management.md` (Tenant model, planTier field)
- Current codebase: `packages/database/prisma/schema.prisma` — Tenant.planTier enum (starter, professional, enterprise)

---

## Delivery Timeline

| Deliverable | Needed By | Priority |
|---|---|---|
| 1. Overdraft Architecture ADR | Sprint 10 start | CRITICAL |
| 2. BNPL Merchant & Flow Spec | Sprint 11 start | CRITICAL |
| 3. Invoice Factoring Spec | Sprint 12 start | CRITICAL |
| 4. Plan Tier Feature Matrix | Sprint 13 start | HIGH |

Deliverables 1 and 2 should start immediately. Deliverable 3 can begin once Deliverable 2 is drafted (shared patterns). Deliverable 4 is lowest priority of the four.

---

## Notes for the BA

- All three product-type specs should follow the same pattern: entity model → origination flow (state machine) → settlement/payment mechanics → admin portal implications → event types → test scenarios
- Reference the existing Micro-Loan flow as the baseline — each new product type is a variation
- Where decisions are unclear, present options with trade-offs rather than leaving blanks. The PM and Project Owner will make the call.
- The specs don't need to be implementation-ready code. They need to be clear enough that a dev prompt can be written from them — entity fields, state transitions, business rules, and API contracts.
