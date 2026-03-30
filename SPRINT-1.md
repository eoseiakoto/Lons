# Sprint 1 — Development Brief (Mar 27 – Apr 9, 2026)

**Objective:** Complete Phase 1 foundation gaps and close out Phase 2 loan processing core.
**Total Story Points:** 47
**Deadline:** April 9, 2026

---

## Task 1: Finalize Auth Service (Critical | 8 pts | entity-service)
**Monday.com Item ID:** 11605402956

### What to build
Complete the authentication service in `services/entity-service/src/auth/`:

1. **JWT RS256 signing/verification** — Implement token generation using RS256 private/public key pair. Keys loaded from `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` env vars. Access token expiry from `JWT_EXPIRY` (default 3600s).
2. **Refresh token rotation** — Issue opaque refresh tokens stored in `refresh_tokens` table. Implement `REFRESH_TOKEN_EXPIRY` (default 604800s). Old refresh tokens are invalidated on use (rotation).
3. **Account lockout** — After 5 consecutive failed login attempts, set `locked_until` to now + 30 minutes. Increment `failed_login_count` on failure, reset on success.
4. **Tenant context injection** — After JWT validation, extract `tenantId` from token claims and execute `SET app.current_tenant = '<tenant_id>'` on the PostgreSQL session.

### Acceptance Criteria
- [ ] JWT access tokens are signed with RS256 and verifiable with the public key
- [ ] Refresh token rotation works — old token invalidated, new token issued
- [ ] Account locks after 5 failed attempts, unlocks after 30 min or admin reset
- [ ] Tenant context is set on every authenticated database session
- [ ] Unit tests with 90%+ coverage for auth service

### Reference
- `Docs/10-security-compliance.md` §2 (Authentication)
- `packages/database/prisma/schema.prisma` — User, PlatformUser, RefreshToken models

---

## Task 2: Implement RBAC Middleware (Critical | 5 pts | graphql-server)
**Monday.com Item ID:** 11605403238

### What to build
Create a NestJS guard/decorator system in `apps/graphql-server/` that enforces role-based access on all GraphQL resolvers:

1. **`@Roles()` decorator** — Applied to resolvers/mutations specifying required permissions (e.g., `@Roles('loan.approve', 'product.write')`).
2. **RolesGuard** — NestJS `CanActivate` guard that reads the JWT, looks up the user's role, checks the `permissions` JSON array on the role, and allows/denies.
3. **Field-level authorization** — Sensitive fields (national_id, phone, email) require specific permissions to resolve. Return `null` or throw `ForbiddenException` if unauthorized.

### Acceptance Criteria
- [ ] All existing resolvers have appropriate `@Roles()` decorators
- [ ] Unauthorized requests return structured error `{ code: "FORBIDDEN", message: "..." }`
- [ ] Sensitive PII fields are gated behind field-level auth
- [ ] Unit tests for guard logic with various role/permission combinations

### Reference
- `Docs/10-security-compliance.md` §2.3 (RBAC)
- `Docs/07-api-specifications.md` §2 (GraphQL security)

---

## Task 3: API Key Management for SP Integration (High | 5 pts | entity-service)
**Monday.com Item ID:** 11605391127

### What to build
Implement API key CRUD in `services/entity-service/` for Service Provider integration authentication:

1. **Key generation** — Generate API keys (prefix `lons_` + 32-byte random hex). Store SHA-256 hash in `api_keys` table, return plaintext only once.
2. **Key validation middleware** — Validate `X-API-Key` header, look up hash, resolve tenant context.
3. **Key management** — Create, list (masked), revoke. Keys have optional `expires_at`.
4. **Rate limit metadata** — Each key has `rate_limit_per_minute` (default 60).

### Acceptance Criteria
- [ ] API keys can be created, listed (masked), and revoked via GraphQL mutations
- [ ] API key authentication works as an alternative to JWT for REST endpoints
- [ ] Plaintext key is only returned on creation, never again
- [ ] Revoked/expired keys are rejected immediately

### Reference
- `Docs/10-security-compliance.md` §2.4 (API key auth)
- `Docs/09-integrations.md` §1 (SP integration patterns)

---

## Task 4: Process Engine Integration Tests (Critical | 8 pts | process-engine)
**Monday.com Item ID:** 11605364578

### What to build
Write comprehensive integration tests in `services/process-engine/` covering the full state machine:

1. **Happy path** — RECEIVED → VALIDATED → PRE_QUALIFIED → SCORED → APPROVED → OFFER_SENT → ACCEPTED → CONTRACT_CREATED
2. **Rejection paths** — Pre-qualification fail, scoring below threshold, manual review rejection
3. **Edge cases** — Offer expiry, duplicate requests (idempotency), invalid state transitions
4. **Concurrent requests** — Multiple loan requests for the same customer handled correctly

### Acceptance Criteria
- [ ] Integration tests cover all state transitions in the state machine
- [ ] Each test uses a real database (not mocks) per CLAUDE.md testing rules
- [ ] Tests are idempotent — can run multiple times without side effects
- [ ] All tests pass in CI (< 60s total)

