# Sprint 2 — Development Brief (Apr 10 – Apr 23, 2026)

**Objective:** Complete Phase 3 — Post-Processing & Management. Build the financial backbone that runs after disbursement: ledger, interest accrual, settlement, reconciliation, and collections.
**Total Story Points:** 55
**Deadline:** April 23, 2026
**Prerequisites:** Sprint 1 complete (auth, disbursement, notifications, E2E tests all done).

---

## Task 1: Build Double-Entry Ledger Engine (Critical | 13 pts | settlement-service)
**Monday.com Item ID:** 11605366258

### What to build
Complete the ledger engine in `services/settlement-service/src/`. An existing file (`settlement.service.ts`, 174 lines) has partial logic — extend it, don't rewrite from scratch.

1. **Ledger entry recording** — Every financial event creates a ledger entry with: entryId, contractId, entryType (disbursement, interest_accrual, fee, penalty, repayment, adjustment, write_off, reversal), debit/credit indicator, amount (Decimal), running balance, effective date, value date, description, and reference ID.
2. **Double-entry principle** — Each transaction creates paired entries. Example: disbursement creates a debit (loan receivable) and a credit (cash/wallet). Use the `LedgerEntryType` enum from the Prisma schema.
3. **Immutability** — Ledger entries are append-only. No updates, no deletes. Corrections are made via `adjustment` or `reversal` entries that reference the original.
4. **Running balance** — Each entry updates the contract's running balance. Calculate as previous balance + debits - credits.
5. **Statement generation** — `generateStatement(contractId, fromDate, toDate)` returns opening balance, all transactions, closing balance, and summary totals.

### Acceptance Criteria
- [ ] All financial events create proper double-entry ledger records
- [ ] Ledger entries are immutable — no update/delete operations exist
- [ ] Running balance is always accurate after each entry
- [ ] Statement generation returns correct opening/closing balances and transaction list
- [ ] All amounts use `Decimal` type with banker's rounding
- [ ] Unit tests with 90%+ coverage, including edge cases (zero amounts, reversals)

### Reference
- `Docs/06-post-process.md` §1 (Statement Engine) and §FR-ST-002 (Account Ledger)
- `packages/database/prisma/schema.prisma` — `ledger_entries` table, `LedgerEntryType` enum

---

## Task 2: Implement Interest Accrual Scheduler (Critical | 8 pts | scheduler)
**Monday.com Item ID:** 11605388983

### What to build
Wire up the interest accrual logic (existing in `services/process-engine/src/interest-accrual/interest-accrual.service.ts`, 107 lines) to a daily cron job in `apps/scheduler/`:

1. **Cron job** — Runs daily at a configurable time (default: 1:00 AM UTC). Uses BullMQ for job scheduling to ensure exactly-once execution.
2. **Batch processing** — Fetch all active contracts (`status = PERFORMING`), compute daily interest for each based on product config (flat rate vs. reducing balance), and create ledger entries.
3. **Interest calculation** — `dailyRate = annualRate / 365`. For reducing balance: apply rate to current outstanding principal. For flat rate: apply rate to original principal. Use Decimal arithmetic throughout.
4. **Accrual ledger entries** — Each accrual creates a ledger entry of type `interest_accrual` with debit (interest receivable) and credit (interest income).
5. **Contract balance update** — After accrual, update the contract's `total_outstanding` by adding the accrued interest.
6. **Idempotency** — If the job runs twice for the same date, it should detect existing accrual entries and skip. Use `(contractId, date, entryType=interest_accrual)` as dedup key.

### Existing code to extend
- `services/process-engine/src/interest-accrual/interest-accrual.service.ts` — Has calculation logic, needs ledger integration
- `apps/scheduler/src/main.ts` — Currently 10 lines (scaffold), needs job registration

