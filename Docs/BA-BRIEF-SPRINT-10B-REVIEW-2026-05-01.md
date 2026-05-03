# BA Briefing Note: Sprint 10B Overdraft Review Request

**From:** PM
**To:** BA
**Date:** 2026-05-01
**Sprint:** 10B — Overdraft Product Implementation
**Status:** Dev delivery complete, PM review complete, awaiting BA sign-off

---

## Why this review, and why now

Sprint 10B delivers the full overdraft product at the service tier — the first of our four loan product types to be implemented end-to-end. Before Sprint 11 commences, I need BA to validate that what Dev built matches the spec you wrote (`SPEC-overdraft.md`), and to flag any deviations that would be harder to fix after Sprint 11 builds on top.

**My recommendation is that BA reviews now, not after Sprint 11.** The reasoning:

1. The core financial logic (waterfall allocation, daily interest, penalty cap, drawdown concurrency, state machine) is complete and self-contained. If there's a deviation from the spec, it's far cheaper to catch it now than after Sprint 11 adds consumers, adapters, and integration wiring on top.
2. The Sprint 11 gaps (listed below) are all integration seams — they don't change the core logic, they connect it to external systems. BA reviewing after Sprint 11 would mean reviewing a larger surface area where the new integration code obscures what's changed versus what was already correct.
3. The drawdown reservation logic uses `SELECT ... FOR UPDATE` with rollback — the kind of concurrency-critical code that benefits from a second pair of eyes before it becomes load-bearing.

---

## What was delivered

14 items (Task 0 carryover + Tasks 1-13), all verified by PM against the codebase. Key files to review:

### Core service logic (highest review priority)

| File | What it does | SPEC reference |
|------|-------------|----------------|
| `services/overdraft-service/src/credit-line/credit-line.service.ts` | Activation, deactivation, freeze/unfreeze, limit adjustment, state machine | §5.1, §5.2, §3.2 |
| `services/overdraft-service/src/drawdown/drawdown.service.ts` | Real-time drawdown: eligibility, fee calc, SELECT FOR UPDATE reservation, wallet disbursement, rollback | §6.1 |
| `services/overdraft-service/src/repayment/repayment.service.ts` | Waterfall allocation (pure function), auto-repayment from wallet credit, manual repayment | §7.1 |
| `services/overdraft-service/src/interest/interest.service.ts` | Daily interest accrual, penalty cap, billing cycle close, credit line expiry | §8.1, §8.2, §9.2, §9.3 |
| `services/overdraft-service/src/cache/credit-line-cache.service.ts` | Redis cache with WATCH/MULTI/EXEC atomic reservation | §6.1 (performance) |

### Data layer

| File | What it does |
|------|-------------|
| `packages/database/prisma/schema.prisma` (lines 1328-1371+) | CreditLine, Drawdown, CreditLimitChange models |
| `packages/database/prisma/migrations/20260501100000_add_overdraft_models/migration.sql` | 3 tables, 2 enums, RLS policies, indexes |
| `packages/event-contracts/src/overdraft-events.ts` | 5 typed event interfaces |

### API surface