### Reference
- `Docs/05-process-engine.md` (full pipeline spec)
- `services/process-engine/src/loan-request/loan-request-state-machine.ts`

---

## Task 5: Complete Disbursement Service (Critical | 8 pts | process-engine)
**Monday.com Item ID:** 11605366729

### What to build
Finish the disbursement flow in `services/process-engine/src/disbursement/`:

1. **Disbursement orchestrator** — After contract creation, initiate disbursement. Call wallet adapter, handle async callback.
2. **Mock wallet adapter** — Implement `IWalletAdapter` interface in `services/integration-service/`. Mock should simulate: success (80%), pending-then-success (10%), failure (10%), with realistic 1-2s delays.
3. **Status tracking** — Track disbursement status: INITIATED → PROCESSING → COMPLETED / FAILED. Store in `disbursements` table.
4. **Retry logic** — Failed disbursements retry up to 3 times with exponential backoff.
5. **Event emission** — Emit `disbursement.completed` or `disbursement.failed` events.

### Acceptance Criteria
- [ ] Disbursement flow works end-to-end with mock wallet adapter
- [ ] Mock adapter simulates realistic success/failure rates and async callbacks
- [ ] Failed disbursements retry with exponential backoff
- [ ] All state transitions emit events per `packages/event-contracts/`
- [ ] Contract status updates to DISBURSED or DISBURSEMENT_FAILED

### Reference
- `Docs/05-process-engine.md` §6 (Disbursement)
- `Docs/09-integrations.md` §2 (Wallet adapters)

---

## Task 6: Wire Up Notification Service (High | 5 pts | notification-service)
**Monday.com Item ID:** 11605364253

### What to build
Complete the notification dispatch pipeline in `services/notification-service/`:

1. **Notification dispatcher** — Consume events from BullMQ, determine notification templates and channels based on event type.
2. **Console/log adapter** — Default adapter that logs notifications to stdout in structured JSON format (for local dev).
3. **Template engine** — Simple template system supporting variable interpolation: `"Dear {{customer_name}}, your loan of {{amount}} {{currency}} has been disbursed."`.
4. **Notification templates** — Create templates for key events: loan_approved, offer_sent, disbursement_completed, repayment_reminder, repayment_received, overdue_notice.
5. **Delivery tracking** — Record delivery status in `notifications` table (pending → sent → delivered / failed).

### Acceptance Criteria
- [ ] Events trigger appropriate notifications via console/log adapter
- [ ] Templates render correctly with variable interpolation
- [ ] PII is masked in log output per CLAUDE.md rules (phone → `+233***7890`)
- [ ] All 6 core notification templates are defined
- [ ] Notification delivery status is tracked in the database

### Reference
- `Docs/09-integrations.md` §5 (Notifications)
- `services/notification-service/`

---

## Task 7: E2E Integration Test — Loan Request to Disbursement (Critical | 8 pts | process-engine)
**Monday.com Item ID:** 11605364333

### What to build
A comprehensive end-to-end integration test that exercises the full loan lifecycle from request to disbursement:

1. **Setup** — Seed a tenant, SP, product (micro-loan), lender, and customer.
2. **Request** — Submit a loan request via the process engine.
3. **Pipeline** — Verify it flows through: validation → pre-qualification → scoring → approval → offer generation.
4. **Acceptance** — Accept the offer, verify contract creation.
5. **Disbursement** — Verify disbursement initiates via mock wallet adapter and completes.
6. **Verification** — Assert: contract is DISBURSED, ledger entries are created, notifications were sent, events were emitted.

### Acceptance Criteria
- [ ] Single test file that runs the complete happy path end-to-end
- [ ] Uses real database and real service instances (not mocks for business logic)
- [ ] Verifies all side effects: database state, events emitted, notifications sent
- [ ] Test is deterministic and idempotent
- [ ] Execution time < 30 seconds

### Reference
- `Docs/05-process-engine.md` (full pipeline)
- `Docs/01-loan-portfolio.md` §2 (Micro-loan product spec)

---

## Execution Order

Tasks have dependencies. Recommended execution order for Claude Code:

```
Task 1 (Auth) ──→ Task 2 (RBAC) ──→ Task 3 (API Keys)
                                          │
Task 5 (Disbursement) ──→ Task 6 (Notifications)
      │                         │
      └─────────────────────────┴──→ Task 4 (Integration Tests)
                                          │
                                          └──→ Task 7 (E2E Test)
```

**Parallel tracks:**
- Track A: Tasks 1 → 2 → 3 (Auth chain)
- Track B: Tasks 5 → 6 (Disbursement + Notifications)
- Track C: Tasks 4 → 7 (Tests — after A and B are done)

---

## Rules (from CLAUDE.md)

- **Money:** Use `Decimal` / `DECIMAL(19,4)`. Never floats. Banker's rounding.
- **Multi-tenancy:** Every query must use tenant context. RLS enforced.
- **Database:** UUID v7 PKs. Soft deletes. Append-only ledger.
- **Events:** All state transitions emit events. Consumers must be idempotent.
- **Security:** PII never in logs. Mask as `+233***7890`, `GHA-***-XXX`.
- **Testing:** 80%+ coverage. Integration tests hit real DB, not mocks.