### Acceptance Criteria
- [ ] Daily cron job runs and processes all active contracts
- [ ] Interest calculated correctly for both flat and reducing balance methods
- [ ] Ledger entries created for each accrual with correct amounts
- [ ] Job is idempotent — no duplicate accruals on re-run
- [ ] Contract outstanding balance updated after accrual
- [ ] Unit tests for calculation logic + integration test for batch job

### Reference
- `Docs/01-loan-portfolio.md` — Interest rate types per product
- `Docs/06-post-process.md` §FR-ST-002 (Ledger entries)

---

## Task 3: Complete Revenue Settlement Engine (High | 8 pts | settlement-service)
**Monday.com Item ID:** 11605364311

### What to build
Extend `services/settlement-service/src/settlement.service.ts` with the full revenue settlement pipeline:

1. **Revenue sharing rules** — Read from product configuration: percentage splits per party (lender, SP, EMI, platform) for each revenue type (interest, origination fee, service fee, penalty, late fee). Support percentage split and waterfall models.
2. **Settlement calculation** — `calculateSettlement(tenantId, fromDate, toDate)`: aggregate all revenue events (repayments, fees, penalties) since last settlement, apply sharing rules, produce per-party settlement lines.
3. **Settlement run lifecycle** — CALCULATED → APPROVED → EXECUTING → SETTLED / FAILED. Create `settlement_runs` record with status tracking.
4. **Settlement lines** — For each party: gross revenue by type, share calculation, deductions, net amount. Store in `settlement_lines` table.
5. **Approval workflow** — `approveSettlement(settlementRunId)` transitions from CALCULATED to APPROVED. `executeSettlement(settlementRunId)` transitions to EXECUTING and generates transfer instructions.
6. **Auto-approval** — Configurable per tenant: if enabled, settlements auto-approve after calculation.

### Acceptance Criteria
- [ ] Revenue splits calculated correctly for percentage and waterfall models
- [ ] Settlement runs track full lifecycle (CALCULATED → SETTLED)
- [ ] Per-party settlement lines are accurate with supporting transaction detail
- [ ] Approval workflow enforced (manual or auto based on config)
- [ ] All monetary calculations use Decimal with banker's rounding
- [ ] Tests cover multi-party splits, edge cases (zero revenue, single party)

### Reference
- `Docs/06-post-process.md` §2 (Revenue Settlement) — FR-RS-001, FR-RS-002, FR-RS-003

---

## Task 4: Settlement Run Generation and Approval Workflow (High | 8 pts | settlement-service)
**Monday.com Item ID:** 11605370588

### What to build
Build the operational layer on top of the settlement calculation engine:

1. **Scheduled settlement runs** — Add a cron job to `apps/scheduler/` that triggers settlement calculation on a configurable schedule (daily/weekly/monthly per tenant).
2. **Settlement report generation** — `getSettlementReport(settlementRunId)` returns a structured report: period, parties involved, revenue breakdown by type, per-party shares, net amounts, and supporting transactions.
3. **GraphQL mutations** — `approveSettlement`, `rejectSettlement`, `executeSettlement` mutations in `apps/graphql-server/` (resolvers already partially exist).
4. **Settlement events** — Emit `settlement.calculated`, `settlement.approved`, `settlement.executed`, `settlement.failed`.
5. **Audit trail** — Log all settlement state transitions with operator ID and timestamp.

### Acceptance Criteria
- [ ] Scheduled settlement runs execute on configured cadence
- [ ] Settlement reports contain accurate per-party breakdowns
- [ ] GraphQL mutations enforce proper state transitions
- [ ] Events emitted for all settlement lifecycle changes
- [ ] Audit trail captures all operator actions

### Reference
- `Docs/06-post-process.md` §2.2 FR-RS-002, FR-RS-003
- `apps/graphql-server/src/graphql/resolvers/settlement.resolver.ts`

---

## Task 5: Build Daily Reconciliation Batch Processor (High | 8 pts | reconciliation-service)
**Monday.com Item ID:** 11605364053

