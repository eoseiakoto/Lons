# DEV-SPRINT-18 — Admin Portal + Process Engine + Post-Processing + Fix Items

**Date:** 2026-05-17 (revised — original 2026-05-10)
**Sprint:** 18
**Theme:** Close remaining operational gaps — admin portal screens for day-to-day operations, process engine safeguards, post-processing pipeline completeness, and Sprint 14–17 deferred fix items
**Total SP:** ~79.5
**Tracks:** A (Admin Portal, 36 SP) | B (Process Engine, 21 SP) | C (Post-Processing, 12 SP) | D (Fix Items & Deferred Work, ~10.5 SP)

---

## Prerequisites

Read these documents before starting:

| Document | Why |
|---|---|
| `CLAUDE.md` | All conventions, money rules, naming, multi-tenancy |
| `Docs/05-process-engine.md` | FR-PE-006, FR-DB-002, approval workflows |
| `Docs/06-post-process.md` | Settlement models, reconciliation, revenue distribution |
| `Docs/07-api-specifications.md` | API key management, webhook security |
| `Docs/08-admin-portal.md` | FR-AE-002.2, FR-AE-002.4, FR-LO-003.2, FR-SET-001.1, FR-DFL-002.2 |
| `Docs/10-security-compliance.md` | API key encryption, RBAC, operator permissions |
| `Docs/11-data-models.md` | Schema conventions, existing models |
| `Docs/PM-RESPONSE-BA-SPRINT-17-2026-05-17.md` | P3 dispositions and deferred items feeding Track D |
| `Docs/DELIVERY-NOTES-SPRINT-17-BA-FIXES-2026-05-17.md` | Open follow-ups and behavioural changes from Sprint 17 |

---

## Scope Overview

| # | Item | Priority | SP | Track | Depends On |
|---|------|----------|-----|-------|------------|
| S18-1 | Loan Application Review Workflow (approve/reject/escalate/modify) | P1 | 8 | A — Admin Portal | S18-6 (approval limits) |
| S18-2 | Contract Write Operations (manual payment, restructuring, penalty waiver) | P1 | 5 | A — Admin Portal | — |
| S18-3 | Report CSV/PDF Export | P1 | 5 | A — Admin Portal | — |
| S18-4 | Settlement & Reconciliation Dashboard | P1 | 5 | A — Admin Portal | — |
| S18-5 | API Key Management UI | P1 | 5 | A — Admin Portal | — |
| S18-11 | Plan Tier Dashboard, Usage Display & Upgrade Request | P1 | 8 | A — Admin Portal | — |
| S18-6 | Approval authority limits per operator | P1 | 5 | B — Process Engine | — |
| S18-7 | Per-step pipeline audit trail (inputs, outputs, duration, outcome) | P1 | 8 | B — Process Engine | — |
| S18-8 | Disbursement failure rolls back contract to CANCELLED | P1 | 3 | B — Process Engine | — |
| S18-12 | Pipeline Step-Level Retry & Recovery | P1 | 5 | B — Process Engine | S18-7 (audit trail) |
| S18-9 | Revenue distribution: tiered/fixed/waterfall models | P1 | 8 | C — Post-Processing | — |
| S18-10 | Portfolio metrics filterable by product, segment, region, lender | P1 | 4 | C — Post-Processing | — |
| S18-FIX-1 | Tech debt cleanup bundle (dead code, logger, screening test) | P2 | 1.5 | D — Fix Items | — |
| S18-FIX-2 | Wallet adapter full call-site migration | P2 | 1 | D — Fix Items | — |
| S14-11 | Invoice Verification Queue — admin portal enhancements | P1 | 5 | D — Fix Items | — |
| S18-ENH | Billing usageHistory query + nextBillingDate + estimatedFees | P2 | 3 | D — Fix Items | — |
| | **Total** | | **~79.5** | | |

**Execution order:** S18-6 first (approval limits needed by S18-1). S18-7 before S18-12 (audit trail needed by retry). S18-8, S18-9, S18-10 are independent. S18-2 through S18-5 and S18-11 are independent admin portal screens. Build S18-6 before or alongside S18-1.

---

## CRITICAL RULES — READ BEFORE WRITING ANY CODE

1. **Money is NEVER a float.** Use `Decimal` (Prisma) / `DECIMAL(19,4)` (PostgreSQL) / `string` in API responses. Import `{ add, subtract, multiply, divide, bankersRound, percentage }` from `@lons/common` (file: `packages/common/src/financial/decimal.util.ts`). Every fee, amount, rate, and monetary calculation MUST use these utilities.

2. **All new tables need:** `id` (UUID v7, `@default(dbgenerated("gen_random_uuid()"))`), `tenantId` (where tenant-scoped), `createdAt`, `updatedAt`, soft delete (`deletedAt`) for business data. Follow existing schema conventions in `packages/database/prisma/schema.prisma`.

3. **RLS** — tenant-scoped tables require Row-Level Security. Tenant context is set via `SET app.current_tenant`. Use `this.prisma.enterTenantContext()` for scheduler jobs (see `apps/scheduler/src/jobs/settlement.job.ts` for the pattern).

4. **Events** — all state transitions emit events via `EventBusService.emitAndBuild()`. Add new event types to `packages/event-contracts/src/events.enum.ts`.

5. **Audit logging** — use `@AuditAction(AuditActionType.X, AuditResourceType.Y)` decorator on all new mutations. Import from `@lons/common`.

6. **Tests** — unit tests for all business logic (Jest). Integration tests for database-touching services. Target 80%+ coverage on new code.

7. **Idempotency** — all mutations accept `idempotencyKey`. All event consumers must be idempotent.

8. **PII in logs** — never log national IDs, phone numbers, or emails in cleartext. Use `maskNationalId`, `maskPhone` from `@lons/common`.

9. **Existing patterns to follow:**
   - Guard pattern: `services/entity-service/src/auth/guards/auth.guard.ts`
   - Decorator pattern: `packages/common/src/audit/audit-action.decorator.ts`
   - Resolver pattern: `apps/graphql-server/src/graphql/resolvers/contract.resolver.ts`
   - Service pattern: `services/settlement-service/src/settlement.service.ts`
   - Admin portal page pattern: `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`
   - API key resolver pattern: `apps/graphql-server/src/graphql/resolvers/api-key.resolver.ts`

---

## Track A: Admin Portal (36 SP)

### S18-1: Loan Application Review Workflow (8 SP)

**Requirement:** FR-AE-002.2
**Monday ID:** 11744430916
**Problem:** The existing loan applications page (`apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`) is read-only — operators cannot approve, reject, escalate, or modify applications. The backend `ApprovalService` at `services/process-engine/src/approval/approval.service.ts` supports `makeDecision()` and `approveManual()` but has no escalation, no term modification, and no rejection-with-reason from the portal.

#### 1. Backend: Extend ApprovalService

**Modify:** `services/process-engine/src/approval/approval.service.ts`

Add the following methods:

```typescript
/**
 * Reject a loan request in manual_review status with operator-supplied reasons.
 */
async rejectManual(
  tenantId: string,
  loanRequestId: string,
  rejectionReasons: { code: string; message: string }[],
  operatorId: string,
): Promise<LoanRequest> {
  const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
  if (lr.status !== LoanRequestStatus.manual_review) {
    throw new ValidationError('Loan request must be in manual_review status to reject');
  }

  // Check operator approval limits (S18-6)
  await this.approvalLimitService.validateOperatorAction(tenantId, operatorId, 'reject', lr);

  return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.rejected, {
    rejectionReasons: rejectionReasons as unknown as Prisma.InputJsonValue,
    reviewedBy: operatorId,
    reviewedAt: new Date(),
  });
}

/**
 * Escalate a loan request to a senior reviewer.
 * Sets status to 'escalated' and records escalation details.
 */
async escalate(
  tenantId: string,
  loanRequestId: string,
  escalationReason: string,
  escalatedTo: string | null, // specific user ID, or null for any senior
  operatorId: string,
): Promise<LoanRequest> {
  const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
  if (lr.status !== LoanRequestStatus.manual_review) {
    throw new ValidationError('Loan request must be in manual_review status to escalate');
  }

  return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.escalated, {
    escalationReason,
    escalatedBy: operatorId,
    escalatedTo,
    escalatedAt: new Date(),
  });
}

/**
 * Modify terms on a loan request (amount, tenor) before approval.
 * Does NOT change status — just updates the offer terms for operator review.
 */
async modifyTerms(
  tenantId: string,
  loanRequestId: string,
  modifications: {
    adjustedAmount?: string;     // Decimal string
    adjustedTenor?: number;      // days
    adjustedInterestRate?: string; // Decimal string, e.g. "12.5000"
    modificationReason: string;
  },
  operatorId: string,
): Promise<LoanRequest> {
  const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
  if (!['manual_review', 'escalated'].includes(lr.status)) {
    throw new ValidationError('Loan request must be in manual_review or escalated status to modify terms');
  }

  // Validate against product min/max bounds
  const product = lr.product;
  if (modifications.adjustedAmount) {
    if (product.minAmount && compare(modifications.adjustedAmount, String(product.minAmount)) < 0) {
      throw new ValidationError(`Adjusted amount below product minimum ${product.minAmount}`);
    }
    if (product.maxAmount && compare(modifications.adjustedAmount, String(product.maxAmount)) > 0) {
      throw new ValidationError(`Adjusted amount above product maximum ${product.maxAmount}`);
    }
  }

  // Store modifications in metadata
  return this.prisma.loanRequest.update({
    where: { id: loanRequestId },
    data: {
      metadata: {
        ...(lr.metadata as Record<string, unknown> || {}),
        termModifications: {
          adjustedAmount: modifications.adjustedAmount,
          adjustedTenor: modifications.adjustedTenor,
          adjustedInterestRate: modifications.adjustedInterestRate,
          reason: modifications.modificationReason,
          modifiedBy: operatorId,
          modifiedAt: new Date().toISOString(),
        },
      },
    },
  });
}
```

**Also update** `approveManual()` to:
1. Accept an `operatorId` parameter
2. Call `this.approvalLimitService.validateOperatorAction(tenantId, operatorId, 'approve', lr)` before approving
3. Record `reviewedBy: operatorId` and `reviewedAt: new Date()` in the loan request metadata

#### 2. Add `escalated` Status

**Modify:** `packages/database/prisma/schema.prisma`

Add `escalated` to the `LoanRequestStatus` enum:

```prisma
enum LoanRequestStatus {
  draft
  submitted
  pre_qualifying
  pre_qualified
  scoring
  scored
  approved
  manual_review
  escalated        // NEW
  rejected
  offer_sent
  offer_accepted
  offer_expired
  disbursing
  disbursed
  disbursement_failed
  cancelled

  @@map("loan_request_status")
}
```

**Migration** to add the new enum value.

Also update the loan request state machine at `services/process-engine/src/loan-request/loan-request-state-machine.ts` to include valid transitions involving `escalated`:
- `manual_review` -> `escalated`
- `escalated` -> `approved`
- `escalated` -> `rejected`
- `escalated` -> `manual_review` (de-escalate)

#### 3. GraphQL Mutations

**Modify:** `apps/graphql-server/src/graphql/resolvers/loan-request.resolver.ts`

Add these mutations (follow the existing pattern in `contract.resolver.ts`):

```typescript
@Mutation(() => LoanRequestType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
@Roles('loan_request:approve')
async approveLoanRequest(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  @Args('approvedAmount') approvedAmount: string,
  @Args('approvedTenor', { type: () => Int }) approvedTenor: number,
  @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
): Promise<LoanRequestType> { ... }

@Mutation(() => LoanRequestType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
@Roles('loan_request:approve')
async rejectLoanRequest(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  @Args('rejectionReasons', { type: () => [RejectionReasonInput] }) rejectionReasons: { code: string; message: string }[],
  @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
): Promise<LoanRequestType> { ... }

@Mutation(() => LoanRequestType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
@Roles('loan_request:approve')
async escalateLoanRequest(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  @Args('escalationReason') escalationReason: string,
  @Args('escalatedTo', { type: () => ID, nullable: true }) escalatedTo?: string,
  @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
): Promise<LoanRequestType> { ... }

@Mutation(() => LoanRequestType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
@Roles('loan_request:approve')
async modifyLoanRequestTerms(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  @Args('input', { type: () => ModifyTermsInput }) input: ModifyTermsInput,
  @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
): Promise<LoanRequestType> { ... }
```

Create input types:

**File:** `apps/graphql-server/src/graphql/inputs/loan-request-review.input.ts`

```typescript
@InputType()
export class RejectionReasonInput {
  @Field()
  code!: string;

  @Field()
  message!: string;
}

@InputType()
export class ModifyTermsInput {
  @Field({ nullable: true })
  adjustedAmount?: string;

  @Field(() => Int, { nullable: true })
  adjustedTenor?: number;

  @Field({ nullable: true })
  adjustedInterestRate?: string;

  @Field()
  modificationReason!: string;
}
```

#### 4. Event Types

**Modify:** `packages/event-contracts/src/events.enum.ts`

Add:

```typescript
// Loan review events
LOAN_REQUEST_ESCALATED = 'loan_request.escalated',
LOAN_REQUEST_TERMS_MODIFIED = 'loan_request.terms_modified',
```

#### 5. Admin Portal: Application Review Page

**File:** `apps/admin-portal/src/app/(portal)/loans/applications/[id]/page.tsx` (NEW)

This is the individual application review page. Build it following the pattern of `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`.

The page must include:

**Header section:**
- Application ID, customer name (linked), product name, status badge
- Requested amount, currency, tenor
- Submission date, channel

**Scoring section (read-only):**
- Credit score with risk tier badge
- Scoring factors breakdown (from `scoringResult.inputFeatures`)
- Data completeness indicator
- Recommended limit vs. requested amount

**Review action panel (right sidebar or bottom bar):**
- **Approve button:** Opens modal with fields for `approvedAmount` (pre-filled with recommended or requested), `approvedTenor` (pre-filled from request)
- **Reject button:** Opens modal with rejection reason selector (predefined codes: `LOW_CREDIT_SCORE`, `INSUFFICIENT_INCOME`, `HIGH_DEBT_RATIO`, `POLICY_VIOLATION`, `DOCUMENTATION_INCOMPLETE`, `OTHER`) plus free-text reason
- **Escalate button:** Opens modal with escalation reason text and optional assignee dropdown (users with `loan_request:approve` permission)
- **Modify Terms button:** Opens modal to adjust amount, tenor, interest rate with mandatory reason

**Audit trail section:**
- Timeline showing all status changes, who made each decision, timestamps

**GraphQL queries needed:**

```graphql
query LoanRequestDetail($id: ID!) {
  loanRequest(id: $id) {
    id customerId productId requestedAmount requestedTenor currency
    status channel createdAt metadata
    customer { id fullName phonePrimary }
    product { id name minAmount maxAmount maxTenorDays }
    scoringResult {
      id score riskTier modelVersion recommendedLimit
      inputFeatures
    }
  }
}
```

**Also modify** the existing applications list page (`apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`) to:
- Add click-through to the detail page (`/loans/applications/${id}`)
- Add a "Pending Review" filter tab for `manual_review` and `escalated` statuses
- Show review queue count as a badge

#### 6. Tests

**File:** `services/process-engine/src/approval/approval.service.spec.ts` (NEW or extend existing)

- Test `rejectManual()` with valid reasons
- Test `escalate()` transitions status correctly
- Test `modifyTerms()` validates product bounds
- Test `approveManual()` enforces operator approval limits (mock S18-6)
- Test invalid status transitions are rejected
- Test idempotency

---

### S18-2: Contract Write Operations (5 SP)

**Requirement:** FR-LO-003.2
**Monday ID:** 11744424121
**Problem:** The contract detail page and resolver are read-only. Operators need to record manual payments, restructure contracts, and waive penalties.

#### 1. Contract Operations Service

**File:** `services/process-engine/src/contract/contract-operations.service.ts` (NEW)