| File | What it does |
|------|-------------|
| `apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts` | 4 queries + 6 mutations (see gap #1 below) |
| `apps/rest-server/src/wallet-webhook/wallet-webhook.controller.ts` | Inbound wallet webhooks with HMAC validation |

### Tests

| File | Cases |
|------|-------|
| `credit-line.service.spec.ts` | 11 — state machine transitions |
| `drawdown.service.spec.ts` | 5 — fee calculation |
| `repayment.service.spec.ts` | 8 — waterfall allocation with precision invariant |
| `interest.service.spec.ts` | 9 — daily interest + penalty cap |

---

## Specific areas for BA to validate

### 1. State machine transitions (SPEC §3.2)

The `ALLOWED_TRANSITIONS` map in `credit-line.service.ts` lines 30-42 encodes every valid transition. Please confirm this matches the transition graph in the spec. Key edges to check:

- `frozen → active` (unfreeze) and `frozen → closed` are allowed
- `suspended → active` is allowed but `suspended → closed` is NOT (must go through `active` first)
- `expired → closed` is the only exit from `expired`
- `closed` is terminal — no exits

### 2. Waterfall allocation order (SPEC §7.1)

Default order is `penalties → interest → fees → principal`. The spec defines this in §7.1 step 3. Dev implemented it as configurable via `overdraftConfig.autoRepaymentWaterfall` — is that a correct interpretation of the spec, or should the order be fixed?

### 3. Available balance recomputation after repayment

When a repayment reduces `outstandingAmount`, the `availableBalance` should increase by the principal portion only (since fees/interest/penalties were never deducted from available balance). Verify that `collectAndAllocate` in `repayment.service.ts` lines 272-280 correctly restores only the principal portion to available balance.

### 4. Drawdown fee charging against available balance

In `drawdown.service.ts`, the `chargeAmount` (shortfall + fee) is deducted from `availableBalance`, meaning the fee comes out of the credit line headroom. Is this the intended behavior per SPEC §6.1, or should fees be tracked separately without reducing available balance?

### 5. Partial drawdown policy

When `partialDrawdownEnabled` is true, the service reduces the disbursement to whatever fits within `availableBalance - fee`. Confirm this matches the spec's partial drawdown semantics — specifically, should the fee be deducted before or after computing the partial amount?

### 6. Penalty cap enforcement

`calculateDailyPenalty` in `interest.service.ts` computes headroom as `(outstanding × maxCapPercent) - penaltiesAccrued`. If headroom is zero or negative, no penalty accrues. Confirm this matches SPEC §9.2's cap definition — in particular, is the cap based on the original outstanding at time of overdue classification, or the current (potentially reduced) outstanding?

### 7. Billing cycle date handling

`closeCyclesDue` advances the cycle by `billingCycleDays` from the previous cycle end. Confirm this is correct versus advancing from the previous cycle start (which would give different dates if a cycle was short or long).

---

## Known gaps (Sprint 11 items created on Monday.com)

These are integration seams, not logic gaps. They don't affect the correctness of the core service layer BA is reviewing:

| Gap | Priority | Monday.com ID | Impact |
|-----|----------|---------------|--------|
| `waiveOverdraftPenalties` mutation missing | P1 | 11899092932 | Operators can't waive penalties via GraphQL yet |
| BullMQ consumers not wired | P2 (Critical) | 11899089007 | Webhook → drawdown/auto-repayment flow is end-to-end broken |
| Wallet adapters are NULL stubs | P2 (Critical) | 11899091254 | Manual repayments always fail |
| walletId mapping scans all customers | P2 | 11899091049 | O(n) lookup, performance blocker at scale |
| Scoring engine not integrated into activation | P2 | 11899089284 | Operators must supply limit manually |
| RepaymentService uses string negation | P3 | 11899074873 | Code smell, not a bug |
| Test coverage at 60% not 80% | P2 | 11899074631 | CLAUDE.md violation, needs live-DB harness |

---

## What I need from BA

1. **Confirm or flag** the 7 specific validation areas above.
2. **Identify any SPEC requirements** that Dev missed entirely (beyond the gaps I've already catalogued).
3. **Assess whether the configurable waterfall** (point #2) is a feature or a deviation — this has product implications for SP customization.
4. **Sign off** that the core service logic is spec-compliant so Sprint 11 can commence on the integration layer.

If BA finds issues that are logic-level (wrong formula, wrong state transition, wrong allocation order), those must be fixed before Sprint 11 starts. If BA finds issues that are integration-level (missing endpoint, wrong event payload shape), those can be added to the Sprint 11 backlog.

---

## Reference documents

- `Docs/SPEC-overdraft.md` — the authoritative spec BA wrote
- `Docs/DELIVERY-NOTES-SPRINT-10B-2026-05-01.md` — Dev's delivery notes
- `Docs/SPRINT-10B-DEV-PROMPT.md` — the dev prompt PM wrote for this sprint
- `Docs/ADR-overdraft-realtime.md` — architecture decision record for real-time drawdown