### What to build
Complete `services/reconciliation-service/src/reconciliation.service.ts` (142 lines exists) with full daily reconciliation:

1. **Reconciliation run** — Scheduled daily (default 2:00 AM tenant timezone). Compares internal ledger against external source data.
2. **Transaction matching** — For each day, match: (a) disbursements in Lōns vs. wallet provider records, (b) repayments received vs. wallet provider records. Match on: reference ID, amount, date. Categorize each as: matched, unmatched (Lōns-only), orphaned (external-only), amount_mismatch.
3. **Mock external data source** — Since we're using mock adapters, create a `MockReconciliationSource` that generates simulated external transaction records (with configurable match rate, e.g., 95% match, 3% timing difference, 2% exception).
4. **Exception creation** — Unmatched/orphaned/mismatched items create `reconciliation_exceptions` with severity: low (timing difference), medium (requires investigation), high (potential financial loss).
5. **Exception resolution** — `resolveException(exceptionId, resolution, notes)` marks exceptions as resolved with operator notes.
6. **Reconciliation report** — `getReconciliationReport(runId)` returns: match rate, exceptions by severity, unresolved count, comparison summary.

### Acceptance Criteria
- [ ] Daily reconciliation runs and produces categorized results
- [ ] Mock external source generates realistic test data
- [ ] Exceptions created with correct severity classification
- [ ] Exception resolution workflow works with audit trail
- [ ] Reconciliation report shows accurate match rates and exception breakdown
- [ ] Tests cover all match categories and edge cases

### Reference
- `Docs/06-post-process.md` §3 (Reconciliation) — FR-RC-001, FR-RC-002, FR-RC-003

---

## Task 6: Reconciliation Exception Handling and Resolution (Medium | 5 pts | reconciliation-service)
**Monday.com Item ID:** 11605366504

### What to build
Extend the reconciliation service with operational exception management:

1. **Exception escalation** — Unresolved exceptions older than configurable threshold (default: 3 business days) trigger escalation alerts via notification service.
2. **Exception dashboard data** — `getExceptionsSummary(tenantId)` returns: total open, by severity, by age, aging trend.
3. **Batch resolution** — `batchResolveExceptions(exceptionIds, resolution, notes)` for resolving multiple related exceptions at once.
4. **Auto-resolution rules** — Configurable rules to auto-resolve low-severity exceptions (e.g., timing differences that match within 24 hours).
5. **GraphQL queries/mutations** — Wire up exception CRUD to the GraphQL server.

### Acceptance Criteria
- [ ] Escalation alerts fire for aged exceptions
- [ ] Dashboard summary returns accurate counts and trends
- [ ] Batch resolution works atomically
- [ ] Auto-resolution catches timing differences
- [ ] GraphQL API exposes full exception management

### Reference
- `Docs/06-post-process.md` §3.1 FR-RC-002 (Exception Handling)

---

## Task 7: Implement Collections Queue with Assignment Logic (High | 5 pts | recovery-service)
**Monday.com Item ID:** 11605366804

### What to build
Complete `services/process-engine/src/collections/collections.service.ts` (87 lines) and `services/recovery-service/src/recovery-strategy.service.ts` (88 lines):

1. **Collections queue** — Maintain a prioritized queue of contracts requiring recovery action. Priority configurable: by amount owed, by DPD, by AI-predicted recovery probability, or by custom scoring.
2. **Queue management** — `getCollectionsQueue(tenantId, filters, pagination)` returns sorted queue with: contract details, customer info (masked PII), amount owed, DPD, assigned agent, last action date.
3. **Assignment** — `assignToAgent(contractId, agentId)` and `bulkAssign(contractIds, agentId)`. Auto-assignment based on configurable rules (round-robin, by region, by skill level).
4. **Action logging** — `logCollectionAction(contractId, actionType, notes)`. Action types: send_reminder, call_attempt, promise_to_pay, restructure, escalate, recommend_writeoff. Each action timestamped and attributed to operator.
5. **Promise-to-pay tracking** — Record PTP date, auto-flag if payment not received by promised date.