```typescript
@Injectable()
export class ContractOperationsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private scheduleService: ScheduleService,
  ) {}

  /**
   * Record a manual payment (e.g., cash, bank transfer received outside the platform).
   * Applies the waterfall allocation: penalties -> fees -> interest -> principal.
   */
  async recordManualPayment(
    tenantId: string,
    contractId: string,
    input: {
      amount: string;            // Decimal string
      currency: string;
      paymentMethod: string;     // 'cash', 'bank_transfer', 'cheque', etc.
      paymentRef: string;        // external reference
      paymentDate: Date;
      notes?: string;
      operatorId: string;
    },
  ): Promise<Repayment> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);
    if (!['active', 'performing', 'due', 'overdue'].includes(contract.status)) {
      throw new ValidationError('Contract must be in an active status to receive payments');
    }

    // Create repayment record
    const repayment = await this.prisma.repayment.create({
      data: {
        tenantId,
        contractId,
        customerId: contract.customerId,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        paymentRef: input.paymentRef,
        paidAt: input.paymentDate,
        status: RepaymentStatus.completed,
        source: 'manual',
        completedAt: input.paymentDate,
        notes: input.notes,
        recordedBy: input.operatorId,
      },
    });

    // Apply waterfall allocation (use existing repayment service)
    await this.scheduleService.applyPayment(tenantId, contractId, repayment.id, input.amount);

    this.eventBus.emitAndBuild(EventType.REPAYMENT_RECEIVED, tenantId, {
      repaymentId: repayment.id,
      contractId,
      amount: input.amount,
      source: 'manual',
      operatorId: input.operatorId,
    });

    return repayment;
  }

  /**
   * Restructure a contract: extend tenor, change interest rate, or adjust balance.
   * Creates a new repayment schedule based on modified terms.
   */
  async restructureContract(
    tenantId: string,
    contractId: string,
    input: {
      newTenorDays?: number;
      newInterestRate?: string;   // Decimal string, e.g. "15.0000"
      newMaturityDate?: Date;
      restructureReason: string;
      operatorId: string;
    },
  ): Promise<Contract> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);
    if (!['active', 'performing', 'due', 'overdue'].includes(contract.status)) {
      throw new ValidationError('Contract must be in an active status to restructure');
    }

    // Store original terms for audit
    const originalTerms = {
      tenorDays: contract.tenorDays,
      interestRate: String(contract.interestRate),
      maturityDate: contract.maturityDate,
    };

    // Update contract
    const updatedContract = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        tenorDays: input.newTenorDays ?? contract.tenorDays,
        interestRate: input.newInterestRate ?? contract.interestRate,
        maturityDate: input.newMaturityDate ?? contract.maturityDate,
        metadata: {
          ...(contract.metadata as Record<string, unknown> || {}),
          restructureHistory: [
            ...((contract.metadata as Record<string, unknown>)?.restructureHistory as unknown[] || []),
            {
              originalTerms,
              newTerms: {
                tenorDays: input.newTenorDays,
                interestRate: input.newInterestRate,
                maturityDate: input.newMaturityDate,
              },
              reason: input.restructureReason,
              restructuredBy: input.operatorId,
              restructuredAt: new Date().toISOString(),
            },
          ],
        },
      },
    });

    // Regenerate remaining repayment schedule
    await this.scheduleService.regenerateSchedule(tenantId, contractId);

    this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
      contractId,
      action: 'restructured',
      originalTerms,
      operatorId: input.operatorId,
    });

    return updatedContract;
  }

  /**
   * Waive outstanding penalties on a contract.
   * Sets penalty balance to zero and records the waiver.
   */
  async waivePenalties(
    tenantId: string,
    contractId: string,
    input: {
      waiverAmount: string;      // Decimal string — how much to waive (can be partial)
      waiverReason: string;
      operatorId: string;
    },
  ): Promise<Contract> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const outstandingPenalties = String(contract.outstandingPenalties || 0);
    if (compare(input.waiverAmount, outstandingPenalties) > 0) {
      throw new ValidationError(
        `Waiver amount ${input.waiverAmount} exceeds outstanding penalties ${outstandingPenalties}`,
      );
    }

    const newOutstandingPenalties = subtract(outstandingPenalties, input.waiverAmount);
    const newTotalOutstanding = subtract(String(contract.totalOutstanding), input.waiverAmount);

    const updatedContract = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingPenalties: newOutstandingPenalties,
        totalOutstanding: newTotalOutstanding,
        metadata: {
          ...(contract.metadata as Record<string, unknown> || {}),
          penaltyWaivers: [
            ...((contract.metadata as Record<string, unknown>)?.penaltyWaivers as unknown[] || []),
            {
              amount: input.waiverAmount,
              reason: input.waiverReason,
              waivedBy: input.operatorId,
              waivedAt: new Date().toISOString(),
              outstandingBefore: outstandingPenalties,
              outstandingAfter: newOutstandingPenalties,
            },
          ],
        },
      },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
      contractId,
      action: 'penalty_waived',
      waiverAmount: input.waiverAmount,
      operatorId: input.operatorId,
    });

    return updatedContract;
  }
}
```

Register in `services/process-engine/src/contract/contract.module.ts`.

#### 2. GraphQL Mutations

**Modify:** `apps/graphql-server/src/graphql/resolvers/contract.resolver.ts`

Add mutations:

```typescript
@Mutation(() => RepaymentType)
@AuditAction(AuditActionType.CREATE, AuditResourceType.REPAYMENT)
@Roles('contract:update')
async recordManualPayment(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('contractId', { type: () => ID }) contractId: string,
  @Args('input', { type: () => ManualPaymentInput }) input: ManualPaymentInput,
  @Args('idempotencyKey') idempotencyKey: string,
): Promise<RepaymentType> { ... }

@Mutation(() => ContractType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
@Roles('contract:update')
async restructureContract(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('contractId', { type: () => ID }) contractId: string,
  @Args('input', { type: () => RestructureContractInput }) input: RestructureContractInput,
  @Args('idempotencyKey') idempotencyKey: string,
): Promise<ContractType> { ... }

@Mutation(() => ContractType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
@Roles('contract:update')
async waivePenalties(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: IAuthenticatedUser,
  @Args('contractId', { type: () => ID }) contractId: string,
  @Args('input', { type: () => WaivePenaltiesInput }) input: WaivePenaltiesInput,
  @Args('idempotencyKey') idempotencyKey: string,
): Promise<ContractType> { ... }
```

**File:** `apps/graphql-server/src/graphql/inputs/contract-operations.input.ts` (NEW)

```typescript
@InputType()
export class ManualPaymentInput {
  @Field()
  amount!: string;

  @Field()
  currency!: string;

  @Field()
  paymentMethod!: string;

  @Field()
  paymentRef!: string;

  @Field()
  paymentDate!: Date;

  @Field({ nullable: true })
  notes?: string;
}

@InputType()
export class RestructureContractInput {
  @Field(() => Int, { nullable: true })
  newTenorDays?: number;

  @Field({ nullable: true })
  newInterestRate?: string;

  @Field({ nullable: true })
  newMaturityDate?: Date;

  @Field()
  restructureReason!: string;
}

@InputType()
export class WaivePenaltiesInput {
  @Field()
  waiverAmount!: string;

  @Field()
  waiverReason!: string;
}
```

#### 3. Admin Portal: Contract Operations UI

**Modify:** `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

Add three action buttons to the existing contract detail page:

1. **Record Payment** button -> opens slide-over panel with:
   - Amount field (Decimal input, prefilled with total outstanding)
   - Currency (auto from contract)
   - Payment method dropdown: Cash, Bank Transfer, Cheque, Mobile Money
   - Payment reference field
   - Payment date picker
   - Notes textarea
   - Submit button

2. **Restructure** button -> opens slide-over panel with:
   - Current terms displayed (read-only)
   - New tenor (days) field
   - New interest rate field
   - New maturity date picker
   - Reason textarea (mandatory)
   - Submit button

3. **Waive Penalties** button -> opens slide-over panel with:
   - Current outstanding penalties displayed
   - Waiver amount field (max = outstanding penalties)
   - Reason textarea (mandatory)
   - Submit button

All buttons should only be visible to operators with `contract:update` permission. All buttons should be disabled for contracts in terminal states (`closed`, `cancelled`, `written_off`).

Follow the slide-over panel pattern used elsewhere in the admin portal. Use `useToast()` for success/error feedback. Use i18n for all labels.

#### 4. Tests

**File:** `services/process-engine/src/contract/contract-operations.service.spec.ts` (NEW)

- Test manual payment creates repayment and applies waterfall allocation
- Test manual payment rejects inactive contracts
- Test restructure updates terms and regenerates schedule
- Test restructure validates product bounds
- Test penalty waiver rejects amounts exceeding outstanding
- Test penalty waiver partial amounts
- Test all operations emit correct events
- Test idempotency (duplicate `paymentRef` handling)

---

### S18-3: Report CSV/PDF Export (5 SP)

**Requirement:** Monday (11744420744)
**Problem:** All report views (portfolio, collections, settlement, disbursement, repayment) are display-only. Operators need downloadable exports.

#### 1. Generic Export Service

**File:** `services/entity-service/src/export/export.service.ts` (NEW)

```typescript
@Injectable()
export class ExportService {
  private readonly logger = new Logger('ExportService');

