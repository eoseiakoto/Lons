# Sprint 5 — Phase 5 Part 2: AI/ML + Phase 4 Overflow

**Sprint:** 5 of 7
**Dates:** May 22 – Jun 4, 2026
**Total Story Points:** 65 (stretch sprint — justified by Task 3 scope reduction on network analysis)
**Phase Focus:** Phase 5 — Integrations & AI (AI/ML portion) + Phase 4 overflow + BA-identified gaps

---

## BA Review Changes (v2)

This brief incorporates feedback from the Business Analyst review:

1. **Dropped:** Generic Wallet GraphQL Resolver (2pts) — BA confirmed resolver already exists at `apps/graphql-server/src/graphql/resolvers/integration.resolver.ts`. Minor gaps (delete mutation, idempotency, field masking) rolled into Task 1.
2. **Added:** Extend IWalletAdapter interface (3pts) — BA-identified gap. ML scoring depends on `getTransactionHistory` for wallet-sourced features.
3. **Added:** Notification template persistence (5pts) — BA-identified gap. Admin portal notification config is non-functional without DB persistence.
4. **Updated Task 2:** Added per-tenant scorecard configuration (FR-CS-001.1/001.3). Feature pipeline gracefully degrades without wallet data.
5. **Updated Task 3:** Network analysis (FR-AR-004) downscoped to stub/mock. Restructuring must integrate with repayment-service for schedule generation.
6. **Updated Task 4:** Explicitly documented v1 limitation — batch monitoring only. Real-time event-driven monitoring deferred to Phase 6.

---

## Sprint Goals

1. Extend the wallet adapter interface with customer info and transaction history methods (ML scoring dependency)
2. Build the ML credit scoring service in Python (FastAPI) with model training, per-tenant scorecard config, versioning, explainability, and drift detection
3. Upgrade the recovery service from static rules to AI-driven strategy recommendation with outcome tracking and repayment-service integration for restructuring
4. Implement batch borrower monitoring with configurable alerts and adaptive loan management (v1 — real-time deferred)
5. Bridge NestJS scoring with the Python ML service (dual-model execution)
6. Complete Phase 4 overflow: platform portal tenant management + admin portal E2E tests
7. Fix notification template persistence gap

---

## Tasks

### Task 1: Extend IWalletAdapter Interface (BA-Identified Gap)
**Points:** 3 | **Priority:** High | **Service:** `integration-service`

The `IWalletAdapter` interface defines 4 operations (transfer, collect, getBalance, getTransactionStatus) but FR-DW-001.1 requires 7. The ML scoring service (Task 2) depends on `getTransactionHistory` for wallet-sourced features (spending trends, income seasonality, transaction frequency). This task also fixes minor gaps in the existing wallet config GraphQL resolver (delete mutation, idempotency implementation, field-level masking on configJson).

**Reference:** `Docs/09-integrations.md` §2.2 FR-DW-001.1, `Docs/02-qualification-scoring.md` §1 FR-DI-001

**Acceptance Criteria:**
- [ ] Extend `IWalletAdapter` interface with 3 new methods:
  - `getCustomerInfo(walletId: string): Promise<WalletCustomerInfo>` — retrieve customer details + KYC status
  - `getTransactionHistory(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]>` — pull transaction history for ML feature pipeline
  - `registerWebhook?(events: string[], callbackUrl: string): Promise<WebhookRegistration>` — stub only (optional method, full implementation Phase 6)
- [ ] Implement `getCustomerInfo` + `getTransactionHistory` in MTN MoMo adapter (sandbox mock with realistic data)
- [ ] Implement `getCustomerInfo` + `getTransactionHistory` in M-Pesa adapter (sandbox mock with realistic data)
- [ ] Implement `getCustomerInfo` + `getTransactionHistory` in generic wallet adapter (configurable endpoint mapping)
- [ ] Fix existing wallet config resolver gaps:
  - Add `deleteWalletProviderConfig` mutation (soft delete)
  - Implement `idempotencyKey` in create mutation (currently declared but no-op)
  - Add field-level masking on `configJson` — credentials must not be exposed to `integration:read` role without `integration:read:sensitive`
- [ ] New types: `WalletCustomerInfo`, `WalletTransaction`, `DateRange`, `WebhookRegistration` in shared-types
- [ ] Unit tests for all new methods + resolver fixes

**DEPENDENCY:** Must complete before Task 2 (ML scoring needs wallet transaction data for feature engineering).

**New files:**
```
packages/shared-types/src/interfaces/wallet-customer-info.interface.ts
packages/shared-types/src/interfaces/wallet-transaction.interface.ts
services/integration-service/src/adapters/mtn-momo/mtn-momo.adapter.spec.ts  (extend existing)
services/integration-service/src/adapters/mpesa/mpesa.adapter.spec.ts        (extend existing)
```

**Files to modify:**
```
services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts   # Add 3 new methods
services/integration-service/src/adapters/mtn-momo/mtn-momo.adapter.ts         # Implement new methods
services/integration-service/src/adapters/mtn-momo/mtn-momo.types.ts           # New response types
services/integration-service/src/adapters/mpesa/mpesa.adapter.ts               # Implement new methods
services/integration-service/src/adapters/mpesa/mpesa.types.ts                 # New response types
services/integration-service/src/adapters/generic/generic-wallet.adapter.ts    # Implement new methods
services/integration-service/src/adapters/generic/generic-wallet.types.ts      # New response types
apps/graphql-server/src/graphql/resolvers/integration.resolver.ts              # Add delete mutation, idempotency, field masking
packages/shared-types/src/interfaces/index.ts                                  # Export new interfaces
```

---

### Task 2: ML Credit Scoring Service (Python FastAPI)
**Points:** 13 | **Priority:** Critical | **Service:** `scoring-service`

Expand the existing Python scoring service from a mock rule-based engine to a full ML scoring platform. The current service at `services/scoring-service/` has a FastAPI app with a single `POST /score` endpoint and a deterministic scorecard with 6 hard-coded factors. This task adds model training, per-tenant scorecard configuration, feature engineering, versioning, explainability, and drift detection.

**Reference:** `Docs/02-qualification-scoring.md` §3.2 FR-CS-002