### Acceptance Criteria
- [ ] Collections queue returns properly prioritized items
- [ ] Agent assignment works (manual and auto)
- [ ] All collection actions are logged with operator attribution
- [ ] Promise-to-pay tracking flags broken promises
- [ ] PII is masked in queue responses per CLAUDE.md rules
- [ ] Tests cover prioritization, assignment, and action logging

### Reference
- `Docs/03-repayments-recovery.md` §4 (Collections Workflow) — FR-CW-001, FR-CW-002

---

## Task 8: Integration Test — Repayment → Ledger → Settlement Flow (High | 8 pts | settlement-service)
**Monday.com Item ID:** 11605366513

### What to build
A comprehensive integration test that validates the entire post-processing pipeline:

1. **Setup** — Seed: tenant, SP, product (micro-loan, 12% annual, 30-day term), lender (60/25/10/5 revenue split), customer, active contract (already disbursed, with repayment schedule).
2. **Repayment** — Process a repayment via the repayment service. Verify waterfall allocation (penalties → interest → principal).
3. **Ledger** — Verify ledger entries created: repayment credit, principal reduction, interest allocation. Verify running balance updated.
4. **Interest accrual** — Run a daily accrual cycle. Verify ledger entry and balance update.
5. **Settlement** — Trigger settlement calculation. Verify per-party splits match product config (60% lender, 25% SP, 10% EMI, 5% platform).
6. **Reconciliation** — Run reconciliation. Verify matched transactions.
7. **Verification** — Assert all balances reconcile: ledger balance = contract outstanding. Settlement totals = sum of revenue entries.

### Acceptance Criteria
- [ ] Single test exercises the full post-processing pipeline
- [ ] All financial amounts verified with Decimal precision
- [ ] Revenue splits verified against product configuration
- [ ] Ledger running balance matches contract outstanding
- [ ] Test is deterministic, idempotent, and runs in < 30s

### Reference
- `Docs/06-post-process.md` (all sections)
- `Docs/03-repayments-recovery.md` §1 (Repayment waterfall)

---

## Execution Order

```
Task 1 (Ledger) ──→ Task 2 (Interest Accrual)
      │                     │
      └──→ Task 3 (Settlement Calc) ──→ Task 4 (Settlement Ops)
                                              │
Task 5 (Reconciliation) ──→ Task 6 (Exception Handling)
                                              │
Task 7 (Collections Queue)                    │
      │                                       │
      └───────────────────────────────────────┴──→ Task 8 (Integration Test)
```

**Parallel tracks:**
- Track A: Tasks 1 → 2 → 3 → 4 (Ledger + Interest + Settlement chain)
- Track B: Tasks 5 → 6 (Reconciliation chain)
- Track C: Task 7 (Collections — independent)
- Track D: Task 8 (Integration test — after A, B, C complete)

Tracks A, B, and C can run in parallel. Track D depends on all three.

---

## Rules (from CLAUDE.md)

- **Money:** Use `Decimal` / `DECIMAL(19,4)`. Never floats. Banker's rounding (round half to even).
- **Ledger:** Append-only. No updates, no deletes. Corrections via reversal entries.
- **Multi-tenancy:** Every query uses tenant context. RLS enforced.
- **Database:** UUID v7 PKs. Soft deletes. `created_at`/`updated_at` on all tables.
- **Events:** All state transitions emit events. Format: `{ event, tenantId, timestamp, data, correlationId }`. Consumers must be idempotent.
- **Security:** PII never in logs. Mask as `+233***7890`, `GHA-***-XXX`.
- **Testing:** 80%+ coverage. Integration tests hit real DB, not mocks.
- **Existing code:** Services have existing files — extend them, don't rewrite from scratch.