  /**
   * Generate CSV from tabular data.
   * @returns Buffer containing CSV content
   */
  async generateCsv(
    columns: { key: string; label: string; format?: 'money' | 'date' | 'datetime' | 'percent' }[],
    rows: Record<string, unknown>[],
    options?: { delimiter?: string; includeHeaders?: boolean },
  ): Promise<Buffer> {
    const delimiter = options?.delimiter ?? ',';
    const lines: string[] = [];

    if (options?.includeHeaders !== false) {
      lines.push(columns.map(c => this.escapeCsv(c.label)).join(delimiter));
    }

    for (const row of rows) {
      const cells = columns.map(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return '';
        if (col.format === 'money') return this.escapeCsv(String(value)); // Keep as string, no float
        if (col.format === 'date') return this.escapeCsv(new Date(value as string).toISOString().split('T')[0]);
        if (col.format === 'datetime') return this.escapeCsv(new Date(value as string).toISOString());
        if (col.format === 'percent') return this.escapeCsv(`${value}%`);
        return this.escapeCsv(String(value));
      });
      lines.push(cells.join(delimiter));
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /**
   * Generate PDF from tabular data using a simple table layout.
   * Uses PDFKit (add `pdfkit` to dependencies).
   * @returns Buffer containing PDF content
   */
  async generatePdf(
    title: string,
    subtitle: string,
    columns: { key: string; label: string; width?: number; format?: 'money' | 'date' | 'datetime' | 'percent' }[],
    rows: Record<string, unknown>[],
    metadata?: { generatedBy?: string; tenantName?: string; currency?: string },
  ): Promise<Buffer> {
    // Implementation using PDFKit:
    // 1. Create PDF document (A4 landscape for wide reports)
    // 2. Add header: title, subtitle, generation date, tenant name
    // 3. Render table with column headers and data rows
    // 4. Add page numbers
    // 5. Add footer: "Generated by Lōns Platform"
    // Return buffer
    // ...
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
```

**File:** `services/entity-service/src/export/export.module.ts` (NEW)
**File:** `services/entity-service/src/export/index.ts` (NEW)

Register in `services/entity-service/src/entity-service.module.ts`.

Add `pdfkit` and `@types/pdfkit` to `services/entity-service/package.json`.

#### 2. Report Export Resolver

**File:** `apps/graphql-server/src/graphql/resolvers/report-export.resolver.ts` (NEW)

```typescript
@Resolver()
export class ReportExportResolver {
  constructor(
    private reportService: ReportService,
    private exportService: ExportService,
  ) {}

  @Mutation(() => ExportResultType)
  @AuditAction(AuditActionType.EXPORT, AuditResourceType.REPORT)
  @Roles('report:read')
  async exportReport(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input', { type: () => ExportReportInput }) input: ExportReportInput,
  ): Promise<ExportResultType> {
    // 1. Fetch report data using existing report queries
    // 2. Generate export in requested format (csv or pdf)
    // 3. Store temporarily (e.g., in /tmp or S3 with expiry)
    // 4. Return download URL
    // ...
  }
}
```

**File:** `apps/graphql-server/src/graphql/inputs/report-export.input.ts` (NEW)

```typescript
@InputType()
export class ExportReportInput {
  @Field()
  reportType!: string; // 'disbursement', 'repayment', 'portfolio', 'collections', 'settlement'

  @Field()
  format!: string; // 'csv' or 'pdf'

  @Field({ nullable: true })
  dateFrom?: Date;

  @Field({ nullable: true })
  dateTo?: Date;

  @Field({ nullable: true })
  productId?: string;

  @Field({ nullable: true })
  status?: string;
}

@ObjectType()
export class ExportResultType {
  @Field()
  downloadUrl!: string;

  @Field()
  filename!: string;

  @Field()
  format!: string;

  @Field(() => Int)
  rowCount!: number;

  @Field()
  expiresAt!: Date;
}
```

#### 3. REST Download Endpoint

**File:** `apps/rest-server/src/export/export.controller.ts` (NEW)

The GraphQL mutation returns a download URL. The actual file download is served via a REST endpoint (binary content is not suitable for GraphQL):

```typescript
@Controller('v1/exports')
export class ExportController {
  @Get(':exportId')
  @Roles('report:read')
  async downloadExport(
    @Param('exportId') exportId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Look up the temporary export file
    // Set Content-Type (text/csv or application/pdf)
    // Set Content-Disposition with filename
    // Stream the file to response
  }
}
```

#### 4. Admin Portal: Export Buttons

**Modify:** `apps/admin-portal/src/app/(portal)/reports/[type]/page.tsx`

Add export buttons to every report view:

- "Export CSV" button
- "Export PDF" button

On click:
1. Call `exportReport` mutation with current filters
2. Show loading spinner
3. On success, trigger browser download from the returned `downloadUrl`
4. Show toast confirmation

Follow this pattern for a browser download trigger:

```typescript
const handleExport = async (format: 'csv' | 'pdf') => {
  setExporting(true);
  try {
    const { data } = await exportReport({
      variables: {
        input: {
          reportType: type,
          format,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
      },
    });
    // Trigger download
    const link = document.createElement('a');
    link.href = data.exportReport.downloadUrl;
    link.download = data.exportReport.filename;
    link.click();
    toast.success(t('reports.exportSuccess'));
  } catch (err) {
    toast.error(t('reports.exportError'));
  } finally {
    setExporting(false);
  }
};
```

#### 5. Tests

**File:** `services/entity-service/src/export/export.service.spec.ts` (NEW)

- Test CSV generation with various data types
- Test CSV escaping (commas, quotes, newlines in values)
- Test PDF generation produces valid buffer
- Test money values remain as strings (never converted to floats)
- Test empty dataset produces valid output

---

### S18-4: Settlement & Reconciliation Dashboard (5 SP)

**Requirement:** Monday (11744420307)
**Problem:** Settlement runs and reconciliation data exist in the backend (see `apps/graphql-server/src/graphql/resolvers/settlement.resolver.ts` and `apps/graphql-server/src/graphql/resolvers/reconciliation.resolver.ts`) but there is no dedicated dashboard page combining them.

#### 1. Admin Portal: Settlement & Reconciliation Dashboard Page

**File:** `apps/admin-portal/src/app/(portal)/settlements/page.tsx` (NEW)

Build following the pattern of the dashboard page (`apps/admin-portal/src/app/(portal)/dashboard/page.tsx`).

**Layout:**

**Top metric cards row:**
- Total settlements this month (count + total amount)
- Pending settlement amount
- Latest reconciliation match rate (%)
- Unresolved exceptions count

**Settlement runs table (main section):**
- Columns: Period Start, Period End, Status, Total Revenue, Platform Fee, SP Net, Created At
- Status badges: `calculated`, `approved`, `disbursed`, `cancelled`
- Click-through to settlement detail (expand inline or navigate)
- Filter by: date range, status
- Pagination (cursor-based, follow existing patterns)

**Reconciliation runs table (below or tab):**
- Columns: Run Date, Status, Matched Count, Unmatched Count, Match Rate %, Exceptions
- Click-through to reconciliation detail
- Filter by: date range, status

**Exceptions panel (right sidebar or bottom panel):**
- List unresolved reconciliation exceptions
- Show: exception type, severity, amount, contract ID, description
- Action: "Resolve" button with investigation notes field

**GraphQL queries to use:**

```graphql
query SettlementDashboard($pagination: PaginationInput, $dateFrom: DateTime, $dateTo: DateTime) {
  settlementRuns(pagination: $pagination, dateFrom: $dateFrom, dateTo: $dateTo) {
    edges {
      node {
        id periodStart periodEnd status totalRevenue createdAt
        lines { partyType partyId shareAmount netAmount }
      }
    }
    pageInfo { hasNextPage }
  }
  reconciliationRuns(pagination: $pagination) {
    edges {
      node {
        id runDate status matchedCount unmatchedCount matchRate exceptionCount
      }
    }
    pageInfo { hasNextPage }
  }
  reconciliationExceptions(resolved: false) {
    edges {
      node {
        id txnType exceptionType severity amount contractId description resolved
      }
    }
  }
}
```

These queries already exist in the GraphQL resolvers — no backend changes needed for this item. If the existing resolver does not expose `dateFrom`/`dateTo` filtering, add those optional arguments.

#### 2. Navigation

Add "Settlements" to the admin portal sidebar navigation. Place it under the "Reports" section. Use the `DollarSign` or `ArrowRightLeft` icon from lucide-react.

#### 3. Tests

- Verify the page renders with mock data
- Test filter interactions
- Test empty state (no settlement runs)
- Test pagination

---

### S18-5: API Key Management UI (5 SP)

**Requirement:** FR-SET-001.1
**Monday ID:** 11744421389
**Problem:** API key operations exist in the backend (`apps/graphql-server/src/graphql/resolvers/api-key.resolver.ts`) but there is no admin portal UI for operators to manage API keys.

#### 1. Admin Portal: API Key Management Page

**File:** `apps/admin-portal/src/app/(portal)/settings/api-keys/page.tsx` (NEW)

Build following the settings page pattern (`apps/admin-portal/src/app/(portal)/settings/page.tsx`).

**Layout:**

**Header:**
- Title: "API Keys"
- "Create New Key" button (primary action)

**API keys table:**
- Columns: Name, Key ID (truncated), Status (active/deprecated/revoked), Created At, Last Used, Expires At, Rate Limit
- Row actions: Rotate, Revoke
- Status badges: green for active, yellow for deprecated (grace period), red for revoked

**Create Key modal:**
- Name field (required)
- Rate limit per minute (default from plan tier)
- Expiry date (optional)
- On create: display the plaintext secret **exactly once** in a copyable box with a warning that it will never be shown again. Include a "Copy to Clipboard" button.

**Rotate Key modal:**
- Confirmation dialog explaining: "A new key will be generated. The old key will remain valid for the grace period."
- Grace period selector: 1h, 6h, 12h, 24h (default), 48h, 72h
- On rotate: display the new plaintext secret (same one-time display pattern)

**Revoke Key modal:**
- Confirmation dialog: "This key will be immediately invalidated. Any integrations using this key will stop working."
- Confirmation text input: "Type REVOKE to confirm"

**GraphQL queries/mutations (already exist in `api-key.resolver.ts`):**

```graphql
query ApiKeys($tenantId: ID!) {
  apiKeys(tenantId: $tenantId) {
    id name status createdAt lastUsedAt expiresAt rateLimitPerMin
  }
}

mutation RotateApiKey($tenantId: ID!, $apiKeyId: ID!, $gracePeriodHours: Int) {
  rotateApiKey(tenantId: $tenantId, apiKeyId: $apiKeyId, gracePeriodHours: $gracePeriodHours) {
    id newKeyId newKeySecret createdAt
  }
}

mutation RevokeApiKey($tenantId: ID!, $apiKeyId: ID!) {
  revokeApiKey(tenantId: $tenantId, apiKeyId: $apiKeyId) {
    success message
  }
}
```

**If a `createApiKey` mutation does not exist yet,** add one:

**Modify:** `apps/graphql-server/src/graphql/resolvers/api-key.resolver.ts`

```typescript
@Mutation(() => ApiKeyCreateResult)
@AuditAction(AuditActionType.API_KEY_CREATED, AuditResourceType.API_KEY)
@Roles('admin')
async createApiKey(
  @Args('tenantId', { type: () => ID }) tenantId: string,
  @Args('name') name: string,
  @Args('rateLimitPerMin', { type: () => Int, nullable: true }) rateLimitPerMin?: number,
  @Args('expiresAt', { nullable: true }) expiresAt?: Date,
): Promise<ApiKeyCreateResult> {
  const result = await this.apiKeyService.createApiKey(tenantId, {
    name,
    rateLimitPerMin: rateLimitPerMin ?? 60,
    expiresAt,
  });
  return {
    id: result.id,
    name: result.name,
    clientId: result.id,
    clientSecret: result.plaintext, // shown only once
  };
}
```

Add `API_KEY_CREATED` to `AuditActionType` if not present.

#### 2. Navigation

Add "API Keys" under the Settings section in admin portal sidebar.

#### 3. Tests

- Test page renders API key list
- Test create key flow (modal open, submit, secret display)
- Test rotate key flow
- Test revoke key flow with confirmation
- Test that plaintext secret is only shown once (not re-fetchable)

---

### S18-11: Plan Tier Dashboard, Usage Display & Upgrade Request (8 SP)

**Requirement:** SPEC-plan-tiers.md §5 (Tier Management UI)
**Monday ID:** 11750804130
**Problem:** The backend already has `PlanTierConfig`, `TenantBillingConfig`, `BillingInvoice`, and `DisbursementFee` models (Sprint 14), plus a `BillingResolver` with `billingInvoices` and `markInvoicePaid` queries (Sprint 15). However there is **no admin portal UI** for tenants to view their plan, monitor usage against limits, review billing history, or request tier upgrades. Operators have no visibility into their subscription status.

#### 1. Backend: Plan Tier & Usage GraphQL Queries

**Modify:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`

Add plan tier and usage queries alongside the existing billing invoice queries:

```typescript
@Query(() => PlanTierSummaryType)
@Roles('billing:read')
async planTierSummary(
  @CurrentTenant() tenantId: string,
): Promise<PlanTierSummaryType> {
  const tenant = await this.prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { billingConfig: true },
  });

  const tierConfig = await this.prisma.planTierConfig.findUnique({
    where: { tier: tenant.planTier },
  });

  const usageMetrics = await this.usageMetricsService.getCurrentUsage(tenantId);

  return {
    currentTier: tenant.planTier,
    tierDisplayName: tierConfig?.displayName ?? tenant.planTier,
    billingModel: tenant.billingConfig?.billingModel ?? 'per_disbursement',
    subscriptionAmount: tenant.billingConfig?.subscriptionAmountUsd?.toString() ?? '0',
    billingCurrency: tenant.billingConfig?.billingCurrency ?? 'USD',
    contractStartDate: tenant.billingConfig?.contractStartDate?.toISOString() ?? null,
    contractEndDate: tenant.billingConfig?.contractEndDate?.toISOString() ?? null,
    usage: usageMetrics,
    limits: {
      maxActiveProducts: tierConfig?.maxActiveProducts ?? null,
      maxCustomers: tierConfig?.maxCustomers ?? null,
      maxMonthlyDisbursementVolumeUsd: tierConfig?.maxMonthlyDisbursementVolumeUsd?.toString() ?? null,
      maxMonthlyTransactions: tierConfig?.maxMonthlyTransactions ?? null,
      maxLenderConfigs: tierConfig?.maxLenderConfigs ?? null,
      maxBnplMerchants: tierConfig?.maxBnplMerchants ?? null,
      maxPortalUsers: tierConfig?.maxPortalUsers ?? null,
      maxApiKeys: tierConfig?.maxApiKeys ?? null,
      apiRateLimitPerMinute: tierConfig?.apiRateLimitPerMinute ?? 60,
    },
    featureFlags: tierConfig?.featureFlags ?? {},
  };
}

@Query(() => [PlanTierComparisonType])
@Roles('billing:read')
async planTierComparison(): Promise<PlanTierComparisonType[]> {
  const tiers = await this.prisma.planTierConfig.findMany({
    orderBy: { apiRateLimitPerMinute: 'asc' }, // starter < professional < enterprise
  });
  return tiers.map((t) => ({
    tier: t.tier,
    displayName: t.displayName,
    maxActiveProducts: t.maxActiveProducts,
    maxCustomers: t.maxCustomers,
    maxMonthlyDisbursementVolumeUsd: t.maxMonthlyDisbursementVolumeUsd?.toString() ?? null,
    maxMonthlyTransactions: t.maxMonthlyTransactions,
    maxLenderConfigs: t.maxLenderConfigs,
    maxPortalUsers: t.maxPortalUsers,
    apiRateLimitPerMinute: t.apiRateLimitPerMinute,
    restApiEnabled: t.restApiEnabled,
    websocketEnabled: t.websocketEnabled,
    bulkOperationsEnabled: t.bulkOperationsEnabled,
    featureFlags: t.featureFlags,
    allowedProductTypes: t.allowedProductTypes,
  }));
}
```

Inject `UsageMetricsService` into `BillingResolver` constructor. If `UsageMetricsService` is not in entity-service yet (it should exist from Sprint 14), create it.

**`UsageMetricsService.getCurrentUsage(tenantId)`** should return:

```typescript
interface CurrentUsage {
  activeProducts: number;
  totalCustomers: number;
  monthlyDisbursementVolumeUsd: string; // Decimal as string
  monthlyTransactions: number;
  activeLenderConfigs: number;
  activeBnplMerchants: number;
  portalUsers: number;
  activeApiKeys: number;
}
```

Each metric is a simple `COUNT(*)` or `SUM()` query scoped to the tenant. Monthly metrics use a rolling 30-day window.

#### 2. Backend: Upgrade Request Mutation

**Modify:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`

```typescript
@Mutation(() => UpgradeRequestType)
@Roles('admin')
@AuditAction(AuditActionType.PLAN_UPGRADE_REQUESTED, AuditResourceType.TENANT)
async requestPlanUpgrade(
  @CurrentTenant() tenantId: string,
  @Args('targetTier', { type: () => String }) targetTier: string,
  @Args('reason', { nullable: true }) reason?: string,
  @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
): Promise<UpgradeRequestType> {
  // Validate targetTier is a valid PlanTier enum value
  // Validate targetTier is higher than current tier (starter < professional < enterprise)
  // Create a record in a new UpgradeRequest table (or use tenant audit log)
  // Emit PLAN_UPGRADE_REQUESTED event
  // Return confirmation with request ID and status 'pending'

  const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const tierOrder = { starter: 0, professional: 1, enterprise: 2 };
  if (tierOrder[targetTier] <= tierOrder[tenant.planTier]) {
    throw new BadRequestException('Target tier must be higher than current tier');
  }

  // Store upgrade request
  const request = await this.prisma.upgradeRequest.create({
    data: {
      tenantId,
      currentTier: tenant.planTier,
      requestedTier: targetTier as PlanTier,
      reason,
      status: 'pending',
      requestedBy: /* extract from context */,
    },
  });

  this.eventBus.emitAndBuild(EventType.PLAN_UPGRADE_REQUESTED, tenantId, {
    requestId: request.id,
    currentTier: tenant.planTier,
    requestedTier: targetTier,
  });

  return {
    id: request.id,
    currentTier: tenant.planTier,
    requestedTier: targetTier,
    status: 'pending',
    createdAt: request.createdAt,
  };
}
```

Add `PLAN_UPGRADE_REQUESTED` to `AuditActionType` and `EventType`.

#### 3. GraphQL Types

**File:** `apps/graphql-server/src/graphql/types/plan-tier.type.ts` (NEW)

```typescript
@ObjectType()
export class UsageLimitsType {
  @Field(() => Int, { nullable: true }) maxActiveProducts?: number;
  @Field(() => Int, { nullable: true }) maxCustomers?: number;
  @Field({ nullable: true }) maxMonthlyDisbursementVolumeUsd?: string;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number;
  @Field(() => Int, { nullable: true }) maxBnplMerchants?: number;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number;
  @Field(() => Int, { nullable: true }) maxApiKeys?: number;
  @Field(() => Int) apiRateLimitPerMinute: number;
}

@ObjectType()
export class CurrentUsageType {
  @Field(() => Int) activeProducts: number;
  @Field(() => Int) totalCustomers: number;
  @Field() monthlyDisbursementVolumeUsd: string;
  @Field(() => Int) monthlyTransactions: number;
  @Field(() => Int) activeLenderConfigs: number;
  @Field(() => Int) activeBnplMerchants: number;
  @Field(() => Int) portalUsers: number;
  @Field(() => Int) activeApiKeys: number;
}

@ObjectType()
export class PlanTierSummaryType {
  @Field() currentTier: string;
  @Field() tierDisplayName: string;
  @Field() billingModel: string;
  @Field() subscriptionAmount: string;
  @Field() billingCurrency: string;
  @Field({ nullable: true }) contractStartDate?: string;
  @Field({ nullable: true }) contractEndDate?: string;
  @Field(() => CurrentUsageType) usage: CurrentUsageType;
  @Field(() => UsageLimitsType) limits: UsageLimitsType;
  @Field(() => GraphQLJSON) featureFlags: Record<string, unknown>;
}

@ObjectType()
export class PlanTierComparisonType {
  @Field() tier: string;
  @Field() displayName: string;
  @Field(() => Int, { nullable: true }) maxActiveProducts?: number;
  @Field(() => Int, { nullable: true }) maxCustomers?: number;
  @Field({ nullable: true }) maxMonthlyDisbursementVolumeUsd?: string;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number;
  @Field(() => Int) apiRateLimitPerMinute: number;
  @Field() restApiEnabled: boolean;
  @Field() websocketEnabled: boolean;
  @Field() bulkOperationsEnabled: boolean;
  @Field(() => GraphQLJSON) featureFlags: Record<string, unknown>;
  @Field(() => GraphQLJSON) allowedProductTypes: unknown;
}

@ObjectType()
export class UpgradeRequestType {
  @Field(() => ID) id: string;
  @Field() currentTier: string;
  @Field() requestedTier: string;
  @Field() status: string; // pending | approved | rejected
  @Field() createdAt: Date;
}
```

#### 4. Schema Addition: UpgradeRequest Model

**Modify:** `packages/database/prisma/schema.prisma`

```prisma
model UpgradeRequest {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  currentTier    PlanTier  @map("current_tier")
  requestedTier  PlanTier  @map("requested_tier")
  reason         String?   @db.Text
  status         String    @default("pending") @db.VarChar(20) // pending | approved | rejected
  requestedBy    String?   @map("requested_by") @db.Uuid
  reviewedBy     String?   @map("reviewed_by") @db.Uuid
  reviewedAt     DateTime? @map("reviewed_at") @db.Timestamptz(6)
  reviewNotes    String?   @map("review_notes") @db.Text
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([status])
  @@map("upgrade_requests")
}
```

Add `upgradeRequests UpgradeRequest[]` relation to the `Tenant` model. RLS required (tenant-scoped).

#### 5. Admin Portal: Billing & Plan Page

**File:** `apps/admin-portal/src/app/(portal)/settings/billing/page.tsx` (NEW)

Build following the settings page pattern (`apps/admin-portal/src/app/(portal)/settings/api-keys/page.tsx` from S18-5).

**Layout — 4 sections:**

**Section 1: Current Plan Summary (card)**
- Plan tier badge (Starter / Professional / Enterprise) with colour coding
- Billing model label (e.g., "Per-Disbursement" or "Revenue Share")
- Monthly subscription amount with currency
- Contract dates (start — end, or "Month-to-month" if no end date)
- "Compare Plans" button (opens comparison modal)
- "Request Upgrade" button (only visible if not on Enterprise tier)

**Section 2: Usage Meters (grid of meter cards, 2×4 on desktop)**

Each meter card shows:
- Metric label (e.g., "Active Products")
- Current value / limit (e.g., "7 / 10") — or "7 / ∞" if unlimited
- Progress bar (green < 70%, amber 70-90%, red > 90%)
- If no limit (null), show value with "Unlimited" label and no progress bar

Meters to display:
1. Active Products — `usage.activeProducts` / `limits.maxActiveProducts`
2. Total Customers — `usage.totalCustomers` / `limits.maxCustomers`
3. Monthly Disbursement Volume — `usage.monthlyDisbursementVolumeUsd` / `limits.maxMonthlyDisbursementVolumeUsd` (format as currency)
4. Monthly Transactions — `usage.monthlyTransactions` / `limits.maxMonthlyTransactions`
5. Lender Configs — `usage.activeLenderConfigs` / `limits.maxLenderConfigs`
6. Portal Users — `usage.portalUsers` / `limits.maxPortalUsers`
7. API Keys — `usage.activeApiKeys` / `limits.maxApiKeys`
8. API Rate Limit — display as info card (not a meter): "`limits.apiRateLimitPerMinute` req/min"

**Section 3: Billing History Table**

Uses the existing `billingInvoices` query from `BillingResolver`.

- Columns: Invoice #, Period, Type (subscription/usage/revenue_share), Subtotal, Tax, Total, Status, Due Date, Actions
- Status badges: green (paid), blue (issued), grey (draft), red (overdue), muted (cancelled/void)
- Row action: "View Details" → expands to show line items inline or navigates to detail view
- Pagination: cursor-based using the existing `BillingInvoiceConnection`
- Filter controls: Type dropdown, Status dropdown, Date range picker

**Section 4: Feature Flags Summary (collapsible)**

Display current tier's feature flags from `planTierSummary.featureFlags`:
- ML Scoring: enabled/disabled
- AI Recovery: enabled/disabled
- Collections Level: basic/advanced/enterprise
- Custom Reports: yes/no
- Scheduled Reports: yes/no
- Settlement Level: basic/advanced/enterprise
- REST API: enabled/disabled
- WebSocket: enabled/disabled
- Bulk Operations: enabled/disabled

Each as a simple label + status indicator (green check / grey dash).

**Plan Comparison Modal:**

Triggered by "Compare Plans" button. Displays a 3-column comparison table (Starter | Professional | Enterprise):
- Rows: all limits and feature flags from `planTierComparison` query
- Current tier column highlighted
- Monetary limits formatted as currency
- null values shown as "Unlimited"
- Footer: "Request Upgrade" CTA if not on Enterprise

**Upgrade Request Modal:**

Triggered by "Request Upgrade" button:
- Target tier selector (only tiers above current shown)
- Reason textarea (optional, but encouraged — "Help us understand your needs")
- Submit button → calls `requestPlanUpgrade` mutation
- Success state: "Your upgrade request has been submitted. Our team will review it within 2 business days."
- Error state: shows error message from backend

**GraphQL queries for this page:**

```graphql
query PlanTierSummary {
  planTierSummary {
    currentTier
    tierDisplayName
    billingModel
    subscriptionAmount
    billingCurrency
    contractStartDate
    contractEndDate
    usage {
      activeProducts
      totalCustomers
      monthlyDisbursementVolumeUsd
      monthlyTransactions
      activeLenderConfigs
      activeBnplMerchants
      portalUsers
      activeApiKeys
    }
    limits {
      maxActiveProducts
      maxCustomers
      maxMonthlyDisbursementVolumeUsd
      maxMonthlyTransactions
      maxLenderConfigs
      maxBnplMerchants
      maxPortalUsers
      maxApiKeys
      apiRateLimitPerMinute
    }
    featureFlags
  }
}

query PlanTierComparison {
  planTierComparison {
    tier displayName maxActiveProducts maxCustomers
    maxMonthlyDisbursementVolumeUsd maxMonthlyTransactions
    maxLenderConfigs maxPortalUsers apiRateLimitPerMinute
    restApiEnabled websocketEnabled bulkOperationsEnabled
    featureFlags allowedProductTypes
  }
}

# billingInvoices query already exists — reuse from BillingResolver
```

#### 6. Navigation

Add "Billing & Plan" under the Settings section in admin portal sidebar, between "API Keys" (S18-5) and "Audit Log".

#### 7. Tests

**Backend tests (`apps/graphql-server/src/graphql/resolvers/billing.resolver.spec.ts`):**
- Test `planTierSummary` returns correct tier, usage counts, and limits for starter tenant
- Test `planTierSummary` returns null limits as null (not 0) for enterprise
- Test `planTierComparison` returns all 3 tiers in order
- Test `requestPlanUpgrade` creates upgrade request with status `pending`
- Test `requestPlanUpgrade` rejects downgrade (professional → starter)
- Test `requestPlanUpgrade` rejects same-tier request
- Test `requestPlanUpgrade` emits `PLAN_UPGRADE_REQUESTED` event
- Test `requestPlanUpgrade` is audit-logged

**Usage metrics tests:**
- Test `getCurrentUsage` counts active products correctly (excludes deleted)
- Test `getCurrentUsage` counts monthly transactions in rolling 30-day window
- Test monthly disbursement volume uses Decimal aggregation (no float)
- Test zero usage for new tenant returns all zeros

**Admin portal tests:**
- Test page renders plan summary card with tier badge
- Test usage meters display correct values and progress bars
- Test amber/red threshold colouring on meters near limits
- Test unlimited metrics display "Unlimited" with no progress bar
- Test billing history table renders with pagination
- Test plan comparison modal opens and displays 3-column table
- Test upgrade request modal submits and shows success state
- Test upgrade button hidden for Enterprise tier tenants

---

## Track B: Process Engine (21 SP)

### S18-6: Approval Authority Limits per Operator (5 SP)

**Requirement:** FR-AE-002.4 (BA Gap)
**Monday ID:** 11744424553
**Problem:** Any operator with `loan_request:approve` permission can approve any loan of any size. There are no per-operator limits on approval authority.

#### 1. Prisma Model

**Add to `packages/database/prisma/schema.prisma`:**

```prisma
model OperatorApprovalLimit {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  userId              String   @map("user_id") @db.Uuid
  /** Maximum loan amount this operator can approve (Decimal string) */
  maxApprovalAmount   Decimal  @map("max_approval_amount") @db.Decimal(19, 4)
  /** Maximum number of approvals per day (null = unlimited) */
  maxApprovalsPerDay  Int?     @map("max_approvals_per_day")
  /** Product types this operator can approve (null = all) */
  allowedProductTypes Json?    @map("allowed_product_types") // e.g. ["micro_loan", "overdraft"]
  /** Whether this operator can approve escalated requests */
  canApproveEscalated Boolean @default(false) @map("can_approve_escalated")
  /** Active flag */
  isActive            Boolean  @default(true) @map("is_active")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id])

  @@unique([tenantId, userId])
  @@index([tenantId])
  @@index([userId])
  @@map("operator_approval_limits")
}
```

Add `approvalLimit OperatorApprovalLimit?` to the `User` model's relations.

**Migration** with RLS policy:

```sql
ALTER TABLE operator_approval_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON operator_approval_limits
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

#### 2. Approval Limit Service

**File:** `services/process-engine/src/approval/approval-limit.service.ts` (NEW)

```typescript
@Injectable()
export class ApprovalLimitService {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  /**
   * Validate that an operator is authorized to perform the given action on a loan request.
   * Throws ForbiddenException if any limit is exceeded.
   */
  async validateOperatorAction(
    tenantId: string,
    operatorId: string,
    action: 'approve' | 'reject' | 'escalate',
    loanRequest: { requestedAmount: Decimal; product: { productType: string }; status: string },
  ): Promise<void> {
    const limits = await this.getOperatorLimits(tenantId, operatorId);

    // No limits configured — operator has no restrictions (for backward compat)
    if (!limits) return;

    if (!limits.isActive) {
      throw new ForbiddenException('Operator approval privileges are suspended');
    }

    if (action === 'approve') {
      // Check amount limit
      if (compare(String(loanRequest.requestedAmount), String(limits.maxApprovalAmount)) > 0) {
        throw new ForbiddenException({
          code: 'APPROVAL_LIMIT_EXCEEDED',
          message: `Loan amount ${loanRequest.requestedAmount} exceeds your approval limit of ${limits.maxApprovalAmount}`,
          maxApprovalAmount: String(limits.maxApprovalAmount),
        });
      }

      // Check daily approval count
      if (limits.maxApprovalsPerDay !== null) {
        const todayCount = await this.getTodayApprovalCount(tenantId, operatorId);
        if (todayCount >= limits.maxApprovalsPerDay) {
          throw new ForbiddenException({
            code: 'DAILY_APPROVAL_LIMIT_REACHED',
            message: `Daily approval limit of ${limits.maxApprovalsPerDay} reached`,
          });
        }
      }

      // Check product type restriction
      if (limits.allowedProductTypes) {
        const allowed = limits.allowedProductTypes as string[];
        if (!allowed.includes(loanRequest.product.productType)) {
          throw new ForbiddenException({
            code: 'PRODUCT_TYPE_NOT_ALLOWED',
            message: `You are not authorized to approve ${loanRequest.product.productType} loans`,
          });
        }
      }

      // Check escalated request authorization
      if (loanRequest.status === 'escalated' && !limits.canApproveEscalated) {
        throw new ForbiddenException({
          code: 'CANNOT_APPROVE_ESCALATED',
          message: 'You are not authorized to approve escalated loan requests',
        });
      }
    }
  }

  /**
   * Get operator limits (cached in Redis, TTL 5 min).
   */
  async getOperatorLimits(
    tenantId: string,
    operatorId: string,
  ): Promise<OperatorApprovalLimit | null> {
    const cacheKey = `approval_limits:${tenantId}:${operatorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const limits = await this.prisma.operatorApprovalLimit.findUnique({
      where: { tenantId_userId: { tenantId, userId: operatorId } },
    });

    if (limits) {
      await this.redis.set(cacheKey, JSON.stringify(limits), 'EX', 300);
    }
    return limits;
  }

  /**
   * Count today's approvals by this operator.
   * Uses Redis counter with midnight expiry for fast lookups.
   */
  private async getTodayApprovalCount(tenantId: string, operatorId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const counterKey = `approval_count:${tenantId}:${operatorId}:${today}`;
    const count = await this.redis.get(counterKey);
    if (count !== null) return parseInt(count, 10);

    // Fallback to DB count
    const startOfDay = new Date(today + 'T00:00:00Z');
    const endOfDay = new Date(today + 'T23:59:59.999Z');
    const dbCount = await this.prisma.loanRequest.count({
      where: {
        tenantId,
        status: { in: ['approved', 'offer_sent', 'offer_accepted', 'disbursing', 'disbursed'] },
        metadata: { path: ['reviewedBy'], equals: operatorId },
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    await this.redis.set(counterKey, String(dbCount), 'EX', 86400);
    return dbCount;
  }

  /**
   * Increment daily approval counter (call after successful approval).
   */
  async incrementDailyCount(tenantId: string, operatorId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const counterKey = `approval_count:${tenantId}:${operatorId}:${today}`;
    await this.redis.incr(counterKey);
    // Set expiry only if key is new
    const ttl = await this.redis.ttl(counterKey);
    if (ttl < 0) {
      await this.redis.expire(counterKey, 86400);
    }
  }

  // --- CRUD ---

  async setLimits(
    tenantId: string,
    userId: string,
    input: SetApprovalLimitsInput,
  ): Promise<OperatorApprovalLimit> {
    const result = await this.prisma.operatorApprovalLimit.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        maxApprovalAmount: input.maxApprovalAmount,
        maxApprovalsPerDay: input.maxApprovalsPerDay,
        allowedProductTypes: input.allowedProductTypes,
        canApproveEscalated: input.canApproveEscalated ?? false,
      },
      update: {
        maxApprovalAmount: input.maxApprovalAmount,
        maxApprovalsPerDay: input.maxApprovalsPerDay,
        allowedProductTypes: input.allowedProductTypes,
        canApproveEscalated: input.canApproveEscalated,
        isActive: input.isActive,
      },
    });

    // Invalidate cache
    await this.redis.del(`approval_limits:${tenantId}:${userId}`);
    return result;
  }

  async getLimitsForTenant(tenantId: string): Promise<OperatorApprovalLimit[]> {
    return this.prisma.operatorApprovalLimit.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
  }
}
```

Register in `services/process-engine/src/approval/approval.module.ts`.

#### 3. GraphQL Resolvers

**File:** `apps/graphql-server/src/graphql/resolvers/approval-limit.resolver.ts` (NEW)

```typescript
@Resolver()
export class ApprovalLimitResolver {
  constructor(private approvalLimitService: ApprovalLimitService) {}