**Acceptance Criteria:**
- [ ] **Per-tenant scorecard configuration (FR-CS-001.1, FR-CS-001.3):** SP operators can define scoring factors, weights, and scoring bands per product via API. Each factor has configurable weight (percentage contribution), scoring bands (e.g., on-time payment >90% = 100pts), and min/max values. Scorecards versioned per FR-CS-001.5. New endpoints: `GET /scorecards`, `POST /scorecards`, `PUT /scorecards/{id}`. Without this, all tenants share the same hard-coded 6-factor scorecard.
- [ ] **Feature engineering pipeline:** Normalize and transform raw customer features into ML-ready feature vectors. Support temporal features (spending trends, income seasonality), behavioral clusters (transaction type distribution), and configurable custom features per tenant. **Graceful degradation:** if wallet transaction data is unavailable (Task 1 not yet complete or SP hasn't configured wallet access), the model trains/scores on non-wallet features only (payment history, KYC, account age, bureau data) — no blocking dependency, just reduced feature set.
- [ ] **Model training module:** Train gradient-boosted tree models (XGBoost or LightGBM) on historical loan performance data. Accept training data as CSV or JSON. Output: serialized model file + evaluation metrics
- [ ] **Model registry:** Store and version trained models with metadata (version string, training date, feature list, evaluation metrics, status: training/active/archived/champion/challenger). Support multiple models per tenant
- [ ] **Model serving:** Load active model(s) per tenant. Predict: credit score (0–1000), probability of default, recommended credit limit, confidence interval, risk tier. All amounts as strings (Decimal)
- [ ] **Dual-model execution:** Support running rule-based + ML models in parallel. Configurable strategy: rule_only, ml_only, higher, lower, weighted_average (FR-CS-003.2)
- [ ] **Traffic routing:** A/B test multiple model versions — configurable percentage split (e.g., 80% champion, 20% challenger) per tenant (FR-CS-001.6)
- [ ] **Explainability:** Top N contributing factors per prediction with SHAP values. Include feature importance in model metadata
- [ ] **Drift detection:** Compare predicted vs actual default rates per model version. Alert when KL-divergence or PSI exceeds configurable threshold (FR-CS-002.6)
- [ ] **API endpoints:**
  - `POST /score` — enhanced with model selection, dual-model support
  - `POST /train` — trigger model training from dataset
  - `GET /models` — list models (with version, status, metrics)
  - `GET /models/{id}` — model details + feature importance
  - `PUT /models/{id}/activate` — promote model to active/champion
  - `GET /models/{id}/drift` — drift detection report
  - `GET /scorecards` — list scorecards per tenant
  - `POST /scorecards` — create scorecard
  - `PUT /scorecards/{id}` — update scorecard
  - `GET /health` — service health with model status
- [ ] **All amounts as strings** — never float for money
- [ ] **Comprehensive tests** (pytest) — unit tests for feature engineering, model training, prediction, drift detection, per-tenant scorecard config

**DEPENDS ON:** Task 1 (wallet adapter extension) for wallet-sourced features in feature pipeline.

**New files:**
```
services/scoring-service/app/models/ml_model.py          # ML model wrapper (XGBoost/LightGBM)
services/scoring-service/app/models/feature_engineering.py # Feature pipeline (with graceful degradation)
services/scoring-service/app/models/model_registry.py     # Model versioning & storage
services/scoring-service/app/models/explainability.py      # SHAP-based explanations
services/scoring-service/app/models/drift_detection.py     # Drift monitoring
services/scoring-service/app/models/dual_scoring.py        # Dual-model execution strategy
services/scoring-service/app/models/scorecard_config.py    # Per-tenant scorecard CRUD
services/scoring-service/app/routers/models.py             # Model management API
services/scoring-service/app/routers/training.py           # Training trigger API
services/scoring-service/app/routers/scorecards.py         # Scorecard configuration API
services/scoring-service/app/schemas/models.py             # Pydantic schemas for model CRUD
services/scoring-service/app/schemas/training.py           # Training request/response schemas
services/scoring-service/app/schemas/scorecards.py         # Scorecard config schemas
services/scoring-service/tests/test_ml_model.py
services/scoring-service/tests/test_feature_engineering.py
services/scoring-service/tests/test_model_registry.py
services/scoring-service/tests/test_drift_detection.py
services/scoring-service/tests/test_dual_scoring.py
services/scoring-service/tests/test_scorecard_config.py
```

**Files to modify:**
```
services/scoring-service/app/main.py              # Register new routers (models, training, scorecards)
services/scoring-service/app/config.py             # Add ML config (model storage path, training params)
services/scoring-service/app/routers/score.py      # Enhance with model selection, dual scoring
services/scoring-service/app/schemas/scoring.py    # Add model_type, strategy fields
services/scoring-service/requirements.txt          # Add xgboost/lightgbm, shap, scikit-learn, numpy
```

**Key design decisions:**
- Use file-based model storage (`models/` directory) for now — cloud storage (S3) in Phase 6
- Training is synchronous for small datasets, returns job ID for large datasets
- Model registry is in-memory + JSON file persistence (no separate DB for scoring service)
- Scorecard configs stored as JSON files per tenant (same pattern as model registry)
- SHAP TreeExplainer for gradient-boosted models
- PSI (Population Stability Index) for drift detection with configurable threshold (default 0.25)
- Feature pipeline has explicit `WALLET_FEATURES_AVAILABLE` flag — skips wallet features if adapter not configured

---

### Task 3: AI Recovery Strategy Engine
**Points:** 13 | **Priority:** Critical | **Service:** `recovery-service`

Upgrade the recovery service from static DPD-based strategy selection to an AI-driven engine. The current service at `services/recovery-service/src/recovery-strategy.service.ts` (89 lines) uses hardcoded DPD thresholds. This task adds predictive risk analysis, personalized strategy recommendation, outcome tracking, and a feedback loop.

**Reference:** `Docs/03-repayments-recovery.md` §3 FR-AR-001 to FR-AR-005

**Acceptance Criteria:**
- [ ] **Predictive risk analysis (FR-AR-001):** Analyze active loans to predict probability of default using: payment history patterns, wallet balance trends, income deposit frequency changes, spending behavior shifts. Output: probability of default (0–100%), predicted days to default, confidence level, top contributing risk factors
- [ ] **Strategy recommendation (FR-AR-002):** Recommend recovery strategies ranked by predicted effectiveness and cost: restructured repayment plan (extended tenor, reduced installments), grace period offering, transaction fee-based recovery (small deductions from future transactions), partial settlement offer, escalation to formal collections. All math uses Decimal strings with banker's rounding
- [ ] **Personalized selection:** Strategy selection considers customer profile (income stability, payment history, product type, DPD, outstanding balance, prior recovery outcomes)
- [ ] **Transaction fee-based recovery (FR-AR-003):** Support recovery via small deductions from borrower wallet transactions — configurable percentage and daily cap. Requires customer consent flag
- [ ] **Network-based recovery analysis (FR-AR-004) — STUB/MOCK:** ⚠️ This is "Should" priority and requires non-trivial transaction graph analysis. For Sprint 5, implement as a **stub/mock service** that returns realistic simulated guarantor candidates (with tie-strength scores, relationship type, financial capacity indicators) but does NOT perform real graph traversal. The mock should expose the same interface that the real implementation will use, so it can be swapped in Phase 6/7. Present results to SP for manual outreach only — system SHALL NOT auto-contact.
- [ ] **Loan restructuring support (FR-AR-005) with repayment-service integration:** Tenor extension, installment reduction, interest rate modification, penalty waiver, payment holiday. **CRITICAL (FR-AR-005.2):** RestructuringService MUST call into repayment-service to generate new repayment schedules using existing schedule generation logic. Original contract history preserved. New schedule linked to restructuring record. Restructured loans flagged separately in reporting.
- [ ] **Outcome tracking:** Record the result of each applied strategy (success/partial/failed, amount recovered, days to resolution). Feed outcomes back to improve future recommendations
- [ ] **Integration with collections:** Expose `getRecommendations()` with enriched AI-driven strategies to the collections workflow in process-engine. Emit events: `recovery.strategy_recommended`, `recovery.strategy_applied`, `recovery.outcome_recorded`
- [ ] **GraphQL API:** Queries: `recoveryStrategies(contractId)`, `recoveryOutcomes(contractId)`. Mutations: `applyRecoveryStrategy(contractId, strategyType, params)`, `recordRecoveryOutcome(contractId, strategyId, result)`, `restructureLoan(contractId, restructuringParams)`
- [ ] **Comprehensive tests** — unit tests for risk prediction, strategy ranking, outcome tracking, restructuring calculations, repayment-service integration

**New files:**
```
services/recovery-service/src/predictive-risk.service.ts       # Default prediction engine
services/recovery-service/src/strategy-recommender.service.ts  # AI-driven strategy ranking
services/recovery-service/src/outcome-tracker.service.ts       # Outcome recording + feedback loop
services/recovery-service/src/restructuring.service.ts         # Loan restructuring — calls repayment-service
services/recovery-service/src/network-analysis.service.ts      # STUB/MOCK — realistic simulated data
services/recovery-service/src/recovery.resolver.ts             # GraphQL resolver
services/recovery-service/src/recovery.module.ts               # NestJS module (update existing)
services/recovery-service/src/dto/                             # Input/output DTOs
services/recovery-service/src/dto/recovery-strategy.dto.ts
services/recovery-service/src/dto/restructuring.dto.ts
services/recovery-service/src/dto/outcome.dto.ts
services/recovery-service/src/__tests__/predictive-risk.spec.ts
services/recovery-service/src/__tests__/strategy-recommender.spec.ts
services/recovery-service/src/__tests__/outcome-tracker.spec.ts
services/recovery-service/src/__tests__/restructuring.spec.ts
services/recovery-service/src/__tests__/network-analysis.spec.ts
```

**Files to modify:**
```
services/recovery-service/src/recovery-strategy.service.ts   # Integrate with new AI recommender
services/recovery-service/src/recovery-service.module.ts     # Register new providers + resolver
packages/event-contracts/src/events.enum.ts                  # Add recovery events
packages/shared-types/src/enums/recovery.enum.ts             # Add RecoveryStrategyType, RecoveryOutcomeStatus
packages/shared-types/src/interfaces/recovery-strategy.interface.ts  # New interface
```

**Key design decisions:**
- Predictive risk uses a weighted scoring model (not ML — ML can be added in Phase 6 when training data accumulates)
- Strategy effectiveness scores are initially seeded from business rules, then calibrated by outcome data
- Network analysis is STUB — returns mock data via same interface, swappable later
- Restructuring calls `repayment-service` schedule generation via internal service call (not HTTP — same NestJS process)
- Restructuring recalculates schedules using the same financial math from `packages/common/src/financial/`

---

### Task 4: Real-Time Monitoring & Alerting
**Points:** 8 | **Priority:** High | **Service:** `process-engine`, `scheduler`

Implement continuous borrower monitoring, configurable alerts, and adaptive loan management actions. The existing `MonitoringService` in `services/process-engine/src/monitoring/monitoring.service.ts` has basic risk scoring (DPD + outstanding ratio). This task adds configurable alert rules and automated intervention triggers.

**Reference:** `Docs/02-qualification-scoring.md` §4 FR-RM-001 to FR-RM-003

**⚠️ V1 Limitation:** This sprint delivers **batch monitoring** (daily sweep) only. FR-RM-001.1 requires "a live connection (webhook or polling) with EMI systems to track changes in borrower financial status." True real-time monitoring (detecting intra-day wallet balance drops, income deposit changes) requires wallet providers to push events via webhooks, which depends on `registerWebhook` — deferred to Phase 6. The daily sweep assesses risk based on data already in the system; it won't detect intra-day changes. This is a pragmatic v1 — full event-driven monitoring is a Phase 6 enhancement.

**Acceptance Criteria:**
- [ ] **Batch monitoring (FR-RM-001 v1):** Compute risk indicator per active borrower during daily sweep. Risk categories: Low, Medium, High, Critical. Inputs: contract status, payment history, wallet balance snapshots, outstanding ratio, classification, upcoming payment proximity
- [ ] **Alert rules engine (FR-RM-002):** Configurable alert triggers: wallet balance drops below threshold relative to upcoming payment, income deposits stop or decrease significantly, spending patterns change dramatically, credit score drops below threshold. Alerts delivered to: SP operators (via notification service), analytics engine, and optionally the recovery engine for proactive intervention
- [ ] **Alert configuration:** Per-product and per-risk-tier configurable thresholds. CRUD for alert rules via GraphQL
- [ ] **Adaptive loan management (FR-RM-003):** Automated actions on risk change: credit limit freeze, repayment schedule adjustment suggestion, early warning flag for SP review, auto-escalation to recovery if risk reaches Critical. All automated actions require SP opt-in per action type
- [ ] **Monitoring scheduler job:** New cron job in `apps/scheduler/` — runs monitoring sweep for all active contracts. Default: daily at 2 AM UTC. Emits `monitoring.risk_changed` and `monitoring.alert_triggered` events
- [ ] **GraphQL API:** Queries: `borrowerRiskProfile(customerId)`, `monitoringAlerts(filters)`, `alertRules(productId)`. Mutations: `createAlertRule`, `updateAlertRule`, `acknowledgeAlert`
- [ ] **Comprehensive tests** — unit tests for risk computation, alert triggering, adaptive actions

**New files:**
```
services/process-engine/src/monitoring/alert-rules.service.ts      # Alert rule CRUD + evaluation
services/process-engine/src/monitoring/alert.service.ts            # Alert generation + delivery
services/process-engine/src/monitoring/adaptive-actions.service.ts  # Automated interventions
services/process-engine/src/monitoring/monitoring.resolver.ts       # GraphQL resolver
services/process-engine/src/monitoring/dto/alert-rule.dto.ts
services/process-engine/src/monitoring/dto/risk-profile.dto.ts
services/process-engine/src/monitoring/dto/alert.dto.ts
services/process-engine/src/monitoring/__tests__/alert-rules.spec.ts
services/process-engine/src/monitoring/__tests__/alert.spec.ts
services/process-engine/src/monitoring/__tests__/adaptive-actions.spec.ts
apps/scheduler/src/jobs/monitoring.job.ts                           # Daily monitoring sweep
```

**Files to modify:**
```
services/process-engine/src/monitoring/monitoring.service.ts  # Enhance risk calculation
services/process-engine/src/process-engine.module.ts          # Register new providers
apps/scheduler/src/scheduler.module.ts                        # Register monitoring job
packages/event-contracts/src/events.enum.ts                   # Add monitoring events
```

---

### Task 5: NestJS ↔ Python Scoring Bridge (Dual-Model Integration)
**Points:** 5 | **Priority:** High | **Service:** `process-engine`

Currently, the process-engine's `ScoringService` calls the local TypeScript scorecard engine directly. This task adds an HTTP client to call the Python ML scoring service and implements the dual-model scoring strategy (FR-CS-003.2).

**Reference:** `Docs/02-qualification-scoring.md` §3.2 FR-CS-003

**DEPENDS ON:** Task 2 (Python ML service endpoints must exist).

**Acceptance Criteria:**
- [ ] **ML scoring client:** HTTP client in process-engine that calls the Python scoring service at `SCORING_SERVICE_URL`. Includes circuit breaker, timeout (5s per FR-CS-003.3), retry with backoff
- [ ] **Dual-model execution (FR-CS-003.2):** Run both rule-based (local) and ML (Python service) models for the same customer. Strategy selection configurable per product: rule_only, ml_only, higher, lower, weighted_average
- [ ] **Scoring configuration:** Per-product scoring config: which model(s) to use, strategy, weights. Stored in product config, accessible via GraphQL
- [ ] **Scoring history (FR-CS-003.4):** Store complete scoring history per customer: score, model version, all input features, contributing factors, timestamp. Queryable via GraphQL
- [ ] **Credit limit derivation (FR-CS-004):** Derive recommended credit limit from score using configurable limit bands per product. Apply total exposure cap across all products per customer
- [ ] **Fallback:** If ML service is unavailable, fall back to rule-based scoring without blocking (FR-DI-002.4)
- [ ] **Unit tests** — dual-model strategies, fallback behavior, credit limit derivation, scoring history

**New files:**
```
services/process-engine/src/scoring/ml-scoring.client.ts         # HTTP client for Python service
services/process-engine/src/scoring/dual-scoring.strategy.ts     # Strategy pattern implementation
services/process-engine/src/scoring/credit-limit.service.ts      # Limit derivation + exposure cap
services/process-engine/src/scoring/__tests__/ml-scoring.client.spec.ts
services/process-engine/src/scoring/__tests__/dual-scoring.strategy.spec.ts
services/process-engine/src/scoring/__tests__/credit-limit.spec.ts
```

**Files to modify:**
```
services/process-engine/src/scoring/scoring.service.ts      # Integrate dual-model strategy
services/process-engine/src/scoring/scoring.module.ts       # Register new providers
```

---

### Task 6: Platform Portal — Tenant Management
**Points:** 8 | **Priority:** Medium | **Service:** `admin-portal` (Phase 4 overflow)

Build the platform-level admin screens for tenant (SP) management. Note: A `platform-portal` app already exists with basic tenant list. This task adds full CRUD.

**Reference:** `Docs/04-entity-management.md` §1, `Docs/08-admin-portal.md` §8

**Acceptance Criteria:**
- [ ] **Tenant list page:** Paginated table with search/filter (status, plan, creation date). Columns: name, slug, status (active/suspended/onboarding), plan, SP count, created date
- [ ] **Tenant detail page:** Full tenant profile, configuration tabs (general, schema, billing, integrations), activity log
- [ ] **Create tenant wizard:** Multi-step form: basic info → schema provisioning → admin user creation → integration config → review & activate
- [ ] **Edit tenant:** Inline edit for tenant config. Status transitions: onboarding → active → suspended (with reason)
- [ ] **SP management within tenant:** List SPs under a tenant, create/edit SP, assign products
- [ ] **Platform-level auth:** Only platform admins (super-admin role) can access these screens. Role check on route guard
- [ ] **Responsive layout** — works on desktop and tablet
- [ ] **Unit tests** for form validation and key components

**New files:**
```
apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx
apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx
apps/admin-portal/src/app/(portal)/platform/tenants/create/page.tsx
apps/admin-portal/src/components/platform/tenant-list-table.tsx
apps/admin-portal/src/components/platform/tenant-detail-tabs.tsx
apps/admin-portal/src/components/platform/tenant-create-wizard.tsx
apps/admin-portal/src/components/platform/sp-management.tsx
apps/admin-portal/src/app/(portal)/platform/layout.tsx     # Platform admin layout with guard
```

**Files to modify:**
```
apps/admin-portal/src/app/(portal)/layout.tsx   # Add platform nav link for super-admins
```

---

### Task 7: Admin Portal E2E Tests
**Points:** 5 | **Priority:** High | **Service:** `admin-portal` (Phase 4 overflow)

Set up E2E testing infrastructure and write tests for the admin portal's critical user flows. Use Playwright for browser automation.

**Reference:** `Docs/12-non-functional.md`

**Acceptance Criteria:**
- [ ] **Playwright setup:** Install Playwright, configure for Next.js dev server, add test scripts to `package.json`
- [ ] **Auth flow tests:** Login with valid credentials, login with invalid credentials, session expiry redirect, role-based route access (admin vs operator vs viewer)
- [ ] **Dashboard tests:** Dashboard renders with key metrics, data loading states, error states
- [ ] **Product management tests:** Product list renders, create product wizard (happy path), edit product
- [ ] **Customer tests:** Customer search with filters, customer detail page renders all tabs
- [ ] **Loan operations tests:** Application queue loads, review drawer opens, approve/reject flow
- [ ] **Collections tests:** Collections queue renders, filter by status, assignment action
- [ ] **Reports tests:** Report list renders, select report type, filter and generate, export CSV
- [ ] **GraphQL API mocking:** Use MSW (Mock Service Worker) or Playwright route interception for deterministic tests
- [ ] **CI-ready:** Tests can run headless, output JUnit XML for CI integration

**New files:**
```
apps/admin-portal/playwright.config.ts
apps/admin-portal/e2e/auth.spec.ts
apps/admin-portal/e2e/dashboard.spec.ts
apps/admin-portal/e2e/products.spec.ts
apps/admin-portal/e2e/customers.spec.ts
apps/admin-portal/e2e/loans.spec.ts
apps/admin-portal/e2e/collections.spec.ts
apps/admin-portal/e2e/reports.spec.ts
apps/admin-portal/e2e/fixtures/mock-data.ts
apps/admin-portal/e2e/fixtures/auth.setup.ts
```

**Files to modify:**
```
apps/admin-portal/package.json    # Add playwright, @playwright/test, test scripts
apps/admin-portal/tsconfig.json   # Include e2e directory
```

---

### Task 8: AI/ML Integration E2E Tests
**Points:** 5 | **Priority:** High | **Service:** `scoring-service`, `recovery-service`, `process-engine`

End-to-end tests validating the full AI/ML integration chain: scoring → dual-model → recovery → monitoring → alerting.

**Acceptance Criteria:**
- [ ] **ML scoring E2E:** Train a test model → activate it → score a customer → verify dual-model execution → check scoring history persistence
- [ ] **Recovery E2E:** Create overdue contract → get AI recovery recommendations → apply strategy → record outcome → verify feedback loop improves next recommendation
- [ ] **Restructuring E2E:** Apply restructuring strategy → verify repayment-service generates new schedule → verify original contract history preserved → verify restructured flag in reporting
- [ ] **Monitoring E2E:** Create at-risk contract → run monitoring sweep → verify alert generated → verify adaptive action triggered (e.g., credit freeze) → verify notification sent
- [ ] **Full lifecycle E2E:** Loan request → ML scoring → approval → disbursement → missed payment → overdue → monitoring alert → recovery recommendation → restructuring → settlement
- [ ] **Fallback E2E:** Kill Python scoring service → verify NestJS falls back to rule-based scoring → service recovers → verify ML scoring resumes
- [ ] **All tests use Decimal strings for money** — no float assertions
- [ ] **Tenant isolation verified** in multi-tenant test scenarios

**New files:**
```
services/scoring-service/tests/test_ml_e2e.py                                    # Python ML E2E
services/recovery-service/src/__tests__/integration/recovery-ai.e2e-spec.ts       # Recovery E2E
services/process-engine/src/__tests__/integration/monitoring-alerts.e2e-spec.ts   # Monitoring E2E
services/process-engine/src/__tests__/integration/scoring-dual-model.e2e-spec.ts  # Dual scoring E2E
services/process-engine/src/__tests__/integration/full-ai-lifecycle.e2e-spec.ts   # Full lifecycle
```

---

### Task 9: Notification Template Persistence (BA-Identified Gap)
**Points:** 5 | **Priority:** Medium | **Service:** `notification-service`

The admin portal has a notification template editor (step-notifications.tsx in the product wizard) and 10 hard-coded templates exist in template-renderer.ts. However, there is NO database persistence — templates configured via the portal are lost on page refresh. This task makes notification template management functional end-to-end.

**Reference:** `Docs/09-integrations.md` §6.1 FR-NS-002.1, FR-NS-002.2

**Acceptance Criteria:**
- [ ] **Prisma model:** Create `NotificationTemplate` model: id (UUIDv7), tenantId, productId, eventType, channel (sms/email/push), templateBody, language (default: en), isActive, version, createdAt, updatedAt, deletedAt
- [ ] **Database migration:** Backward-compatible migration adding the notification_templates table
- [ ] **NotificationTemplateCrudService:** Full CRUD with tenant isolation. Versioning — updating a template creates a new version, preserving history
- [ ] **GraphQL mutations:** `createNotificationTemplate`, `updateNotificationTemplate`, `deleteNotificationTemplate` (soft delete). Queries: `notificationTemplates(productId, eventType, channel)`, `notificationTemplate(id)`
- [ ] **Wire admin portal:** Update `step-notifications.tsx` to persist templates via GraphQL instead of local state only
- [ ] **Seed default templates:** Migrate the 10 existing hard-coded templates from `template-renderer.ts` into DB seed data
- [ ] **Update template-renderer:** Read templates from DB first, fall back to hard-coded defaults if not found
- [ ] **All mutations accept `idempotencyKey`**
- [ ] **Unit tests** for CRUD service, template versioning, renderer fallback

**New files:**
```
services/notification-service/src/templates/notification-template.service.ts
services/notification-service/src/templates/notification-template.resolver.ts
services/notification-service/src/templates/dto/create-template.dto.ts
services/notification-service/src/templates/dto/update-template.dto.ts
services/notification-service/src/templates/__tests__/notification-template.spec.ts
packages/database/prisma/migrations/XXXXXX_add_notification_templates/migration.sql
packages/database/prisma/seed/notification-templates.seed.ts
```

**Files to modify:**
```
packages/database/prisma/schema.prisma                                    # Add NotificationTemplate model
services/notification-service/src/notification-service.module.ts           # Register template providers
services/notification-service/src/adapters/template-renderer.ts           # Read from DB, fallback to defaults
apps/admin-portal/src/components/products/step-notifications.tsx          # Wire to GraphQL persistence
```

---

## Execution Order

```
Task 1 (3pts, Wallet Ext) ────────┐
        │                          │
        ▼                          │
Task 2 (13pts, Python ML) ────────┤── Wave 1 + 2 (Task 2 depends on Task 1)
                                   │
Task 3 (13pts, Recovery AI) ──────┤── Wave 1 (independent)
                                   │
Task 6 (8pts, Platform Portal) ───┤── Wave 1 (independent)
                                   │
Task 9 (5pts, Notif Templates) ───┘── Wave 1 (independent)
        │
        ▼
Task 5 (5pts, Scoring Bridge) ──── Wave 2 — Depends on Task 2 (Python ML endpoints)
        │
Task 7 (5pts, Admin E2E) ─────── Wave 2 — Can start after Task 6
        │
        ▼
Task 4 (8pts, Monitoring) ─────── Wave 3 — Depends on Task 3 (recovery) + Task 5 (bridge)
        │
        ▼
Task 8 (5pts, AI/ML E2E) ─────── Wave 4 — Depends on Tasks 2, 3, 4, 5
```

**Recommended parallel execution:**
1. **Wave 1:** Task 1 (3pts) starts first → then Tasks 2 + 3 + 6 + 9 in parallel (39pts total in wave)
2. **Wave 2:** Tasks 5 + 7 (bridge + admin E2E — 10pts)
3. **Wave 3:** Task 4 (monitoring — 8pts)
4. **Wave 4:** Task 8 (E2E tests — 5pts)

**Note:** Task 1 is the critical path item — it must complete before Task 2 can ingest wallet features. However, Task 2 can start its non-wallet work (model training infrastructure, registry, explainability, drift detection, scorecard config) in parallel with Task 1. Only the feature engineering pipeline's wallet-sourced features are blocked.

---

## Appendix A: Key Existing Interfaces

### IWalletAdapter (current — to be extended in Task 1)
```typescript
export interface IWalletAdapter {
  transfer(params: TransferParams): Promise<TransferResult>;
  collect?(params: CollectionParams): Promise<TransferResult>;
  getBalance?(walletId: string): Promise<BalanceInfo>;
  getTransactionStatus?(reference: string): Promise<TransactionStatusResult>;
  // Task 1 adds:
  // getCustomerInfo(walletId: string): Promise<WalletCustomerInfo>;
  // getTransactionHistory(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]>;
  // registerWebhook?(events: string[], callbackUrl: string): Promise<WebhookRegistration>;
}
```

### IScoringResult (packages/shared-types)
```typescript
interface IScoringResult extends ITenantScoped {
  id: string;
  customerId: string;
  productId: string;
  modelType: ScoringModelType;  // rule_based | ml_model | hybrid
  modelVersion?: string;
  score: string;                 // Decimal as string
  scoreRangeMin: string;
  scoreRangeMax: string;
  probabilityDefault?: string;
  riskTier: RiskTier;           // low | medium | high | critical
  recommendedLimit?: string;
  contributingFactors?: Record<string, unknown>;
  inputFeatures?: Record<string, unknown>;
  confidence?: string;           // 0–1 as string
  context: ScoringContext;       // application | review | renewal | monitoring
  createdAt: Date;
}
```

### RecoveryStrategy (existing in recovery-service)
```typescript
interface RecoveryStrategy {
  type: string;
  description: string;
  successProbability: number;    // 0–1
  estimatedRecovery: string;     // Decimal string
  priority: number;
}
```

### Python Scoring API (existing POST /score)
```python
class ScoringRequest(BaseModel):
    customer_id: str
    tenant_id: str
    features: dict          # Raw customer features
    requested_amount: str   # Decimal as string

class ScoringResponse(BaseModel):
    score: str              # 0–1000 as string
    probability_of_default: str
    recommended_limit: str
    risk_tier: str          # low | medium | high | critical
    contributing_factors: list[ContributingFactor]
    model_version: str
    confidence: str         # 0–1 as string
```

### Key Enums (packages/shared-types)
```typescript
enum ScoringModelType { RULE_BASED = 'rule_based', ML_MODEL = 'ml_model', HYBRID = 'hybrid' }
enum ScoringContext { APPLICATION = 'application', REVIEW = 'review', RENEWAL = 'renewal', MONITORING = 'monitoring' }
enum RiskTier { LOW = 'low', MEDIUM = 'medium', HIGH = 'high', CRITICAL = 'critical' }
enum ContractStatus { ACTIVE, PERFORMING, DUE, OVERDUE, DELINQUENT, DEFAULT, WRITTEN_OFF, SETTLED, CANCELLED }
enum ContractClassification { PERFORMING, SPECIAL_MENTION, SUBSTANDARD, DOUBTFUL, LOSS }
```

---

## Appendix B: New Event Types to Add

```typescript
// Add to packages/event-contracts/src/events.enum.ts
// Recovery events
RECOVERY_STRATEGY_RECOMMENDED = 'recovery.strategy_recommended',
RECOVERY_STRATEGY_APPLIED = 'recovery.strategy_applied',
RECOVERY_OUTCOME_RECORDED = 'recovery.outcome_recorded',
LOAN_RESTRUCTURED = 'loan.restructured',

// Monitoring events
MONITORING_RISK_CHANGED = 'monitoring.risk_changed',
MONITORING_ALERT_TRIGGERED = 'monitoring.alert_triggered',
MONITORING_ALERT_ACKNOWLEDGED = 'monitoring.alert_acknowledged',
ADAPTIVE_ACTION_EXECUTED = 'monitoring.adaptive_action_executed',

// ML model events
ML_MODEL_TRAINED = 'ml_model.trained',
ML_MODEL_ACTIVATED = 'ml_model.activated',
ML_MODEL_DRIFT_DETECTED = 'ml_model.drift_detected',
```

---

## Appendix C: New Shared Types to Add

```typescript
// packages/shared-types/src/enums/recovery.enum.ts
enum RecoveryStrategyType {
  GRACE_PERIOD = 'grace_period',
  RESTRUCTURE = 'restructure',
  PARTIAL_SETTLEMENT = 'partial_settlement',
  FEE_RECOVERY = 'fee_recovery',
  ESCALATION = 'escalation',
  PAYMENT_HOLIDAY = 'payment_holiday',
}

enum RecoveryOutcomeStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// packages/shared-types/src/enums/monitoring.enum.ts
enum AlertSeverity { INFO = 'info', WARNING = 'warning', CRITICAL = 'critical' }
enum AlertStatus { ACTIVE = 'active', ACKNOWLEDGED = 'acknowledged', RESOLVED = 'resolved' }
enum AdaptiveActionType {
  CREDIT_FREEZE = 'credit_freeze',
  SCHEDULE_ADJUSTMENT = 'schedule_adjustment',
  EARLY_WARNING = 'early_warning',
  RECOVERY_ESCALATION = 'recovery_escalation',
}

// packages/shared-types/src/enums/scoring.enum.ts (additions)
enum ScoringStrategy {
  RULE_ONLY = 'rule_only',
  ML_ONLY = 'ml_only',
  HIGHER = 'higher',
  LOWER = 'lower',
  WEIGHTED_AVERAGE = 'weighted_average',
}

// packages/shared-types/src/interfaces/wallet-customer-info.interface.ts (NEW)
interface IWalletCustomerInfo {
  walletId: string;
  fullName: string;          // Masked in logs
  kycLevel: string;          // e.g., 'tier_1', 'tier_2', 'tier_3'
  accountStatus: string;
  accountAge: number;        // days
  currency: string;
}

// packages/shared-types/src/interfaces/wallet-transaction.interface.ts (NEW)
interface IWalletTransaction {
  transactionId: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: string;            // Decimal as string
  currency: string;
  counterpartyId?: string;   // Anonymized for network analysis
  category?: string;         // e.g., 'salary', 'transfer', 'merchant', 'utility'
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}
```

---

## Appendix D: Files to Modify (Existing)

| # | File | Change |
|---|------|--------|
| 1 | `services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts` | Add 3 new methods |
| 2 | `services/integration-service/src/adapters/mtn-momo/mtn-momo.adapter.ts` | Implement getCustomerInfo, getTransactionHistory |
| 3 | `services/integration-service/src/adapters/mpesa/mpesa.adapter.ts` | Implement getCustomerInfo, getTransactionHistory |
| 4 | `services/integration-service/src/adapters/generic/generic-wallet.adapter.ts` | Implement getCustomerInfo, getTransactionHistory |
| 5 | `apps/graphql-server/src/graphql/resolvers/integration.resolver.ts` | Add delete mutation, idempotency, field masking |
| 6 | `services/scoring-service/app/main.py` | Register new routers (models, training, scorecards) |
| 7 | `services/scoring-service/app/config.py` | Add ML config |
| 8 | `services/scoring-service/app/routers/score.py` | Enhance with dual-model |
| 9 | `services/scoring-service/app/schemas/scoring.py` | Add model_type, strategy fields |
| 10 | `services/scoring-service/requirements.txt` | Add xgboost, shap, scikit-learn, numpy |
| 11 | `services/recovery-service/src/recovery-strategy.service.ts` | Integrate AI recommender |
| 12 | `services/recovery-service/src/recovery-service.module.ts` | Register new providers + resolver |
| 13 | `services/process-engine/src/scoring/scoring.service.ts` | Integrate dual-model strategy |
| 14 | `services/process-engine/src/scoring/scoring.module.ts` | Register new providers |
| 15 | `services/process-engine/src/monitoring/monitoring.service.ts` | Enhance risk calculation |
| 16 | `services/process-engine/src/process-engine.module.ts` | Register monitoring providers |
| 17 | `apps/scheduler/src/scheduler.module.ts` | Register monitoring job |
| 18 | `apps/admin-portal/src/app/(portal)/layout.tsx` | Add platform nav for super-admins |
| 19 | `apps/admin-portal/package.json` | Add playwright |
| 20 | `packages/event-contracts/src/events.enum.ts` | Add recovery + monitoring + ML events |
| 21 | `packages/shared-types/src/enums/` | Add recovery, monitoring, scoring enums |
| 22 | `packages/shared-types/src/interfaces/index.ts` | Export new wallet interfaces |
| 23 | `packages/database/prisma/schema.prisma` | Add NotificationTemplate model |
| 24 | `services/notification-service/src/notification-service.module.ts` | Register template providers |
| 25 | `services/notification-service/src/adapters/template-renderer.ts` | Read from DB, fallback |
| 26 | `apps/admin-portal/src/components/products/step-notifications.tsx` | Wire to GraphQL |

---

## Appendix E: Complete New File Tree

```
# Task 1 — Extend IWalletAdapter
packages/shared-types/src/interfaces/wallet-customer-info.interface.ts
packages/shared-types/src/interfaces/wallet-transaction.interface.ts

# Task 2 — ML Credit Scoring Service
services/scoring-service/app/models/ml_model.py
services/scoring-service/app/models/feature_engineering.py
services/scoring-service/app/models/model_registry.py
services/scoring-service/app/models/explainability.py
services/scoring-service/app/models/drift_detection.py
services/scoring-service/app/models/dual_scoring.py
services/scoring-service/app/models/scorecard_config.py
services/scoring-service/app/routers/models.py
services/scoring-service/app/routers/training.py
services/scoring-service/app/routers/scorecards.py
services/scoring-service/app/schemas/models.py
services/scoring-service/app/schemas/training.py
services/scoring-service/app/schemas/scorecards.py
services/scoring-service/tests/test_ml_model.py
services/scoring-service/tests/test_feature_engineering.py
services/scoring-service/tests/test_model_registry.py
services/scoring-service/tests/test_drift_detection.py
services/scoring-service/tests/test_dual_scoring.py
services/scoring-service/tests/test_scorecard_config.py

# Task 3 — AI Recovery Strategy Engine
services/recovery-service/src/predictive-risk.service.ts
services/recovery-service/src/strategy-recommender.service.ts
services/recovery-service/src/outcome-tracker.service.ts
services/recovery-service/src/restructuring.service.ts
services/recovery-service/src/network-analysis.service.ts        # STUB/MOCK
services/recovery-service/src/recovery.resolver.ts
services/recovery-service/src/dto/recovery-strategy.dto.ts
services/recovery-service/src/dto/restructuring.dto.ts
services/recovery-service/src/dto/outcome.dto.ts
services/recovery-service/src/__tests__/predictive-risk.spec.ts
services/recovery-service/src/__tests__/strategy-recommender.spec.ts
services/recovery-service/src/__tests__/outcome-tracker.spec.ts
services/recovery-service/src/__tests__/restructuring.spec.ts
services/recovery-service/src/__tests__/network-analysis.spec.ts

# Task 4 — Real-Time Monitoring & Alerting
services/process-engine/src/monitoring/alert-rules.service.ts
services/process-engine/src/monitoring/alert.service.ts
services/process-engine/src/monitoring/adaptive-actions.service.ts
services/process-engine/src/monitoring/monitoring.resolver.ts
services/process-engine/src/monitoring/dto/alert-rule.dto.ts
services/process-engine/src/monitoring/dto/risk-profile.dto.ts
services/process-engine/src/monitoring/dto/alert.dto.ts
services/process-engine/src/monitoring/__tests__/alert-rules.spec.ts
services/process-engine/src/monitoring/__tests__/alert.spec.ts
services/process-engine/src/monitoring/__tests__/adaptive-actions.spec.ts
apps/scheduler/src/jobs/monitoring.job.ts

# Task 5 — NestJS ↔ Python Scoring Bridge
services/process-engine/src/scoring/ml-scoring.client.ts
services/process-engine/src/scoring/dual-scoring.strategy.ts
services/process-engine/src/scoring/credit-limit.service.ts
services/process-engine/src/scoring/__tests__/ml-scoring.client.spec.ts
services/process-engine/src/scoring/__tests__/dual-scoring.strategy.spec.ts
services/process-engine/src/scoring/__tests__/credit-limit.spec.ts

# Task 6 — Platform Portal
apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx
apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx
apps/admin-portal/src/app/(portal)/platform/tenants/create/page.tsx
apps/admin-portal/src/components/platform/tenant-list-table.tsx
apps/admin-portal/src/components/platform/tenant-detail-tabs.tsx
apps/admin-portal/src/components/platform/tenant-create-wizard.tsx
apps/admin-portal/src/components/platform/sp-management.tsx
apps/admin-portal/src/app/(portal)/platform/layout.tsx

# Task 7 — Admin Portal E2E Tests
apps/admin-portal/playwright.config.ts
apps/admin-portal/e2e/auth.spec.ts
apps/admin-portal/e2e/dashboard.spec.ts
apps/admin-portal/e2e/products.spec.ts
apps/admin-portal/e2e/customers.spec.ts
apps/admin-portal/e2e/loans.spec.ts
apps/admin-portal/e2e/collections.spec.ts
apps/admin-portal/e2e/reports.spec.ts
apps/admin-portal/e2e/fixtures/mock-data.ts
apps/admin-portal/e2e/fixtures/auth.setup.ts

# Task 8 — AI/ML E2E Tests
services/scoring-service/tests/test_ml_e2e.py
services/recovery-service/src/__tests__/integration/recovery-ai.e2e-spec.ts
services/process-engine/src/__tests__/integration/monitoring-alerts.e2e-spec.ts
services/process-engine/src/__tests__/integration/scoring-dual-model.e2e-spec.ts
services/process-engine/src/__tests__/integration/full-ai-lifecycle.e2e-spec.ts

# Task 9 — Notification Template Persistence
services/notification-service/src/templates/notification-template.service.ts
services/notification-service/src/templates/notification-template.resolver.ts
services/notification-service/src/templates/dto/create-template.dto.ts
services/notification-service/src/templates/dto/update-template.dto.ts
services/notification-service/src/templates/__tests__/notification-template.spec.ts
packages/database/prisma/migrations/XXXXXX_add_notification_templates/migration.sql
packages/database/prisma/seed/notification-templates.seed.ts
```

---

## Appendix F: Critical Rules Reminder

1. **Money as string:** All monetary amounts are `string` (Decimal). Never use `float` or `number`. Python: `str(Decimal(...))`. TypeScript: `Decimal` from Prisma.
2. **Banker's rounding:** Round half to even for all financial math. Use `bankersRound()` from `@lons/common`.
3. **Tenant isolation:** Every query must include `tenantId`. No cross-tenant data access. Set `app.current_tenant` PostgreSQL session variable.
4. **PII masking:** Phone → `+233***7890`, NationalID → `GHA-***-XXX`, email → `a***@b.com`. PII must NEVER appear in logs.
5. **Idempotency:** All mutations accept `idempotencyKey`. Same key = same result, no duplicates.
6. **Soft deletes:** Use `deletedAt` — no hard deletes on business data.
7. **Append-only:** Ledger entries and audit logs are append-only — no updates, no deletes.
8. **Event-driven:** All state transitions emit events to EventBus. Consumers must be idempotent.
9. **UUIDv7:** All primary keys use time-sortable UUID v7.
10. **Cursor pagination:** All list queries use Relay connections pattern (cursor-based).
