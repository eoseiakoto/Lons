# Process Engine Integration & E2E Tests

This directory contains comprehensive integration and end-to-end tests for the Lōns loan processing pipeline.

## Files

### 1. `process-engine.integration.spec.ts` (Task 4)
**Monday.com ID:** 11605364578

Comprehensive integration tests covering the full process engine state machine:

#### Test Suites:

**Happy Path — Full State Machine Traversal**
- `RECEIVED → VALIDATED` — Basic request validation
- `VALIDATED → PRE_QUALIFIED` — Pre-qualification eligibility check
- `PRE_QUALIFIED → SCORED → APPROVED` — Credit scoring and approval decision
- `APPROVED → OFFER_SENT` — Loan offer generation
- `OFFER_SENT → ACCEPTED → CONTRACT_CREATED` — Contract creation from accepted offer
- Event emission verification at each transition

**Rejection Paths**
- Blacklisted customer rejection
- Amount exceeds product maximum
- Credit score below threshold
- Existing overdue loans

**Edge Cases**
- Idempotent requests (same idempotencyKey returns same result)
- Invalid state transitions (proper error handling)
- Offer expiry validation

**Concurrent Requests**
- Multiple simultaneous loan requests for same customer
- Proper handling of concurrency constraints

**Multi-Tenancy Isolation**
- Tenant context enforcement
- No cross-tenant data leakage

#### Key Features:
- Real database connections (not mocks)
- Uses actual service instances from ProcessEngineModule
- Idempotent test execution (can run multiple times)
- Completes in < 60 seconds

---

### 2. `loan-lifecycle.e2e.spec.ts` (Task 7)
**Monday.com ID:** 11605364333

Single comprehensive end-to-end test exercising the complete loan lifecycle from request to disbursement.

#### Pipeline Phases:

1. **REQUEST & VALIDATION** — Loan request creation and validation
2. **PRE-QUALIFICATION** — Eligibility assessment
3. **CREDIT SCORING** — Rule-based scorecard evaluation
4. **APPROVAL DECISION** — Auto-approval based on score
5. **OFFER GENERATION** — Loan offer with cost of credit
6. **CUSTOMER ACCEPTANCE** — Customer accepts offer
7. **CONTRACT CREATION** — Legal contract generated from offer
8. **REPAYMENT SCHEDULE** — Schedule generated (1 installment for 30-day loan)
9. **DISBURSEMENT INITIATION** — Funds transfer initiated
10. **DISBURSEMENT CALLBACK** — Mock wallet callback completes transfer

#### Comprehensive Verifications:

✓ **Contract Status** — Final status is PERFORMING (disbursed)
✓ **Disbursement Record** — Exists with COMPLETED status, external reference, and completion timestamp
✓ **Ledger Entries** — Double-entry ledger with disbursement entry
✓ **Repayment Schedule** — Correct number of installments (1 for 30-day tenor)
✓ **Principal Allocation** — Schedule principal sums to original principal
✓ **Event Emission** — Events emitted for all state transitions with correct format
✓ **Tenant Isolation** — No cross-tenant data leakage
✓ **Decimal Amounts** — ALL monetary amounts are Decimal/String (never float)
✓ **PII Masking** — No PII in logs or output

#### Test Data:
- Micro-loan product: GHS 5,000 principal, 12% flat annual rate, 30-day tenor
- Excellent credit customer: 750 credit score
- Positive pre-qualification and scoring results
- Mock wallet adapter for disbursement

#### Execution:
- Real database and service instances
- Deterministic and idempotent
- Completes in < 30 seconds

---

## Running the Tests

### Run all tests:
```bash
pnpm test
```

### Run only process-engine tests:
```bash
pnpm --filter process-engine test
```

### Run integration tests:
```bash
pnpm --filter process-engine test process-engine.integration.spec.ts
```

### Run E2E tests:
```bash
pnpm --filter process-engine test loan-lifecycle.e2e.spec.ts
```

### Run with coverage:
```bash
pnpm --filter process-engine test -- --coverage
```

---

## Key Design Decisions

### 1. Real Database Usage
- Tests use real Prisma connections, not mocks
- Ensures integration works with actual DB schema
- Each test cleans up after itself via unique tenant IDs

### 2. Service Integration
- Tests use actual service instances from ProcessEngineModule
- Business logic is NOT mocked (only external integrations like wallet adapters)
- Validates end-to-end behavior

### 3. Decimal Money Handling
- All monetary amounts use Prisma Decimal type
- Tests verify no floats are used
- Follows CLAUDE.md financial calculation rules

### 4. Multi-Tenancy
- Each test seeds its own unique tenant
- Tests verify tenant isolation via RLS
- Validates no cross-tenant data access

### 5. Event-Driven Architecture
- Tests verify events are emitted for state transitions
- Event format includes: eventType, tenantId, data, timestamp
- Consumers can be idempotent (verified through idempotency tests)

### 6. Idempotency
- Tests verify duplicate requests with same idempotencyKey return same result
- Critical for production reliability

---

## Dependencies

The tests depend on:

- `@nestjs/testing` — NestJS test utilities
- `@lons/database` — Prisma schema and types
- `@lons/common` — Shared utilities (EventBusService, error classes)
- `@lons/event-contracts` — Event type definitions
- `uuid` — ID generation

---

## Coverage

These tests provide coverage for:

- **Process Engine**: State machine transitions, validation, scoring, approval, offer generation
- **Contract Service**: Contract creation from accepted offers
- **Disbursement Service**: Transfer initiation and completion
- **Event Bus**: Event emission and format
- **Multi-Tenancy**: Tenant isolation and context
- **Financial Calculations**: Offer cost of credit, repayment schedules
- **Error Handling**: Validation failures, rejection paths, concurrent requests

Target Coverage: **80%+ for process-engine service**

---

## Future Enhancements

- Add performance benchmarks (target: < 5s for request-to-disbursement)
- Add alternative repayment schedules (reducing balance, balloon)
- Test with real wallet adapter simulation (longer timeout)
- Add manual review workflow tests
- Test rollback scenarios (disbursement failure with contract rollback)
- Test renewal and restructuring flows