  @Query(() => [OperatorApprovalLimitType])
  @Roles('admin')
  async operatorApprovalLimits(
    @CurrentTenant() tenantId: string,
  ): Promise<OperatorApprovalLimitType[]> {
    return this.approvalLimitService.getLimitsForTenant(tenantId) as unknown as OperatorApprovalLimitType[];
  }

  @Mutation(() => OperatorApprovalLimitType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  @Roles('admin')
  async setOperatorApprovalLimits(
    @CurrentTenant() tenantId: string,
    @Args('userId', { type: () => ID }) userId: string,
    @Args('input', { type: () => SetApprovalLimitsInput }) input: SetApprovalLimitsInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<OperatorApprovalLimitType> { ... }
}
```

**File:** `apps/graphql-server/src/graphql/types/approval-limit.type.ts` (NEW)

```typescript
@ObjectType()
export class OperatorApprovalLimitType {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field()
  maxApprovalAmount!: string;

  @Field(() => Int, { nullable: true })
  maxApprovalsPerDay?: number;

  @Field(() => [String], { nullable: true })
  allowedProductTypes?: string[];

  @Field()
  canApproveEscalated!: boolean;

  @Field()
  isActive!: boolean;
}
```

**File:** `apps/graphql-server/src/graphql/inputs/approval-limit.input.ts` (NEW)

```typescript
@InputType()
export class SetApprovalLimitsInput {
  @Field()
  maxApprovalAmount!: string;

  @Field(() => Int, { nullable: true })
  maxApprovalsPerDay?: number;

  @Field(() => [String], { nullable: true })
  allowedProductTypes?: string[];

  @Field({ nullable: true })
  canApproveEscalated?: boolean;

  @Field({ nullable: true })
  isActive?: boolean;
}
```

#### 4. Admin Portal: Approval Limits Settings

**File:** `apps/admin-portal/src/app/(portal)/settings/approval-limits/page.tsx` (NEW)

Simple settings page under Settings:
- Table listing all operators with configured limits
- Columns: Operator Name, Max Amount, Max/Day, Product Types, Can Approve Escalated, Active
- "Configure Limits" button per operator -> opens modal with fields matching `SetApprovalLimitsInput`
- Users without configured limits shown as "No limits (unrestricted)"

Add navigation link under Settings in the sidebar.

#### 5. Tests

**File:** `services/process-engine/src/approval/approval-limit.service.spec.ts` (NEW)

- Test `validateOperatorAction` passes when within limits
- Test amount limit exceeded throws ForbiddenException
- Test daily count limit enforced
- Test product type restriction
- Test escalated request restriction
- Test no limits configured = no restrictions (backward compat)
- Test cache invalidation on limit update
- Test Redis counter increment and expiry

---

### S18-7: Per-Step Pipeline Audit Trail (8 SP)

**Requirement:** FR-PE-006 (BA Gap)
**Problem:** The loan request pipeline (validation -> scoring -> approval -> offer -> acceptance -> disbursement) does not log detailed per-step data. When issues arise, there is no audit trail showing what each step received, what it produced, or how long it took.

#### 1. Prisma Model

**Add to `packages/database/prisma/schema.prisma`:**

```prisma
model PipelineStepLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  loanRequestId   String   @map("loan_request_id") @db.Uuid
  /** Pipeline step name */
  stepName        String   @map("step_name") @db.VarChar(100)
  // e.g. 'pre_qualification', 'scoring', 'approval', 'offer_generation',
  //      'offer_acceptance', 'disbursement', 'contract_creation'
  /** Step execution order within the pipeline */
  stepOrder       Int      @map("step_order")
  /** Outcome of this step */
  outcome         String   @db.VarChar(50)
  // e.g. 'success', 'rejected', 'error', 'skipped', 'timeout'
  /** Inputs to this step (sanitized — no PII) */
  inputs          Json?
  /** Outputs from this step (sanitized — no PII) */
  outputs         Json?
  /** Error details if outcome = 'error' */
  errorMessage    String?  @map("error_message") @db.Text
  errorCode       String?  @map("error_code") @db.VarChar(100)
  /** Duration in milliseconds */
  durationMs      Int      @map("duration_ms")
  /** Operator who triggered this step (null for auto steps) */
  triggeredBy     String?  @map("triggered_by") @db.Uuid
  /** Timestamp when step started */
  startedAt       DateTime @map("started_at") @db.Timestamptz(6)
  /** Timestamp when step completed */
  completedAt     DateTime @map("completed_at") @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  loanRequest LoanRequest @relation(fields: [loanRequestId], references: [id])

  @@index([tenantId])
  @@index([loanRequestId])
  @@index([loanRequestId, stepOrder])
  @@map("pipeline_step_logs")
}
```

Add `pipelineSteps PipelineStepLog[]` to the `LoanRequest` model's relations.

**Migration** with RLS policy. This is an append-only audit table — **no updates, no deletes**.

#### 2. Pipeline Step Logger Service

**File:** `services/process-engine/src/pipeline/pipeline-step-logger.service.ts` (NEW)

```typescript
@Injectable()
export class PipelineStepLoggerService {
  private readonly logger = new Logger('PipelineStepLogger');

  constructor(private prisma: PrismaService) {}

  /**
   * Log a pipeline step execution.
   * Strips PII from inputs/outputs before storage.
   */
  async logStep(
    tenantId: string,
    loanRequestId: string,
    step: {
      stepName: string;
      stepOrder: number;
      outcome: 'success' | 'rejected' | 'error' | 'skipped' | 'timeout';
      inputs?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
      errorMessage?: string;
      errorCode?: string;
      durationMs: number;
      triggeredBy?: string;
      startedAt: Date;
      completedAt: Date;
    },
  ): Promise<PipelineStepLog> {
    return this.prisma.pipelineStepLog.create({
      data: {
        tenantId,
        loanRequestId,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        outcome: step.outcome,
        inputs: step.inputs ? this.sanitize(step.inputs) : undefined,
        outputs: step.outputs ? this.sanitize(step.outputs) : undefined,
        errorMessage: step.errorMessage,
        errorCode: step.errorCode,
        durationMs: step.durationMs,
        triggeredBy: step.triggeredBy,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      },
    });
  }

  /**
   * Convenience wrapper: measure step execution time and log.
   */
  async executeAndLog<T>(
    tenantId: string,
    loanRequestId: string,
    stepName: string,
    stepOrder: number,
    inputs: Record<string, unknown>,
    fn: () => Promise<T>,
    triggeredBy?: string,
  ): Promise<T> {
    const startedAt = new Date();
    try {
      const result = await fn();
      const completedAt = new Date();
      await this.logStep(tenantId, loanRequestId, {
        stepName,
        stepOrder,
        outcome: 'success',
        inputs,
        outputs: typeof result === 'object' ? (result as Record<string, unknown>) : { result },
        durationMs: completedAt.getTime() - startedAt.getTime(),
        triggeredBy,
        startedAt,
        completedAt,
      });
      return result;
    } catch (error) {
      const completedAt = new Date();
      await this.logStep(tenantId, loanRequestId, {
        stepName,
        stepOrder,
        outcome: 'error',
        inputs,
        errorMessage: error.message,
        errorCode: error.code || 'UNKNOWN',
        durationMs: completedAt.getTime() - startedAt.getTime(),
        triggeredBy,
        startedAt,
        completedAt,
      });
      throw error;
    }
  }

  /**
   * Get all pipeline steps for a loan request (for audit display).
   */
  async getStepsForLoanRequest(
    tenantId: string,
    loanRequestId: string,
  ): Promise<PipelineStepLog[]> {
    return this.prisma.pipelineStepLog.findMany({
      where: { tenantId, loanRequestId },
      orderBy: { stepOrder: 'asc' },
    });
  }

  /**
   * Remove PII from inputs/outputs before storing.
   * Strip: nationalId, phone, email, fullName, dateOfBirth
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const piiFields = ['nationalId', 'national_id', 'phone', 'phonePrimary', 'phone_primary',
                       'email', 'fullName', 'full_name', 'dateOfBirth', 'date_of_birth'];
    const sanitized = { ...data };
    for (const field of piiFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }
    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      }
    }
    return sanitized;
  }
}
```

**File:** `services/process-engine/src/pipeline/pipeline-step-logger.module.ts` (NEW)
**File:** `services/process-engine/src/pipeline/index.ts` (NEW)

Register in the process-engine module.

#### 3. Wire into Pipeline Steps

**Modify the following files** to wrap each pipeline step with `pipelineStepLoggerService.executeAndLog()`:

1. **Pre-qualification:** `services/process-engine/src/pre-qualification/pre-qualification.service.ts`
   - Wrap the `preQualify()` method. Step name: `pre_qualification`, order: 1.
   - Inputs: `{ customerId, productId, ruleCount }`
   - Outputs: `{ qualified: boolean, failedRules: [...] }`

2. **Scoring:** `services/process-engine/src/scoring/scoring.service.ts`
   - Wrap the `scoreCustomer()` method. Step name: `scoring`, order: 2.
   - Inputs: `{ customerId, productId, scorecardVersion }`
   - Outputs: `{ score, riskTier, recommendedLimit, dataCompleteness }`

3. **Approval:** `services/process-engine/src/approval/approval.service.ts`
   - Wrap `makeDecision()` and `approveManual()`/`rejectManual()`. Step name: `approval`, order: 3.
   - Inputs: `{ score, autoApproveAbove, autoRejectBelow, workflow }`
   - Outputs: `{ decision, approvedAmount, reason }`

4. **Offer generation:** `services/process-engine/src/offer/offer.service.ts`
   - Wrap the offer generation. Step name: `offer_generation`, order: 4.
   - Inputs: `{ approvedAmount, tenor, interestRate }`
   - Outputs: `{ offerId, totalCostCredit, monthlyPayment }`

5. **Disbursement:** `services/process-engine/src/disbursement/disbursement.service.ts`
   - Wrap `initiateDisbursement()`. Step name: `disbursement`, order: 6.
   - Inputs: `{ contractId, amount, destination }`
   - Outputs: `{ disbursementId, status, externalRef }`

**Important:** Do NOT log PII in inputs/outputs. Use the `sanitize()` method. Log customer IDs (UUID) but not customer names, phones, or national IDs.

#### 4. GraphQL Query

**Modify:** `apps/graphql-server/src/graphql/resolvers/loan-request.resolver.ts`

Add a query for pipeline steps:

```typescript
@Query(() => [PipelineStepLogType])
@AuditAction(AuditActionType.READ, AuditResourceType.LOAN_REQUEST)
@Roles('loan_request:read')
async pipelineSteps(
  @CurrentTenant() tenantId: string,
  @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
): Promise<PipelineStepLogType[]> { ... }
```

**File:** `apps/graphql-server/src/graphql/types/pipeline-step-log.type.ts` (NEW)

```typescript
@ObjectType()
export class PipelineStepLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  stepName!: string;

  @Field(() => Int)
  stepOrder!: number;

  @Field()
  outcome!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  inputs?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  outputs?: Record<string, unknown>;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field({ nullable: true })
  errorCode?: string;

  @Field(() => Int)
  durationMs!: number;

  @Field({ nullable: true })
  triggeredBy?: string;

  @Field()
  startedAt!: Date;

  @Field()
  completedAt!: Date;
}
```

#### 5. Admin Portal: Pipeline Audit Display

Include pipeline step logs in the **S18-1 application review page** (`apps/admin-portal/src/app/(portal)/loans/applications/[id]/page.tsx`). Display as a vertical timeline showing each step with:
- Step name with icon
- Outcome badge (green=success, red=error, yellow=rejected, grey=skipped)
- Duration in milliseconds
- Expandable inputs/outputs JSON
- Error message if applicable

#### 6. Tests

**File:** `services/process-engine/src/pipeline/pipeline-step-logger.service.spec.ts` (NEW)

- Test `logStep()` creates record correctly
- Test `executeAndLog()` logs success with timing
- Test `executeAndLog()` logs error when function throws
- Test PII sanitization strips sensitive fields
- Test nested PII sanitization
- Test `getStepsForLoanRequest()` returns ordered steps

**File:** `services/process-engine/src/__tests__/pipeline-audit.integration.spec.ts` (NEW)

- Integration test: full loan request pipeline creates step logs for each step
- Test that all 5-6 pipeline steps produce logs
- Test total pipeline duration is sum of individual step durations (approximately)

---

### S18-8: Disbursement Failure Rolls Back Contract to CANCELLED (3 SP)

**Requirement:** FR-DB-002.3 (BA Gap)
**Problem:** When disbursement fails permanently (after all retries exhausted) in `services/process-engine/src/disbursement/disbursement.service.ts` (lines 162-179), the contract remains in whatever status it was in. It should be rolled back to `cancelled` so it does not appear as an active contract.

#### 1. Modify Disbursement Service

**Modify:** `services/process-engine/src/disbursement/disbursement.service.ts`

In the permanent failure block (after `newRetryCount >= MAX_RETRIES`, around line 162), add contract rollback:

```typescript
// Permanent failure — roll back contract
if (newRetryCount >= MAX_RETRIES) {
  if (loanRequestId) {
    await this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.disbursement_failed);
  }

  // --- NEW: Roll back contract to cancelled ---
  await this.prisma.contract.update({
    where: { id: contractId },
    data: {
      status: 'cancelled',
      metadata: {
        ...(existingMetadata || {}),
        cancellationReason: 'disbursement_failed',
        cancellationDetails: {
          disbursementId,
          failureReason: result.failureReason || 'Max retries exceeded',
          retryCount: newRetryCount,
          cancelledAt: new Date().toISOString(),
        },
      },
    },
  });

  this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
    contractId,
    previousStatus: 'active',
    newStatus: 'cancelled',
    reason: 'disbursement_failed',
  });
  // --- END NEW ---

  this.eventBus.emitAndBuild(EventType.DISBURSEMENT_FAILED, tenantId, {
    disbursementId,
    contractId,
    reason: result.failureReason || 'Max retries exceeded',
    retryCount: newRetryCount,
    contractRolledBack: true, // NEW field
  });

  return this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
}
```

**Important considerations:**
- Only roll back if the contract has not been partially disbursed (check `contract.status` is not already `performing`)
- If the contract was created specifically for this disbursement and no money has left the system, `cancelled` is the correct target state
- The subscription's `availableLimit` should be restored (for overdraft/revolving products)
- Log the rollback with full details for audit

#### 2. Restore Available Limit

If the contract is linked to a subscription (overdraft/revolving), restore the credit limit:

```typescript
// Restore available limit if subscription-linked
if (contract.subscriptionId) {
  const subscription = await this.prisma.subscription.findUnique({
    where: { id: contract.subscriptionId },
  });
  if (subscription) {
    const restoredLimit = add(String(subscription.availableLimit), String(contract.principalAmount));
    await this.prisma.subscription.update({
      where: { id: contract.subscriptionId },
      data: { availableLimit: restoredLimit },
    });
  }
}
```

#### 3. Tests

**Modify:** `services/process-engine/src/disbursement/disbursement.service.spec.ts`

Add test cases:
- Test permanent failure sets contract status to `cancelled`
- Test permanent failure emits `CONTRACT_STATE_CHANGED` event with `cancelled` status
- Test permanent failure restores subscription `availableLimit` for revolving products
- Test partial disbursement (if any money transferred) does NOT roll back to cancelled
- Test contract metadata contains cancellation details
- Test `contractRolledBack: true` in disbursement failed event

---

### S18-12: Pipeline Step-Level Retry & Recovery (5 SP)

**Requirement:** FR-PE-004
**Monday ID:** 11743563989
**Problem:** FR-PE-004 requires that all pipeline steps be individually retriable without restarting the full pipeline. Currently, only disbursement has retry logic (`MAX_RETRIES = 3` at `services/process-engine/src/disbursement/disbursement.service.ts` line 12), and that retry is immediate recursive (synchronous, no backoff, no delay). No other pipeline step (pre-qualification, scoring, approval, offer generation, contract creation) has retry capability. If scoring fails due to a transient external-service error, the entire loan request must be re-submitted from scratch. This item also replaces the disbursement retry with a proper BullMQ delayed-job pattern consistent with the rest of the platform.

**Depends on:** S18-7 (pipeline audit trail) — retry attempts must be recorded in `pipeline_step_logs`.

#### 1. Pipeline Step Registry

**File:** `services/process-engine/src/pipeline/pipeline-step-registry.ts` (NEW)

Define a central registry of all pipeline steps with their retry configuration:

```typescript
export enum PipelineStep {
  PRE_QUALIFICATION = 'pre_qualification',
  SCORING = 'scoring',
  APPROVAL = 'approval',
  OFFER_GENERATION = 'offer_generation',
  CONTRACT_CREATION = 'contract_creation',
  DISBURSEMENT = 'disbursement',
}

export interface PipelineStepConfig {
  step: PipelineStep;
  order: number;
  maxRetries: number;
  initialDelayMs: number;     // first retry delay
  maxDelayMs: number;         // cap for exponential backoff
  backoffMultiplier: number;  // exponential factor
  retryableErrors: string[];  // error codes that are retriable (transient)
  nonRetryableErrors: string[]; // error codes that must NOT retry (permanent)
}

export const PIPELINE_STEP_CONFIGS: Record<PipelineStep, PipelineStepConfig> = {
  [PipelineStep.PRE_QUALIFICATION]: {
    step: PipelineStep.PRE_QUALIFICATION,
    order: 1,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['VALIDATION_FAILED', 'PRODUCT_NOT_FOUND'],
  },
  [PipelineStep.SCORING]: {
    step: PipelineStep.SCORING,
    order: 2,
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['SCORING_SERVICE_UNAVAILABLE', 'SCORING_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['INVALID_SCORING_INPUT', 'SCORECARD_NOT_FOUND'],
  },
  [PipelineStep.APPROVAL]: {
    step: PipelineStep.APPROVAL,
    order: 3,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['ALREADY_DECIDED', 'LIMIT_EXCEEDED'],
  },
  [PipelineStep.OFFER_GENERATION]: {
    step: PipelineStep.OFFER_GENERATION,
    order: 4,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['INVALID_TERMS', 'PRODUCT_DISABLED'],
  },
  [PipelineStep.CONTRACT_CREATION]: {
    step: PipelineStep.CONTRACT_CREATION,
    order: 5,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['DUPLICATE_CONTRACT', 'OFFER_EXPIRED'],
  },
  [PipelineStep.DISBURSEMENT]: {
    step: PipelineStep.DISBURSEMENT,
    order: 6,
    maxRetries: 3,  // matches existing MAX_RETRIES
    initialDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    retryableErrors: ['WALLET_TIMEOUT', 'WALLET_UNAVAILABLE', 'INSUFFICIENT_FLOAT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['INVALID_ACCOUNT', 'SCREENING_FAILED', 'WALLET_REJECTED'],
  },
};
```

#### 2. Pipeline Retry Service

**File:** `services/process-engine/src/pipeline/pipeline-retry.service.ts` (NEW)

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const PIPELINE_RETRY_QUEUE = 'pipeline-step-retry';

@Injectable()
export class PipelineRetryService {
  constructor(
    @InjectQueue(PIPELINE_RETRY_QUEUE) private retryQueue: Queue,
    private readonly pipelineStepLogger: PipelineStepLoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Determine if a failed step should be retried based on its config and error type.
   * If retriable, enqueue a delayed retry job via BullMQ.
   * If not, mark the step as permanently failed.
   */
  async handleStepFailure(
    tenantId: string,
    loanRequestId: string,
    step: PipelineStep,
    error: { code: string; message: string },
    currentAttempt: number,
  ): Promise<{ willRetry: boolean; nextAttemptAt?: Date }> {
    const config = PIPELINE_STEP_CONFIGS[step];

    // Check if error is permanently non-retriable
    if (config.nonRetryableErrors.includes(error.code)) {
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: step,
        stepOrder: config.order,
        outcome: 'permanent_failure',
        errorMessage: error.message,
        errorCode: error.code,
        durationMs: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      return { willRetry: false };
    }

    // Check if max retries exceeded
    if (currentAttempt >= config.maxRetries) {
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: step,
        stepOrder: config.order,
        outcome: 'max_retries_exceeded',
        errorMessage: `${error.message} (attempt ${currentAttempt}/${config.maxRetries})`,
        errorCode: error.code,
        durationMs: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      return { willRetry: false };
    }

    // Calculate delay with exponential backoff + jitter
    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, currentAttempt),
      config.maxDelayMs,
    );
    const jitter = Math.floor(Math.random() * delay * 0.1); // 10% jitter
    const actualDelay = delay + jitter;

    const nextAttemptAt = new Date(Date.now() + actualDelay);

    // Enqueue retry job
    await this.retryQueue.add(
      `retry-${step}`,
      {
        tenantId,
        loanRequestId,
        step,
        attempt: currentAttempt + 1,
        maxRetries: config.maxRetries,
        errorCode: error.code,
        errorMessage: error.message,
      },
      {
        delay: actualDelay,
        attempts: 1, // BullMQ-level — we manage retries ourselves
        jobId: `${loanRequestId}-${step}-attempt-${currentAttempt + 1}`, // idempotent
        removeOnComplete: { age: 86400 }, // keep for 24h
        removeOnFail: { age: 604800 },    // keep failures for 7 days
      },
    );

    return { willRetry: true, nextAttemptAt };
  }

  /**
   * Cancel any pending retry jobs for a loan request (e.g., when manually cancelled).
   */
  async cancelPendingRetries(loanRequestId: string): Promise<number> {
    const jobs = await this.retryQueue.getDelayed();
    let cancelled = 0;
    for (const job of jobs) {
      if (job.data.loanRequestId === loanRequestId) {
        await job.remove();
        cancelled++;
      }
    }
    return cancelled;
  }
}
```

#### 3. Pipeline Retry Worker

**File:** `services/process-engine/src/pipeline/pipeline-retry.worker.ts` (NEW)

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('pipeline-step-retry')
export class PipelineRetryWorker extends WorkerHost {
  constructor(
    private readonly preQualificationService: PreQualificationService,
    private readonly scoringService: ScoringService,
    private readonly approvalService: ApprovalService,
    private readonly offerService: OfferService,
    private readonly contractService: ContractService,
    private readonly disbursementService: DisbursementService,
    private readonly pipelineRetryService: PipelineRetryService,
    private readonly pipelineStepLogger: PipelineStepLoggerService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { tenantId, loanRequestId, step, attempt } = job.data;

    // Verify loan request is still in a retriable state
    const loanRequest = await this.prisma.loanRequest.findUnique({
      where: { id: loanRequestId },
    });
    if (!loanRequest || ['cancelled', 'rejected', 'disbursed'].includes(loanRequest.status)) {
      return; // loan request no longer in a state where retry makes sense
    }

    const startedAt = new Date();
    try {
      await this.executeStep(tenantId, loanRequestId, step);

      // Log successful retry
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: `${step}_retry`,
        stepOrder: PIPELINE_STEP_CONFIGS[step].order,
        outcome: 'success',
        inputs: { attempt, retriedFrom: job.data.errorCode },
        durationMs: Date.now() - startedAt.getTime(),
        startedAt,
        completedAt: new Date(),
      });
    } catch (error) {
      // Retry failed — feed back into handleStepFailure for next retry or permanent failure
      await this.pipelineRetryService.handleStepFailure(
        tenantId,
        loanRequestId,
        step as PipelineStep,
        { code: error.code || 'UNKNOWN', message: error.message },
        attempt,
      );
    }
  }

  private async executeStep(tenantId: string, loanRequestId: string, step: string): Promise<void> {
    switch (step) {
      case PipelineStep.PRE_QUALIFICATION:
        await this.preQualificationService.preQualify(tenantId, loanRequestId);
        break;
      case PipelineStep.SCORING:
        await this.scoringService.scoreCustomer(tenantId, loanRequestId);
        break;
      case PipelineStep.APPROVAL:
        await this.approvalService.makeDecision(tenantId, loanRequestId);
        break;
      case PipelineStep.OFFER_GENERATION:
        await this.offerService.generateOffer(tenantId, loanRequestId);
        break;
      case PipelineStep.CONTRACT_CREATION:
        await this.contractService.createContract(tenantId, loanRequestId);
        break;
      case PipelineStep.DISBURSEMENT:
        const loanRequest = await this.prisma.loanRequest.findUniqueOrThrow({
          where: { id: loanRequestId },
          include: { contract: true },
        });
        if (loanRequest.contract) {
          await this.disbursementService.initiateDisbursement(tenantId, loanRequest.contract.id);
        }
        break;
      default:
        throw new Error(`Unknown pipeline step: ${step}`);
    }
  }
}
```

#### 4. Modify Disbursement Service — Replace Recursive Retry

**Modify:** `services/process-engine/src/disbursement/disbursement.service.ts`

Replace the existing recursive retry in `attemptTransfer()` with the new `PipelineRetryService`:

**Before (current):**
```typescript
// recursive retry — remove this
if (newRetryCount < MAX_RETRIES) {
  return this.attemptTransfer(tenantId, disbursementId, contractId, loanRequestId);
}
```

**After:**
```typescript
// Delegate retry to PipelineRetryService (BullMQ delayed job with backoff)
if (newRetryCount < MAX_RETRIES) {
  const { willRetry, nextAttemptAt } = await this.pipelineRetryService.handleStepFailure(
    tenantId,
    loanRequestId,
    PipelineStep.DISBURSEMENT,
    { code: result.errorCode || 'WALLET_ERROR', message: result.failureReason || 'Transfer failed' },
    newRetryCount,
  );

  if (willRetry) {
    this.logger.warn(
      `Disbursement ${disbursementId} retry ${newRetryCount + 1} scheduled for ${nextAttemptAt?.toISOString()}`,
    );
    return this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
  }
}
```

Inject `PipelineRetryService` into `DisbursementService` constructor. Remove the `MAX_RETRIES` const — it is now defined in `PIPELINE_STEP_CONFIGS`.

#### 5. Integrate Retry with Other Pipeline Steps

Each pipeline step service needs a try/catch wrapper that delegates failures to `PipelineRetryService`. The preferred pattern is to wrap calls using `PipelineStepLoggerService.executeAndLog()` (from S18-7) and add retry on failure:

**Example — modify `services/process-engine/src/scoring/scoring.service.ts`:**

```typescript
async scoreCustomer(tenantId: string, loanRequestId: string): Promise<ScoringResult> {
  try {
    return await this.pipelineStepLogger.executeAndLog(
      tenantId,
      loanRequestId,
      PipelineStep.SCORING,
      PIPELINE_STEP_CONFIGS[PipelineStep.SCORING].order,
      { loanRequestId },
      () => this.performScoring(tenantId, loanRequestId),
    );
  } catch (error) {
    // Check if this was already a retry attempt
    const retryCount = await this.getRetryCount(tenantId, loanRequestId, PipelineStep.SCORING);

    await this.pipelineRetryService.handleStepFailure(
      tenantId,
      loanRequestId,
      PipelineStep.SCORING,
      { code: error.code || 'SCORING_ERROR', message: error.message },
      retryCount,
    );

    throw error; // re-throw so caller knows the step failed (loan request stays in current state)
  }
}

private async getRetryCount(tenantId: string, loanRequestId: string, step: PipelineStep): Promise<number> {
  const logs = await this.pipelineStepLogger.getStepsForLoanRequest(tenantId, loanRequestId);
  return logs.filter((l) => l.stepName.startsWith(step) && l.outcome !== 'success').length;
}
```

Apply the same pattern to:
- `pre-qualification.service.ts` → `preQualify()`
- `approval.service.ts` → `makeDecision()`
- `offer/offer.service.ts` → offer generation method
- `contract/contract.service.ts` → contract creation method

#### 6. BullMQ Queue Registration

**Modify:** `services/process-engine/src/process-engine.module.ts`

```typescript
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'pipeline-step-retry' }),
    // ... existing imports
  ],
  providers: [
    PipelineRetryService,
    PipelineRetryWorker,
    // ... existing providers
  ],
})
export class ProcessEngineModule {}
```

#### 7. Admin Portal: Retry Status in Pipeline Audit Trail

**Context:** S18-7 adds a pipeline step audit trail to the loan application detail page. S18-12 extends this to show retry status.

In the pipeline steps timeline (from S18-7), add for failed-and-retrying steps:
- Retry indicator: "Retry 2/3 scheduled" with countdown to next attempt
- Retry history: expandable section showing each attempt's timestamp, error code, and delay
- Manual retry button: for steps that have exhausted retries but where the operator wants to force one more attempt (calls `handleStepFailure` with `currentAttempt` reset, requires `loan_request:retry` permission)

**GraphQL query extension (add to S18-7's step log type):**

```graphql
type PipelineStepLog {
  # ... existing fields from S18-7 ...
  retryAttempt: Int
  nextRetryAt: DateTime
  retryHistory: [RetryAttemptType]
}

type RetryAttemptType {
  attempt: Int!
  scheduledAt: DateTime!
  executedAt: DateTime
  outcome: String! # success | failed | pending
  errorCode: String
  delayMs: Int!
}
```

#### 8. Events

Add to `packages/event-contracts/src/events.enum.ts`:

```typescript
PIPELINE_STEP_RETRY_SCHEDULED = 'pipeline.step.retry_scheduled',
PIPELINE_STEP_RETRY_EXHAUSTED = 'pipeline.step.retry_exhausted',
```

Emit `PIPELINE_STEP_RETRY_SCHEDULED` from `PipelineRetryService.handleStepFailure()` when `willRetry: true`.
Emit `PIPELINE_STEP_RETRY_EXHAUSTED` when max retries exceeded — consumers can trigger alerts or escalation.

#### 9. Tests

**File:** `services/process-engine/src/pipeline/pipeline-retry.service.spec.ts` (NEW)

- Test retriable error with attempt < maxRetries enqueues delayed BullMQ job
- Test non-retriable error does not enqueue retry
- Test max retries exceeded does not enqueue retry, logs `max_retries_exceeded`
- Test exponential backoff delay calculation (attempt 0 → 5s, attempt 1 → 10s, attempt 2 → 20s, capped at 60s for disbursement)
- Test jitter is applied (delay has variance)
- Test idempotent job ID prevents duplicate retries for same attempt
- Test `cancelPendingRetries` removes all delayed jobs for a loan request

**File:** `services/process-engine/src/pipeline/pipeline-retry.worker.spec.ts` (NEW)

- Test worker executes correct service method for each `PipelineStep`
- Test worker skips retry if loan request is in terminal state (cancelled, rejected, disbursed)
- Test worker logs successful retry in pipeline step logs
- Test worker feeds failure back to `handleStepFailure` for next attempt
- Test worker handles unknown step gracefully

**File:** `services/process-engine/src/disbursement/disbursement.service.spec.ts` (MODIFY existing)

- Test disbursement failure delegates to `PipelineRetryService` instead of recursing
- Test disbursement no longer calls `attemptTransfer` recursively
- Test retry scheduling returns disbursement record with `status: 'pending_retry'`

**File:** `services/process-engine/src/__tests__/pipeline-retry.integration.spec.ts` (NEW)

- Integration test: scoring service failure triggers BullMQ delayed job
- Integration test: delayed job executes scoring retry successfully
- Integration test: 3 consecutive failures exhaust retries and emit `PIPELINE_STEP_RETRY_EXHAUSTED`
- Integration test: manual cancellation of loan request cancels pending retry jobs

---

## Track C: Post-Processing (12 SP)

### S18-9: Revenue Distribution — Tiered/Fixed/Waterfall Models (8 SP)

**Requirement:** FR-RS-001.2 (BA Gap)
**Problem:** The settlement service (`services/settlement-service/src/settlement.service.ts`) only supports percentage-split revenue distribution (lines 47-100). The platform needs tiered (volume-based rates), fixed-fee, and waterfall (sequential deductions) models to accommodate diverse SP commercial arrangements.

#### 1. Prisma Model

**Add to `packages/database/prisma/schema.prisma`:**

```prisma
enum RevenueDistributionModel {
  percentage_split    // existing: simple % of revenue to each party
  tiered              // volume-based: rate changes based on disbursement volume
  fixed_fee           // fixed amount per period, remainder to SP
  waterfall           // sequential deductions: party A first, then party B from remainder

  @@map("revenue_distribution_model")
}

model RevenueDistributionConfig {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  productId           String?  @map("product_id") @db.Uuid // null = tenant-wide default
  /** Which distribution model to use */
  model               RevenueDistributionModel
  /** Model-specific configuration (see docs below) */
  config              Json
  /** Priority order for applying multiple configs (lower = first) */
  priority            Int      @default(0)
  /** Active flag */
  isActive            Boolean  @default(true) @map("is_active")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt           DateTime? @map("deleted_at") @db.Timestamptz(6)

  product Product? @relation(fields: [productId], references: [id])

  @@index([tenantId])
  @@index([tenantId, productId])
  @@map("revenue_distribution_configs")
}
```

Add `revenueDistributionConfigs RevenueDistributionConfig[]` to the `Product` model.

**Migration** with RLS policy.

**Config shapes by model:**

Percentage split (existing behavior — stored as config for uniformity):
```json
{
  "parties": [
    { "partyType": "platform", "partyId": "lons-platform", "percentage": "5.0000" },
    { "partyType": "sp", "partyId": "<tenantId>", "percentage": "75.0000" },
    { "partyType": "lender", "partyId": "<lenderId>", "percentage": "20.0000" }
  ]
}
```

Tiered (volume-based):
```json
{
  "basedOn": "monthly_disbursement_volume", // or "monthly_revenue", "transaction_count"
  "tiers": [
    { "upTo": "500000.0000", "platformPercentage": "8.0000" },
    { "upTo": "2000000.0000", "platformPercentage": "5.0000" },
    { "upTo": null, "platformPercentage": "3.0000" }
  ],
  "parties": [
    { "partyType": "platform", "partyId": "lons-platform", "source": "tiered" },
    { "partyType": "sp", "partyId": "<tenantId>", "source": "remainder" }
  ]
}
```

Fixed fee:
```json
{
  "fixedFees": [
    { "partyType": "platform", "partyId": "lons-platform", "amount": "5000.0000", "currency": "GHS" },
    { "partyType": "lender", "partyId": "<lenderId>", "amount": "2000.0000", "currency": "GHS" }
  ],
  "remainderParty": { "partyType": "sp", "partyId": "<tenantId>" }
}
```

Waterfall (sequential deductions):
```json
{
  "waterfall": [
    { "partyType": "platform", "partyId": "lons-platform", "deduction": { "type": "percentage", "value": "5.0000" } },
    { "partyType": "lender", "partyId": "<lenderId>", "deduction": { "type": "fixed", "value": "1000.0000" } },
    { "partyType": "sp", "partyId": "<tenantId>", "deduction": { "type": "remainder" } }
  ]
}
```

#### 2. Revenue Distribution Engine

**File:** `services/settlement-service/src/revenue-distribution/revenue-distribution.engine.ts` (NEW)

```typescript
@Injectable()
export class RevenueDistributionEngine {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate revenue distribution for a settlement period.
   * Loads the config for the tenant/product and applies the appropriate model.
   */
  async calculateDistribution(
    tenantId: string,
    productId: string | null,
    totalRevenue: string,
    context: {
      periodStart: Date;
      periodEnd: Date;
      monthlyDisbursementVolume?: string;
      transactionCount?: number;
    },
  ): Promise<DistributionLine[]> {
    const config = await this.getEffectiveConfig(tenantId, productId);

    switch (config.model) {
      case 'percentage_split':
        return this.calculatePercentageSplit(totalRevenue, config.config);
      case 'tiered':
        return this.calculateTiered(totalRevenue, config.config, context);
      case 'fixed_fee':
        return this.calculateFixedFee(totalRevenue, config.config);
      case 'waterfall':
        return this.calculateWaterfall(totalRevenue, config.config);
      default:
        throw new ValidationError(`Unknown distribution model: ${config.model}`);
    }
  }

  /**
   * Get the effective config: product-specific -> tenant default -> legacy platformFeePercent
   */
  private async getEffectiveConfig(
    tenantId: string,
    productId: string | null,
  ): Promise<RevenueDistributionConfig> {
    // 1. Product-specific config
    if (productId) {
      const productConfig = await this.prisma.revenueDistributionConfig.findFirst({
        where: { tenantId, productId, isActive: true, deletedAt: null },
      });
      if (productConfig) return productConfig;
    }

    // 2. Tenant default (productId = null)
    const tenantDefault = await this.prisma.revenueDistributionConfig.findFirst({
      where: { tenantId, productId: null, isActive: true, deletedAt: null },
    });
    if (tenantDefault) return tenantDefault;

    // 3. Fallback to legacy percentage split using tenant.platformFeePercent
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { platformFeePercent: true },
    });
    const pct = String(tenant?.platformFeePercent ?? '0');
    return {
      model: 'percentage_split' as RevenueDistributionModel,
      config: {
        parties: [
          { partyType: 'platform', partyId: 'lons-platform', percentage: pct },
          { partyType: 'sp', partyId: tenantId, percentage: subtract('100', pct) },
        ],
      },
    } as unknown as RevenueDistributionConfig;
  }

  private calculatePercentageSplit(
    totalRevenue: string,
    config: { parties: { partyType: string; partyId: string; percentage: string }[] },
  ): DistributionLine[] {
    return config.parties.map(party => ({
      partyType: party.partyType,
      partyId: party.partyId,
      grossRevenue: totalRevenue,
      sharePercentage: party.percentage,
      shareAmount: bankersRound(percentage(totalRevenue, party.percentage), 4),
    }));
  }

  private calculateTiered(
    totalRevenue: string,
    config: { tiers: { upTo: string | null; platformPercentage: string }[]; parties: unknown[] },
    context: { monthlyDisbursementVolume?: string },
  ): DistributionLine[] {
    const volume = context.monthlyDisbursementVolume ?? '0';

    // Find applicable tier
    const sortedTiers = [...config.tiers].sort((a, b) => {
      if (a.upTo === null) return 1;
      if (b.upTo === null) return -1;
      return Number(a.upTo) - Number(b.upTo);
    });

    let applicableRate = sortedTiers[sortedTiers.length - 1].platformPercentage; // default to last tier
    for (const tier of sortedTiers) {
      if (tier.upTo === null || compare(volume, tier.upTo) <= 0) {
        applicableRate = tier.platformPercentage;
        break;
      }
    }

    const platformAmount = bankersRound(percentage(totalRevenue, applicableRate), 4);
    const spAmount = subtract(totalRevenue, platformAmount);

    return [
      {
        partyType: 'platform',
        partyId: 'lons-platform',
        grossRevenue: totalRevenue,
        sharePercentage: applicableRate,
        shareAmount: platformAmount,
      },
      {
        partyType: 'sp',
        partyId: 'remainder',
        grossRevenue: totalRevenue,
        sharePercentage: subtract('100', applicableRate),
        shareAmount: spAmount,
      },
    ];
  }

  private calculateFixedFee(
    totalRevenue: string,
    config: {
      fixedFees: { partyType: string; partyId: string; amount: string }[];
      remainderParty: { partyType: string; partyId: string };
    },
  ): DistributionLine[] {
    const lines: DistributionLine[] = [];
    let totalDeducted = '0';

    for (const fee of config.fixedFees) {
      // Cap at available revenue
      const deduction = compare(fee.amount, subtract(totalRevenue, totalDeducted)) <= 0
        ? fee.amount
        : subtract(totalRevenue, totalDeducted);

      lines.push({
        partyType: fee.partyType,
        partyId: fee.partyId,
        grossRevenue: totalRevenue,
        sharePercentage: '0', // N/A for fixed
        shareAmount: deduction,
      });
      totalDeducted = add(totalDeducted, deduction);
    }

    // Remainder to designated party
    const remainder = subtract(totalRevenue, totalDeducted);
    lines.push({
      partyType: config.remainderParty.partyType,
      partyId: config.remainderParty.partyId,
      grossRevenue: totalRevenue,
      sharePercentage: '0',
      shareAmount: compare(remainder, '0') >= 0 ? remainder : '0',
    });

    return lines;
  }

  private calculateWaterfall(
    totalRevenue: string,
    config: {
      waterfall: {
        partyType: string;
        partyId: string;
        deduction: { type: 'percentage' | 'fixed' | 'remainder'; value?: string };
      }[];
    },
  ): DistributionLine[] {
    const lines: DistributionLine[] = [];
    let remaining = totalRevenue;

    for (const step of config.waterfall) {
      let amount: string;

      switch (step.deduction.type) {
        case 'percentage':
          amount = bankersRound(percentage(remaining, step.deduction.value!), 4);
          break;
        case 'fixed':
          amount = compare(step.deduction.value!, remaining) <= 0
            ? step.deduction.value!
            : remaining;
          break;
        case 'remainder':
          amount = compare(remaining, '0') >= 0 ? remaining : '0';
          break;
        default:
          throw new ValidationError(`Unknown deduction type: ${step.deduction.type}`);
      }

      lines.push({
        partyType: step.partyType,
        partyId: step.partyId,
        grossRevenue: totalRevenue,
        sharePercentage: step.deduction.type === 'percentage' ? step.deduction.value! : '0',
        shareAmount: amount,
      });

      remaining = subtract(remaining, amount);
    }

    return lines;
  }
}

export interface DistributionLine {
  partyType: string;
  partyId: string;
  grossRevenue: string;
  sharePercentage: string;
  shareAmount: string;
}
```

**File:** `services/settlement-service/src/revenue-distribution/revenue-distribution.module.ts` (NEW)
**File:** `services/settlement-service/src/revenue-distribution/index.ts` (NEW)

Register in `services/settlement-service/src/settlement.module.ts`.

#### 3. Update Settlement Service

**Modify:** `services/settlement-service/src/settlement.service.ts`

Replace the hardcoded percentage-split logic (lines 44-100) with a call to the `RevenueDistributionEngine`:

```typescript
// Replace:
// const platformFeePercent = String(tenant?.platformFeePercent ?? '0');
// const platformFeeAmount = bankersRound(percentage(totalInterestRevenue, platformFeePercent), 4);
// ... manual line creation ...

// With:
const distributionLines = await this.revenueDistributionEngine.calculateDistribution(
  tenantId,
  null, // or productId if settlement is per-product
  totalRevenue,
  {
    periodStart,
    periodEnd,
    monthlyDisbursementVolume: await this.getMonthlyDisbursementVolume(tenantId, periodStart, periodEnd),
  },
);

// Create settlement lines from distribution
for (const line of distributionLines) {
  lines.push({
    tenantId,
    settlementRunId: settlementRun.id,
    partyType: line.partyType,
    partyId: line.partyId,
    grossRevenue: line.grossRevenue,
    sharePercentage: line.sharePercentage,
    shareAmount: line.shareAmount,
    deductions: '0',
    netAmount: line.shareAmount,
  });
}
```

Add a helper method to calculate monthly disbursement volume (needed for tiered model):

```typescript
private async getMonthlyDisbursementVolume(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<string> {
  const result = await this.prisma.disbursement.aggregate({
    where: {
      tenantId,
      status: 'completed',
      completedAt: { gte: periodStart, lte: periodEnd },
    },
    _sum: { amount: true },
  });
  return result._sum?.amount?.toString() ?? '0';
}
```

#### 4. GraphQL Mutations for Config

**File:** `apps/graphql-server/src/graphql/resolvers/revenue-distribution.resolver.ts` (NEW)

```typescript
@Resolver()
export class RevenueDistributionResolver {
  constructor(private engine: RevenueDistributionEngine) {}

  @Query(() => [RevenueDistributionConfigType])
  @Roles('settlement:read')
  async revenueDistributionConfigs(
    @CurrentTenant() tenantId: string,
    @Args('productId', { type: () => ID, nullable: true }) productId?: string,
  ): Promise<RevenueDistributionConfigType[]> { ... }

  @Mutation(() => RevenueDistributionConfigType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.SETTLEMENT)
  @Roles('settlement:update')
  async createRevenueDistributionConfig(
    @CurrentTenant() tenantId: string,
    @Args('input', { type: () => CreateRevenueDistributionConfigInput }) input: CreateRevenueDistributionConfigInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<RevenueDistributionConfigType> { ... }

  @Mutation(() => RevenueDistributionConfigType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.SETTLEMENT)
  @Roles('settlement:update')
  async updateRevenueDistributionConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input', { type: () => UpdateRevenueDistributionConfigInput }) input: UpdateRevenueDistributionConfigInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<RevenueDistributionConfigType> { ... }

  @Mutation(() => Boolean)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.SETTLEMENT)
  @Roles('settlement:update')
  async simulateRevenueDistribution(
    @CurrentTenant() tenantId: string,
    @Args('totalRevenue') totalRevenue: string,
    @Args('productId', { type: () => ID, nullable: true }) productId?: string,
  ): Promise<DistributionLineType[]> {
    // Preview what distribution would look like with given revenue amount
    // Does not create settlement — for operator verification only
  }
}
```

#### 5. Tests

**File:** `services/settlement-service/src/revenue-distribution/revenue-distribution.engine.spec.ts` (NEW)

- Test percentage split produces correct amounts
- Test tiered model selects correct tier based on volume
- Test tiered model edge cases (exact boundary values)
- Test fixed fee caps at available revenue
- Test fixed fee remainder calculation
- Test waterfall sequential deductions
- Test waterfall with percentage + fixed + remainder combo
- Test all models use banker's rounding (no float arithmetic)
- Test config fallback chain: product -> tenant -> legacy
- Test zero revenue handling for all models
- Test negative remainder scenarios (caps at 0)

---

### S18-10: Portfolio Metrics Filterable by Product, Segment, Region, Lender (4 SP)

**Requirement:** FR-DFL-002.2 (BA Gap)
**Problem:** The dashboard's `portfolioMetrics` query (`apps/admin-portal/src/app/(portal)/dashboard/page.tsx`) returns global metrics with no filtering options.

#### 1. Extend Portfolio Metrics Query

**Modify:** `apps/graphql-server/src/graphql/resolvers/report.resolver.ts`

Find the `portfolioMetrics` query and add filter arguments:

```typescript
@Query(() => PortfolioMetricsType)
@Roles('report:read')
async portfolioMetrics(
  @CurrentTenant() tenantId: string,
  @Args('filters', { type: () => PortfolioMetricsFilterInput, nullable: true }) filters?: PortfolioMetricsFilterInput,
): Promise<PortfolioMetricsType> {
  // Apply filters to all aggregation queries
  const where: Prisma.ContractWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (filters?.productId) {
    where.productId = filters.productId;
  }
  if (filters?.productType) {
    where.product = { productType: filters.productType };
  }
  if (filters?.lenderId) {
    where.lenderId = filters.lenderId;
  }
  if (filters?.region) {
    where.customer = { region: filters.region };
  }
  if (filters?.customerSegment) {
    where.customer = {
      ...where.customer as Record<string, unknown>,
      segment: filters.customerSegment,
    };
  }

  // Use the filtered `where` clause for all metric calculations
  // ...
}
```

**File:** `apps/graphql-server/src/graphql/inputs/portfolio-metrics-filter.input.ts` (NEW)

```typescript
@InputType()
export class PortfolioMetricsFilterInput {
  @Field(() => ID, { nullable: true })
  productId?: string;

  @Field({ nullable: true })
  productType?: string; // 'micro_loan', 'overdraft', 'bnpl', 'invoice_financing'

  @Field(() => ID, { nullable: true })
  lenderId?: string;

  @Field({ nullable: true })
  region?: string;

  @Field({ nullable: true })
  customerSegment?: string;

  @Field({ nullable: true })
  dateFrom?: Date;

  @Field({ nullable: true })
  dateTo?: Date;
}
```

#### 2. Verify Underlying Data

Check that the `Customer` model has `region` and `segment` columns. If not, add them:

**Modify `packages/database/prisma/schema.prisma`** (only if these fields do not exist):

```prisma
// Add to Customer model:
region    String?  @db.VarChar(100)
segment   String?  @db.VarChar(100)  // e.g. 'retail', 'sme', 'corporate'
```

**Migration** if needed.

#### 3. Admin Portal: Dashboard Filters

**Modify:** `apps/admin-portal/src/app/(portal)/dashboard/page.tsx`

Add filter controls above the metric cards:

```typescript
// Filter bar with dropdowns
<div className="flex gap-3 mb-6">
  <FilterPill
    label={t('dashboard.productType')}
    value={filters.productType}
    options={[
      { value: '', label: t('common.all') },
      { value: 'micro_loan', label: t('products.types.microLoan') },
      { value: 'overdraft', label: t('products.types.overdraft') },
      { value: 'bnpl', label: t('products.types.bnpl') },
      { value: 'invoice_financing', label: t('products.types.invoiceFinancing') },
    ]}
    onChange={(v) => setFilters(f => ({ ...f, productType: v }))}
  />
  <FilterPill
    label={t('dashboard.lender')}
    value={filters.lenderId}
    options={lenderOptions}
    onChange={(v) => setFilters(f => ({ ...f, lenderId: v }))}
  />
  <FilterPill
    label={t('dashboard.region')}
    value={filters.region}
    options={regionOptions}
    onChange={(v) => setFilters(f => ({ ...f, region: v }))}
  />
  <FilterPill
    label={t('dashboard.segment')}
    value={filters.customerSegment}
    options={segmentOptions}
    onChange={(v) => setFilters(f => ({ ...f, customerSegment: v }))}
  />
</div>
```

Pass filters to the GraphQL query:

```graphql
query PortfolioMetrics($filters: PortfolioMetricsFilterInput) {
  portfolioMetrics(filters: $filters) {
    activeLoans
    activeOutstanding
    parAt30 { count amount pct }
    nplRatio
    provisioning { total }
  }
}
```

Use the existing `FilterPill` component pattern from `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`.

Load lender options from `lenders` query (already available). Load region options from a new query or hardcode common African regions for MVP.

#### 4. Tests

- Test `portfolioMetrics` with no filters (backward compat — same result as before)
- Test filter by `productType` returns only matching contracts
- Test filter by `lenderId`
- Test filter by `region`
- Test filter by `customerSegment`
- Test combined filters (AND logic)
- Test empty result set (no contracts matching filters)

---

## Track D: Fix Items & Deferred Work (~10.5 SP)

These items carry forward from Sprint 14–17 reviews. Items F-S17-10 (EMI sync job `recordSyncSuccess/Error`), F-S17-13 (onboarding `idempotencyKey`), F-S17-14 (onboarding audit log), and F-S17-17 (`customer_matching_rules` `deleted_at`) were verified as **already fixed** in the Sprint 17 fix cycles and are excluded.

---

### S18-FIX-1: Tech Debt Cleanup Bundle (1.5 SP)

**Monday ID:** Create new item
**Source:** F-BA-S17-8/F-S17-15 + F-BA-S17-9 + pre-existing screening test

Three small fixes bundled into one item:

#### Fix A — Remove dead `repayment.completed` from FINANCIAL_PROFILE_INVALIDATION_EVENTS (0.5 SP)

**Source:** F-BA-S17-8 / F-S17-15
**File:** `services/entity-service/src/customer/customer-financial-profile.service.ts`

At line 73, the `FINANCIAL_PROFILE_INVALIDATION_EVENTS` constant includes `'repayment.completed'` (line 77), but no `@OnEvent` decorator wires this event (decorators at lines 152–156 cover: `contract.created`, `contract.state_changed`, `repayment.received`, `customer.financial_data.synced`, `customer.merged`).

**Fix options (choose one):**

1. **Remove** `'repayment.completed'` from the const — it's dead code and misleading. The existing `'repayment.received'` handler already covers the actual event emitted when repayments arrive.

2. **Wire** an `@OnEvent('repayment.completed')` decorator to `invalidateProfile()` — but only if `repayment.completed` is actually emitted anywhere. Check `packages/event-contracts/src/events.enum.ts` first. If the event type doesn't exist, option 1 is correct.

**Test:** Verify the const matches the actual `@OnEvent` decorators. Add a simple test that asserts `FINANCIAL_PROFILE_INVALIDATION_EVENTS` contains exactly the events that have `@OnEvent` handlers.

#### Fix B — Replace `console.error` with `this.logger.error()` in onboarding (0.5 SP)

**Source:** F-BA-S17-9
**File:** `services/entity-service/src/tenant/tenant-onboarding.service.ts`

At line 295, `console.error(` bypasses the structured logging pipeline. This means onboarding audit failures won't appear in centralized log aggregation, making production debugging difficult.

**Fix:**

Replace:
```typescript
console.error('Failed to write onboarding audit log:', error);
```

With:
```typescript
this.logger.error('Failed to write onboarding audit log', { error: error.message, tenantId });
```

Verify that `this.logger` is already injected (it should be — check the constructor for `private readonly logger = new Logger('TenantOnboardingService')`). If not, add it.

**Test:** Mock the logger and assert that audit log failures route through `this.logger.error()`, not `console.error`.

#### Fix C — Fix pre-existing screening test failure (0.5 SP)

**Source:** Inherited since Sprint 16
**File:** `services/integration-service/src/screening/__tests__/screening.service.spec.ts`

There is 1 pre-existing test failure in this file that has been carried across Sprints 16 and 17. The failure does not affect production functionality but violates the "all tests pass" exit criterion.

**Fix:** Investigate the failing test, determine root cause, and either:
- Fix the test assertion if it's a stale expectation
- Fix the underlying service code if the test is correct
- If the test targets functionality that was intentionally changed, update the test to match current behavior

**Exit criterion:** `services/integration-service` runs 265/265 pass (0 failures).

---

### S18-FIX-2: Wallet Adapter Full Call-Site Migration (1 SP)

**Source:** Sprint 17 FIX-3 scope-down, PM Sprint 17 Review §5.3
**Monday ID:** 11899091254
**Problem:** Sprint 17 FIX-3 completed the DI plumbing — `WalletDisbursementAdapter` is registered in the module and injectable. However, actual call-sites in the disbursement and repayment flows still use the old mock adapter directly. The full migration was deferred to Sprint 18 for a coordinated wallet-adapter pass.

**File:** `services/integration-service/src/adapters/wallet-adapter-resolver.service.ts`

The `MockWalletAdapter` is imported at line 12 and instantiated via `instantiateAdapter()` at line 46. The production guard only creates mock instances.

**Fix:**

1. **Update `wallet-adapter-resolver.service.ts`** to resolve the real `WalletDisbursementAdapter` when a tenant has wallet integration configured:

```typescript
async resolveAdapter(tenantId: string): Promise<IWalletAdapter> {
  const config = await this.getWalletConfig(tenantId);
  if (!config || config.provider === 'mock') {
    return new MockWalletAdapter();
  }
  
  // Return the real adapter based on provider
  switch (config.provider) {
    case 'mtn_momo':
      return this.mtnMomoAdapter;
    case 'mpesa':
      return this.mpesaAdapter;
    default:
      this.logger.warn(`Unknown wallet provider ${config.provider}, falling back to mock`);
      return new MockWalletAdapter();
  }
}
```

2. **Update all call-sites** in `services/process-engine/src/disbursement/disbursement.service.ts` and `services/repayment-service/src/` that reference wallet operations to go through `walletAdapterResolver.resolveAdapter(tenantId)` instead of directly instantiating `MockWalletAdapter`.

3. **Verify** that the `IWalletAdapter` interface is implemented by all real adapters (MTN MoMo, M-Pesa) and the mock.

**Tests:**
- Test that `resolveAdapter()` returns mock adapter when no config exists (backward compat)
- Test that `resolveAdapter()` returns mock adapter when `provider === 'mock'`
- Test that `resolveAdapter()` returns the correct adapter for configured providers
- Test that disbursement service uses the resolved adapter, not a hardcoded mock

---

### S14-11: Invoice Verification Queue — Admin Portal Enhancements (5 SP)

**Source:** Sprint 14 carry-forward
**Monday ID:** 11969311973
**Problem:** The invoice factoring admin portal has basic pages (`apps/admin-portal/src/app/(portal)/loans/factoring/page.tsx`, `verify-invoice-modal.tsx`, `invoice-detail-actions.tsx`, `invoice-lifecycle-timeline.tsx`) but lacks a dedicated verification queue workflow for operators who review incoming invoices.

**Note:** Partial UI exists from Sprint 12/13 factoring work. This item focuses on the **queue workflow** — the operational flow where ops staff process a queue of invoices awaiting verification.

#### 1. Invoice Verification Queue Page

**File:** `apps/admin-portal/src/app/(portal)/loans/factoring/queue/page.tsx` (NEW)

Build a queue-style page for invoice verification operators:

**Layout:**

**Queue header:**
- Queue count badge: "X invoices pending verification"
- Filter tabs: All | Pending | In Review | Flagged
- Sort: Oldest first (default), Amount descending, Due date ascending
- Bulk actions: Assign to me, Mark as priority

**Queue table:**
- Columns: Invoice #, Seller, Debtor, Amount, Currency, Due Date, Submitted At, Assigned To, Status
- Row click → opens verification slide-over (reuse existing `verify-invoice-modal.tsx`)
- Status badges: `pending_verification`, `in_review`, `verified`, `rejected`, `flagged`
- "Claim" button per row — assigns to current operator

**Verification slide-over (extend existing modal):**
- Invoice details (read-only): number, amount, currency, dates, seller, debtor
- Document viewer (if invoice document attached)
- Verification checklist:
  - [ ] Invoice amount matches supporting docs
  - [ ] Debtor details verified
  - [ ] Due date is within acceptable range
  - [ ] No duplicate invoice exists
- Decision buttons: Approve | Reject (with reason) | Flag for review
- Notes textarea for operator comments

#### 2. Backend: Invoice Queue Service

**File:** `services/process-engine/src/factoring/invoice-queue.service.ts` (NEW)

```typescript
@Injectable()
export class InvoiceQueueService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /**
   * Get invoices pending verification for the queue.
   */
  async getVerificationQueue(
    tenantId: string,
    filters?: {
      status?: string[];
      assignedTo?: string;
      sortBy?: 'createdAt' | 'amount' | 'dueDate';
      sortOrder?: 'asc' | 'desc';
    },
    pagination?: { cursor?: string; limit?: number },
  ): Promise<PaginatedResult<Invoice>> {
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      deletedAt: null,
      verificationStatus: {
        in: filters?.status ?? ['pending_verification', 'in_review', 'flagged'],
      },
    };
    if (filters?.assignedTo) {
      where.assignedVerifierId = filters.assignedTo;
    }

    return this.prisma.paginatedQuery('invoice', where, {
      orderBy: { [filters?.sortBy ?? 'createdAt']: filters?.sortOrder ?? 'asc' },
      cursor: pagination?.cursor,
      take: pagination?.limit ?? 25,
    });
  }

  /**
   * Claim an invoice for verification (assign to operator).
   */
  async claimInvoice(
    tenantId: string,
    invoiceId: string,
    operatorId: string,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.assignedVerifierId && invoice.assignedVerifierId !== operatorId) {
      throw new ValidationError('Invoice is already assigned to another operator');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        assignedVerifierId: operatorId,
        verificationStatus: 'in_review',
      },
    });
  }

  /**
   * Submit verification decision.
   */
  async submitVerification(
    tenantId: string,
    invoiceId: string,
    decision: {
      outcome: 'verified' | 'rejected' | 'flagged';
      rejectionReason?: string;
      notes?: string;
      checklist?: Record<string, boolean>;
      operatorId: string;
    },
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        verificationStatus: decision.outcome,
        verifiedAt: decision.outcome === 'verified' ? new Date() : null,
        verifiedBy: decision.operatorId,
        metadata: {
          ...(invoice.metadata as Record<string, unknown> || {}),
          verificationHistory: [
            ...((invoice.metadata as Record<string, unknown>)?.verificationHistory as unknown[] || []),
            {
              outcome: decision.outcome,
              reason: decision.rejectionReason,
              notes: decision.notes,
              checklist: decision.checklist,
              operatorId: decision.operatorId,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });

    this.eventBus.emitAndBuild(
      decision.outcome === 'verified'
        ? EventType.INVOICE_VERIFIED
        : EventType.INVOICE_VERIFICATION_FAILED,
      tenantId,
      {
        invoiceId,
        outcome: decision.outcome,
        operatorId: decision.operatorId,
      },
    );

    return updated;
  }
}
```

Register in the factoring module.

#### 3. Schema Updates

Check if the `Invoice` model has these fields. If not, add them:

```prisma
// Add to Invoice model if missing:
verificationStatus  String?   @map("verification_status") @db.VarChar(50) @default("pending_verification")
assignedVerifierId  String?   @map("assigned_verifier_id") @db.Uuid
verifiedAt          DateTime? @map("verified_at") @db.Timestamptz(6)
verifiedBy          String?   @map("verified_by") @db.Uuid
```

Add migration if schema changes are needed.

#### 4. GraphQL Resolvers

**File:** `apps/graphql-server/src/graphql/resolvers/invoice-queue.resolver.ts` (NEW)

Add queries and mutations for:
- `invoiceVerificationQueue(filters, pagination)` → returns paginated queue
- `claimInvoice(invoiceId)` → assigns to current operator
- `submitInvoiceVerification(invoiceId, decision)` → records decision

#### 5. Event Types

Add to `packages/event-contracts/src/events.enum.ts` if not already present:
```typescript
INVOICE_VERIFIED = 'invoice.verified',
INVOICE_VERIFICATION_FAILED = 'invoice.verification_failed',
```

#### 6. Navigation

Add "Verification Queue" as a sub-item under the Factoring section in the admin portal sidebar. Show the pending count as a badge.

#### 7. Tests

**File:** `services/process-engine/src/factoring/invoice-queue.service.spec.ts` (NEW)

- Test queue returns only pending/in-review/flagged invoices
- Test claiming assigns operator and sets status to in_review
- Test claiming already-assigned invoice throws
- Test verification updates status and records history
- Test verified outcome emits INVOICE_VERIFIED event
- Test rejected outcome emits INVOICE_VERIFICATION_FAILED event
- Test pagination and sorting

---

### S18-ENH: Billing Usage History Query + nextBillingDate + estimatedFees (3 SP)

**Source:** Sprint 14 commercial model implementation gap
**Monday ID:** 11975260654
**Problem:** The billing module (implemented in Sprint 14) tracks subscription billing but does not expose usage history, next billing date, or estimated fees through the API. Tenants and platform operators need visibility into billing lifecycle.

#### 1. GraphQL Query

**Modify:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`

Add a `usageHistory` query:

```typescript
@Query(() => UsageHistoryType)
@Roles('billing:read')
async usageHistory(
  @CurrentTenant() tenantId: string,
  @Args('subscriptionId', { type: () => ID, nullable: true }) subscriptionId?: string,
  @Args('dateFrom', { nullable: true }) dateFrom?: Date,
  @Args('dateTo', { nullable: true }) dateTo?: Date,
): Promise<UsageHistoryType> {
  // 1. Get billing records for the period
  const billingRecords = await this.billingService.getBillingHistory(tenantId, {
    subscriptionId,
    dateFrom,
    dateTo,
  });

  // 2. Calculate next billing date from the active billing plan
  const activePlan = await this.billingService.getActivePlan(tenantId);
  const nextBillingDate = this.billingService.calculateNextBillingDate(activePlan);

  // 3. Estimate fees for the current period based on usage so far
  const estimatedFees = await this.billingService.estimateCurrentPeriodFees(tenantId);

  return {
    records: billingRecords,
    nextBillingDate,
    estimatedFees,
    currentPlan: activePlan,
  };
}
```

#### 2. Billing Service Extensions

**Modify:** `services/entity-service/src/billing/billing.service.ts` (or wherever the billing service lives)

Add these methods:

```typescript
/**
 * Get billing history for a tenant, optionally filtered by subscription and date range.
 */
async getBillingHistory(
  tenantId: string,
  filters: { subscriptionId?: string; dateFrom?: Date; dateTo?: Date },
): Promise<BillingRecord[]> {
  const where: Prisma.BillingRecordWhereInput = { tenantId };
  if (filters.subscriptionId) where.subscriptionId = filters.subscriptionId;
  if (filters.dateFrom || filters.dateTo) {
    where.billingDate = {};
    if (filters.dateFrom) where.billingDate.gte = filters.dateFrom;
    if (filters.dateTo) where.billingDate.lte = filters.dateTo;
  }
  return this.prisma.billingRecord.findMany({
    where,
    orderBy: { billingDate: 'desc' },
  });
}

/**
 * Calculate the next billing date based on the active plan's billing cycle.
 */
calculateNextBillingDate(plan: BillingPlan | null): Date | null {
  if (!plan || !plan.isActive) return null;
  const lastBillingDate = plan.lastBilledAt ?? plan.createdAt;
  switch (plan.billingCycle) {
    case 'monthly': return addMonths(lastBillingDate, 1);
    case 'quarterly': return addMonths(lastBillingDate, 3);
    case 'annually': return addMonths(lastBillingDate, 12);
    default: return null;
  }
}

/**
 * Estimate fees for the current billing period based on usage so far.
 * Sums: base subscription fee + per-disbursement fees accrued this period.
 */
async estimateCurrentPeriodFees(tenantId: string): Promise<EstimatedFees> {
  const plan = await this.getActivePlan(tenantId);
  if (!plan) return { baseFee: '0', transactionFees: '0', totalEstimated: '0', currency: 'GHS' };

  const periodStart = plan.lastBilledAt ?? plan.createdAt;
  const baseFee = String(plan.baseFee ?? '0');

  // Count disbursements in current period
  const disbursementCount = await this.prisma.disbursement.count({
    where: {
      tenantId,
      status: 'completed',
      completedAt: { gte: periodStart },
    },
  });

  const perDisbursementFee = String(plan.perDisbursementFee ?? '0');
  const transactionFees = multiply(perDisbursementFee, String(disbursementCount));
  const totalEstimated = add(baseFee, transactionFees);

  return {
    baseFee,
    transactionFees,
    totalEstimated,
    currency: plan.currency ?? 'GHS',
    disbursementCount,
    periodStart,
    periodEnd: this.calculateNextBillingDate(plan),
  };
}
```

#### 3. GraphQL Types

**File:** `apps/graphql-server/src/graphql/types/usage-history.type.ts` (NEW)

```typescript
@ObjectType()
export class UsageHistoryType {
  @Field(() => [BillingRecordType])
  records!: BillingRecordType[];

  @Field({ nullable: true })
  nextBillingDate?: Date;

  @Field(() => EstimatedFeesType)
  estimatedFees!: EstimatedFeesType;

  @Field(() => BillingPlanType, { nullable: true })
  currentPlan?: BillingPlanType;
}

@ObjectType()
export class EstimatedFeesType {
  @Field()
  baseFee!: string;

  @Field()
  transactionFees!: string;

  @Field()
  totalEstimated!: string;

  @Field()
  currency!: string;

  @Field(() => Int, { nullable: true })
  disbursementCount?: number;

  @Field({ nullable: true })
  periodStart?: Date;

  @Field({ nullable: true })
  periodEnd?: Date;
}
```

#### 4. Admin Portal: Billing Page Enhancement

**Modify:** `apps/admin-portal/src/app/(portal)/settings/billing/page.tsx` (if exists, otherwise create)

Add sections showing:
- Current plan tier and billing cycle
- Next billing date with countdown
- Estimated fees for current period (base + transaction fees breakdown)
- Usage history table: date, type (base fee / transaction fee / adjustment), amount, status (paid / pending / overdue)

#### 5. Tests

**File:** `services/entity-service/src/billing/billing.service.spec.ts` (extend or create)

- Test `getBillingHistory` with date range filters
- Test `calculateNextBillingDate` for monthly/quarterly/annually cycles
- Test `estimateCurrentPeriodFees` sums base + transaction fees correctly
- Test estimated fees use Decimal math (no floats)
- Test empty period returns zero estimates

---

## Dependency Graph

```
S18-6 (approval limits) ──> S18-1 (review workflow)
S18-7 (pipeline audit trail) ──> S18-12 (pipeline retry & recovery)

S18-2 (contract write ops) ── standalone
S18-3 (report export) ── standalone
S18-4 (settlement dashboard) ── standalone
S18-5 (API key management UI) ── standalone
S18-11 (plan tier dashboard) ── standalone

S18-8 (disbursement rollback) ── standalone

S18-9 (revenue distribution) ── standalone
S18-10 (portfolio metrics filters) ── standalone

S18-FIX-1 (tech debt bundle) ── standalone
S18-FIX-2 (wallet adapter migration) ── standalone
S14-11 (invoice verification queue) ── standalone
S18-ENH (billing usage history) ── standalone
```

**Recommended build order:**
1. S18-6 + S18-7 + S18-8 + S18-9 + S18-10 + S18-FIX-1 + S18-FIX-2 (all independent, build in parallel)
2. S18-1 (depends on S18-6) + S18-12 (depends on S18-7) + S14-11 + S18-ENH (build in parallel)
3. S18-2 + S18-3 + S18-4 + S18-5 + S18-11 (all independent, build in parallel)

---

## Database Migration Checklist

This sprint adds these new tables/models. Each migration must include RLS:

| Model | Table Name | RLS Required | Append-Only |
|---|---|---|---|
| `OperatorApprovalLimit` | `operator_approval_limits` | Yes | No |
| `PipelineStepLog` | `pipeline_step_logs` | Yes | **Yes** — no updates, no deletes |
| `RevenueDistributionConfig` | `revenue_distribution_configs` | Yes | No |
| `UpgradeRequest` | `upgrade_requests` | Yes | No |

**Schema modifications (Track D — if columns missing):**
- `Invoice` model: add `verificationStatus`, `assignedVerifierId`, `verifiedAt`, `verifiedBy` (S14-11)
- `Tenant` model: add `upgradeRequests UpgradeRequest[]` relation (S18-11)

**Enum additions:**
- `LoanRequestStatus`: add `escalated`
- `RevenueDistributionModel`: new enum (`percentage_split`, `tiered`, `fixed_fee`, `waterfall`)

**Event type additions (`packages/event-contracts/src/events.enum.ts`):**
- `LOAN_REQUEST_ESCALATED = 'loan_request.escalated'`
- `LOAN_REQUEST_TERMS_MODIFIED = 'loan_request.terms_modified'`
- `INVOICE_VERIFIED = 'invoice.verified'` (S14-11, if not already present)
- `INVOICE_VERIFICATION_FAILED = 'invoice.verification_failed'` (S14-11, if not already present)
- `PLAN_UPGRADE_REQUESTED = 'plan.upgrade_requested'` (S18-11)
- `PIPELINE_STEP_RETRY_SCHEDULED = 'pipeline.step.retry_scheduled'` (S18-12)
- `PIPELINE_STEP_RETRY_EXHAUSTED = 'pipeline.step.retry_exhausted'` (S18-12)

**BullMQ queue additions:**
- `pipeline-step-retry` — registered in `ProcessEngineModule` (S18-12)

Run `pnpm --filter database db:migrate` after adding models.

---

## Exit Criteria

All of the following must be true before this sprint is complete:

1. Operators can review, approve, reject, escalate, and modify terms on loan applications through the admin portal (S18-1)
2. Approval actions enforce per-operator authority limits (amount, daily count, product type, escalation) (S18-6)
3. Contract operations (manual payment recording, restructuring, penalty waiver) are available in the contract detail UI (S18-2)
4. All report views (disbursement, repayment, portfolio, collections, settlement) are exportable as CSV and PDF (S18-3)
5. Settlement runs and reconciliation data are visible in a dedicated dashboard page (S18-4)
6. API keys are manageable (create, rotate, revoke) through the admin portal settings (S18-5)
7. Every pipeline step (pre-qualification, scoring, approval, offer, disbursement) logs its inputs, outputs, duration, and outcome in `pipeline_step_logs` (S18-7)
8. Disbursement permanent failures roll back the contract to `cancelled` status and restore subscription limits (S18-8)
9. Revenue distribution supports percentage-split, tiered, fixed-fee, and waterfall models — configurable per tenant/product (S18-9)
10. Dashboard portfolio metrics are filterable by product type, lender, region, and customer segment (S18-10)
11. All new tables have RLS policies
12. All mutations are audit-logged
13. All monetary calculations use `Decimal` utilities — no floats
14. All tests pass with 80%+ coverage on new code
15. No regressions in existing approval, disbursement, settlement, or dashboard flows
16. `FINANCIAL_PROFILE_INVALIDATION_EVENTS` const matches actual `@OnEvent` handlers — no dead event references (S18-FIX-1a)
17. No `console.error` in onboarding flow — all error logging uses structured `this.logger.error()` (S18-FIX-1b)
18. `services/integration-service` passes 265/265 tests (0 failures) — pre-existing screening test fixed (S18-FIX-1c)
19. All wallet adapter call-sites go through `walletAdapterResolver.resolveAdapter(tenantId)` — no direct `MockWalletAdapter` instantiation outside the resolver (S18-FIX-2)
20. Invoice verification queue page functional: operators can claim invoices, submit verification decisions, and filter the queue (S14-11)
21. `usageHistory` GraphQL query returns billing records, next billing date, and estimated current-period fees (S18-ENH)
22. Billing & Plan page shows current tier, usage meters with colour-coded progress bars, billing history with filters, and feature flags summary (S18-11)
23. Plan comparison modal displays all 3 tiers side-by-side with limits and features (S18-11)
24. Upgrade request mutation creates a pending request, emits event, and is audit-logged; downgrade/same-tier requests are rejected (S18-11)
25. All pipeline steps (pre-qualification, scoring, approval, offer, contract, disbursement) support individual retry via BullMQ delayed jobs with exponential backoff (S18-12)
26. Disbursement retry replaces recursive `attemptTransfer` with `PipelineRetryService` — no more synchronous retry loops (S18-12)
27. Pipeline retry attempts are recorded in `pipeline_step_logs` with attempt number, delay, and outcome (S18-12)
28. Non-retriable errors (validation failures, permanent rejections) are never retried regardless of retry count (S18-12)
