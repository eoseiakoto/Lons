# Sprint 3 — Development Brief (Apr 24 – May 7, 2026)

**Objective:** Complete Phase 4 — Admin Portal. The Next.js admin portal has scaffolding (~60% done: pages with basic listings, auth, layout, glassmorphism design system). This sprint finishes all detail views, forms, workflows, and polish to make the portal production-ready.
**Total Story Points:** 68
**Deadline:** May 7, 2026
**Prerequisites:** Sprints 1–2 complete (all backend services, GraphQL resolvers, and event contracts are in place).

---

## Existing Code Inventory

Before building, review what already exists — **extend, don't rewrite**:

| Area | File | Lines | Status |
|---|---|---|---|
| Login page | `apps/admin-portal/src/app/login/page.tsx` | 91 | Complete |
| Auth context | `apps/admin-portal/src/lib/auth-context.tsx` | 113 | Complete |
| Apollo client | `apps/admin-portal/src/lib/apollo-client.tsx` | 31 | Complete |
| Dashboard | `apps/admin-portal/src/app/(portal)/dashboard/page.tsx` | 88 | Basic metrics only |
| Product list | `apps/admin-portal/src/app/(portal)/products/page.tsx` | 71 | Listing works |
| Product detail | `apps/admin-portal/src/app/(portal)/products/[id]/page.tsx` | 86 | Partial stub |
| Product create | `apps/admin-portal/src/app/(portal)/products/new/page.tsx` | 85 | Partial stub |
| Customer list | `apps/admin-portal/src/app/(portal)/customers/page.tsx` | 62 | Listing works |
| Customer detail | `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx` | 48 | Partial stub |
| Contract list | `apps/admin-portal/src/app/(portal)/loans/contracts/page.tsx` | 68 | Listing works |
| Contract detail | `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx` | 82 | Partial |
| Application queue | `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx` | 48 | Basic listing |
| Collections | `apps/admin-portal/src/app/(portal)/collections/page.tsx` | 37 | Metrics only |
| Reports | `apps/admin-portal/src/app/(portal)/reports/page.tsx` | 70 | PAR only |
| Settings | `apps/admin-portal/src/app/(portal)/settings/page.tsx` | 30 | Hub links |
| Users | `apps/admin-portal/src/app/(portal)/settings/users/page.tsx` | 47 | Partial |
| Audit log | `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx` | 65 | Basic viewer |
| Sidebar | `apps/admin-portal/src/components/layout/sidebar.tsx` | 73 | Complete |
| Header | `apps/admin-portal/src/components/layout/header.tsx` | 39 | Complete |
| DataTable | `apps/admin-portal/src/components/ui/data-table.tsx` | 49 | Complete |
| MetricCard | `apps/admin-portal/src/components/ui/metric-card.tsx` | 28 | Complete |
| StatusBadge | `apps/admin-portal/src/components/ui/status-badge.tsx` | 13 | Complete |
| Utilities | `apps/admin-portal/src/lib/utils.ts` | 39 | Complete |

### Available GraphQL Resolvers (backend is ready)

| Resolver | Queries | Mutations |
|---|---|---|
| Auth | `me`, `validateToken` | `login`, `loginBySlug`, `refreshToken` |
| Tenant | `tenants`, `tenant` | `createTenant`, `updateTenant` |
| Product | `products`, `product` | `createProduct`, `updateProduct`, `activateProduct`, `suspendProduct` |
| Customer | `customers`, `customer` | `addToBlacklist`, `removeFromBlacklist` |
| LoanRequest | `loanRequests`, `loanRequest` | `createLoanRequest`, `processLoanRequest`, `acceptOffer`, `declineOffer` |
| Contract | `contracts`, `contract`, `repaymentSchedule` | — |
| Repayment | `repayments`, `repayment`, `repaymentMetrics` | `createRepayment`, `allocateRepayment` |
| Collections | `collections`, `collectionsMetrics` | `createCollectionAction`, `updateCollectionAction` |
| Settlement | `settlements`, `settlementSummary` | `generateSettlement`, `finalizeSettlement` |
| Reconciliation | `reconciliationBatches`, `reconciliationDetails` | `runReconciliation` |
| Lender | `lenders`, `lender` | `createLender`, `updateLender` |

### Design System

- **Theme:** Dark glassmorphism (glass, glass-input, glass-button, glass-button-primary classes in globals.css)
- **Icons:** Lucide React 0.344.0
- **Styling:** Tailwind CSS 3.4.0
- **State:** Apollo Client 3.9.0 with in-memory cache
- **Pagination:** Relay cursor-based (all list queries return edges/nodes/pageInfo)

---

## Task 1: Executive Dashboard — Metrics, Trend Charts, and Alerts (High | 8 pts)
**Monday.com Item ID:** 11607310649

### What to build
Extend `apps/admin-portal/src/app/(portal)/dashboard/page.tsx` (88 lines) from basic metrics into a full executive dashboard per FR-DB-001:

1. **Key metrics panel** — Display in MetricCard grid: total active loans (count + value), disbursements today/this week/this month, repayments collected today/this week/this month, PAR 1/7/30, NPL ratio, new applications today, approval rate, revenue earned (current period). Wire to existing `repaymentMetrics`, `settlementSummary`, and `collectionsMetrics` GraphQL queries.
2. **Period filters** — Add filter bar at top: product type dropdown, date range picker (today/this week/this month/custom), customer segment. Filters apply to all metrics and charts.
3. **Trend charts** — Add 4 chart components using Recharts (already in project or add): disbursement volume over time (bar chart), repayment collection over time (line chart), PAR trends (area chart), new customer acquisition (line chart). Use the analytics data from GraphQL queries.
4. **Alerts panel** — Bottom section showing actionable alerts: overdue reconciliation exceptions, breached SLA applications, settlement runs pending approval, broken promises-to-pay. Each alert links to its respective detail page.

### Acceptance Criteria
- [ ] All FR-DB-001.1 metrics displayed with real GraphQL data
- [ ] Filters (product, date range, segment) update all metrics and charts
- [ ] 4 trend charts render with time-series data
- [ ] Alerts panel shows count + link to detail for each alert type
- [ ] Responsive: 3-column grid on desktop, 2 on tablet, 1 on mobile
- [ ] Loading skeletons shown while data fetches

### Reference
- `Docs/08-admin-portal.md` §2 (Dashboard) — FR-DB-001
- Existing resolvers: `repaymentMetrics`, `collectionsMetrics`, `settlementSummary`

---

## Task 2: Product Management — Multi-Step Create Wizard and Edit with Versioning (Critical | 13 pts)
**Monday.com Item ID:** 11607320289

### What to build
Replace the product create/edit stubs with a full multi-step wizard per FR-PM-001 and FR-PM-002:

1. **Product list enhancements** — Add to existing list page: status filter (draft/active/suspended/retired), product type filter, active contract count column, sort by creation date. Existing page at `products/page.tsx` (71 lines).
2. **Multi-step create wizard** (`products/new/page.tsx`) — 7 steps with progress indicator:
   - **Step 1: Basic Info** — Product name, code, type (overdraft/micro_loan/bnpl/invoice_factoring), currency (GHS/KES/NGN/UGX/TZS), description. Type selection changes available fields in subsequent steps.
   - **Step 2: Financial Terms** — Min/max amount, min/max tenor (days), interest rate model (flat/reducing_balance), annual interest rate, rate tiers (optional — amount-based tiers). Use Decimal input validation.
   - **Step 3: Fees** — Origination fee (flat or percentage), service fee, late payment penalty (flat or percentage + grace days), insurance fee. Each fee: name, type, amount/rate, when charged.
   - **Step 4: Eligibility** — Min credit score, min KYC level, max active loans, blacklist check, min account age, custom rules (JSON editor for advanced users).
   - **Step 5: Approval Workflow** — Auto-approve threshold (amount below which auto-approve), manual review conditions, escalation rules, SLA (hours to review).
   - **Step 6: Notifications** — Template selection for each event: application received, approved, rejected, disbursed, repayment due, repayment received, overdue, default.
   - **Step 7: Review & Activate** — Summary of all configured values. "Save as Draft" and "Activate" buttons. Activate calls `createProduct` then `activateProduct` mutations.
3. **Validation per step** — Each step validates before allowing "Next". Decimal validation for all money fields. Required fields highlighted. Error messages inline.
4. **Product detail/edit** (`products/[id]/page.tsx`) — Full read view of all product config. "Edit" button opens same wizard pre-filled. On save, calls `updateProduct` mutation (creates new version). Show version history with diff view (changed fields highlighted).
5. **Active contract warning** — When editing a product with active contracts, show warning banner: "Changes will only apply to future contracts. X active contracts will continue on current terms."

### Acceptance Criteria
- [ ] 7-step wizard with progress indicator, forward/back navigation
- [ ] All product types supported with type-specific field variations
- [ ] Validation enforced at each step (required fields, Decimal for money, min < max)
- [ ] Save as Draft and Activate workflows both functional
- [ ] Edit creates new version; version history with diff view visible
- [ ] Active contract warning displayed when applicable
- [ ] All mutations wired to GraphQL: `createProduct`, `updateProduct`, `activateProduct`, `suspendProduct`

### Reference
- `Docs/08-admin-portal.md` §3 (Product Management) — FR-PM-001, FR-PM-002
- `Docs/01-loan-portfolio.md` — Product type configurations
- `packages/shared-types/src/` — `IProduct` interface for all fields

---

## Task 3: Customer Search, Detail View with Tabs, and Operator Actions (High | 8 pts)
**Monday.com Item ID:** 11607295758

### What to build
Complete customer management per FR-CM-001 and FR-CM-002:

1. **Customer search** — Replace basic list with search-first interface. Search bar supporting: name, phone number, national ID, external ID, Lōns customer ID. Debounced search (300ms). Results in DataTable with: name, ID, phone (masked: +233***7890), KYC level badge, active loan count, risk status badge, total outstanding.
2. **Customer detail page** (`customers/[id]/page.tsx`) — Tabbed interface with 6 tabs:
   - **Profile tab** — Personal info (name, phone, email, DOB — PII masked unless user has `view_pii` permission), KYC level + documents, consent status, registration date, external IDs.
   - **Credit Summary tab** — Current credit score, score breakdown (if available), credit limit, utilization percentage, score history chart (line chart over time).
   - **Contracts tab** — All loans (active + historical) in DataTable. Columns: contract number, product, amount, outstanding, status badge, DPD, dates. Click navigates to contract detail.
   - **Repayment History tab** — All payments across all contracts. Columns: date, contract, amount, allocation (principal/interest/fees), status. Summary totals at top.
   - **Financial Profile tab** — Transaction patterns, income indicators, wallet activity summary (from scoring data if available).
   - **Activity Log tab** — All system events for this customer: loan applications, disbursements, repayments, status changes, notifications sent. Chronological with timestamp and event type badge.
3. **Operator actions** — Action buttons in customer detail header:
   - "Add to Blacklist" / "Remove from Blacklist" — Calls `addToBlacklist` / `removeFromBlacklist` mutations. Confirmation modal with reason field.
   - "Add to Watchlist" — Similar flow.
   - "Refresh Credit Score" — Triggers manual score recalculation (if scoring endpoint exists).
   - "Add Note" — Free-text note attached to customer record.

### Acceptance Criteria
- [ ] Search works across all 5 search fields with debounce
- [ ] All 6 tabs render with real GraphQL data
- [ ] PII masked by default, revealed only with `view_pii` permission
- [ ] Blacklist/Watchlist actions work with confirmation modals
- [ ] Contract rows clickable → navigate to contract detail
- [ ] Activity log shows chronological events with proper badges
- [ ] Responsive tab layout (horizontal on desktop, dropdown on mobile)

### Reference
- `Docs/08-admin-portal.md` §4 (Customer Management) — FR-CM-001, FR-CM-002
- `Docs/10-security-compliance.md` — PII masking rules

---

## Task 4: Loan Operations — Application Review Queue and Contract Detail View (Critical | 13 pts)
**Monday.com Item ID:** 11607295760

### What to build
Complete loan operations screens per FR-LO-001, FR-LO-002, FR-LO-003:

1. **Application review queue** (`loans/applications/page.tsx`) — Full operator review interface:
   - Queue table with columns: customer name, product, requested amount, credit score, risk tier badge, AI recommendation (approve/decline/review), time in queue, SLA status (green/amber/red based on configured hours).
   - Sort by: priority (default), time in queue, amount, score.
   - Filter by: product type, risk tier, AI recommendation, SLA status.
   - Click row → opens review panel (slide-out drawer or dedicated page).
2. **Application review panel** — Full context for decision:
   - Customer summary (name, KYC, score, active loans — pull from customer query).
   - Request details (product, amount, tenor, purpose).
   - Scoring breakdown (rule results, score components if available).
   - AI recommendation with confidence and reasoning.
   - **Action buttons:** Approve (optional: modify amount/tenor before approving), Reject (mandatory reason from dropdown + free text), Escalate (to higher authority role). All call `processLoanRequest` mutation with appropriate status.
3. **Active contracts list** (`loans/contracts/page.tsx`) — Enhance existing page:
   - Filters: product type, status (performing/overdue/delinquent/default), date range, amount range, customer segment.
   - Bulk actions toolbar: bulk export (CSV), bulk send notification, bulk assign to collector.
   - Status column with color-coded badges matching aging classification.
4. **Contract detail view** (`loans/contracts/[id]/page.tsx`) — Full contract information:
   - **Header** — Contract number, customer name (linked), product name, status badge, DPD.
   - **Summary cards** — Principal, outstanding balance breakdown (principal/interest/fees/penalties), next payment date + amount.
   - **Repayment schedule tab** — Full schedule table: installment #, due date, amount, principal portion, interest portion, status (paid/due/overdue/waived), paid date, paid amount.
   - **Payment history tab** — All actual payments: date, amount, allocation waterfall, reference.
   - **Ledger tab** — All ledger entries for this contract from the ledger service. Columns: date, type badge, description, debit, credit, running balance.
   - **Timeline tab** — State transition history: created → disbursed → performing → overdue etc. with timestamps and operators.
   - **Operator actions:** Initiate restructuring (modal with new terms), waive penalty (approval required — modal with reason), record manual payment (amount + reference + date), add collection note.

### Acceptance Criteria
- [ ] Application queue displays all pending reviews with SLA indicators
- [ ] Approve/Reject/Escalate actions work with proper mutations
- [ ] Approve supports term modification (amount/tenor)
- [ ] Reject requires reason selection
- [ ] Contract list supports all filters and bulk actions
- [ ] Contract detail shows all 4 tabs with real data
- [ ] Operator actions (restructure, waive, manual payment) functional with modals
- [ ] Ledger tab shows accurate running balance from ledger service

### Reference
- `Docs/08-admin-portal.md` §5 (Loan Operations) — FR-LO-001, FR-LO-002, FR-LO-003
- GraphQL: `loanRequests`, `processLoanRequest`, `contracts`, `contract`, `repaymentSchedule`

---

## Task 5: Collections Dashboard and Recovery Queue with Agent Workflows (High | 8 pts)
**Monday.com Item ID:** 11607291169

### What to build
Complete collections screens per FR-CR-001 and FR-CR-002:

1. **Collections dashboard** (`collections/page.tsx`) — Extend from metrics-only to full dashboard:
   - **Summary cards:** Total overdue amount, overdue contract count, recovery rate (current month), promises-to-pay pending, broken promises this week.
   - **Aging bucket chart** — Bar chart showing contract count and value by aging bucket: 1-7 DPD, 8-30 DPD, 31-60 DPD, 61-90 DPD, 90+ DPD. Use `collectionsMetrics` query.
   - **Recovery rate trend** — Line chart showing monthly recovery rate over past 6 months.
   - **Collector workload** — Table showing each collector agent: name, assigned count, total value, PTP count, actions logged today.
   - **AI recommendations pending** — List of AI-recommended strategies awaiting operator review.
2. **Collections queue** — New page or section (`collections/queue/page.tsx`):
   - Table: customer name, contract #, product, amount owed, DPD, classification badge, assigned agent, last action date, AI-recommended strategy.
   - Filters: DPD range, classification, assigned agent, has AI recommendation.
   - Sort: by DPD (default), amount, last action date.
3. **Collection action workflow** — Click queue item → action panel:
   - Contact history: all past collection actions (calls, reminders, PTPs) in timeline.
   - AI strategy recommendation with probability and expected recovery.
   - **Actions:** Log call attempt (outcome: reached/no answer/wrong number), Record PTP (promise date + amount), Send reminder (via notification service), Initiate restructuring (links to contract restructure flow), Escalate to external agency, Recommend write-off.
   - Each action calls `createCollectionAction` mutation.
4. **PTP tracking** — Visual indicator on queue items with active PTPs. Broken promises highlighted in red.

### Acceptance Criteria
- [ ] Dashboard shows all FR-CR-001.1 metrics with real data
- [ ] Aging bucket chart renders correctly
- [ ] Collections queue sortable and filterable
- [ ] All 6 action types functional via `createCollectionAction` mutation
- [ ] PTP tracking with broken promise highlighting
- [ ] AI recommendations displayed alongside manual actions
- [ ] Collector workload distribution visible

### Reference
- `Docs/08-admin-portal.md` §6 (Collections & Recovery) — FR-CR-001, FR-CR-002
- `Docs/03-repayments-recovery.md` §4 (Collections Workflow)
- GraphQL: `collections`, `collectionsMetrics`, `createCollectionAction`

---

## Task 6: Reports — Standard Reports with Date Filters, CSV/PDF Export (High | 8 pts)
**Monday.com Item ID:** 11607290003

### What to build
Replace the PAR-only reports page with full reporting suite per FR-RPT-001:

1. **Reports hub** (`reports/page.tsx`) — Grid of report cards, each with title, description, and "Generate" button:
   - Disbursement Report (daily/weekly/monthly)
   - Repayment Collection Report
   - Portfolio Quality Report (PAR, NPL, provisioning)
   - Revenue & Settlement Report
   - Reconciliation Report
   - Customer Acquisition Report
   - Product Performance Report
   - Collections Performance Report
2. **Report viewer** — Each report opens a dedicated view with:
   - **Filter bar:** Date range (required), product type (optional), customer segment (optional).
   - **Data table:** Report-specific columns rendered in DataTable. Sortable columns.
   - **Summary section:** Totals, averages, key highlights at top of report.
   - **Charts:** Each report includes 1-2 relevant visualizations (bar/line/pie as appropriate).
3. **Export** — Two export buttons on every report:
   - **CSV export** — Client-side: serialize table data to CSV and trigger download. Include headers, formatted dates, Decimal amounts as strings.
   - **PDF export** — Client-side: use a library (e.g., `@react-pdf/renderer` or `html2canvas` + `jsPDF`) to generate a formatted PDF with title, date range, table, and charts. Include tenant branding (logo, name) in header.
4. **Report data sources** — Wire to existing GraphQL queries:
   - Disbursement: `contracts` query filtered by disbursement date
   - Repayment: `repayments` query with date filter
   - Portfolio Quality: `collectionsMetrics` + contract status aggregation
   - Revenue: `settlements` + `settlementSummary`
   - Reconciliation: `reconciliationBatches`
   - Collections: `collectionsMetrics` + `collections` queue data

### Acceptance Criteria
- [ ] All 8 standard report types available from hub
- [ ] Date range filter works on every report
- [ ] Product and segment filters applied where relevant
- [ ] CSV export downloads correct data with proper formatting
- [ ] PDF export generates branded document with table + charts
- [ ] Summary totals accurate at top of each report
- [ ] At least 1 chart per report type

### Reference
- `Docs/08-admin-portal.md` §7 (Reporting) — FR-RPT-001, FR-RPT-002

---

## Task 7: Settings — Tenant Config, User Management, and Audit Log Viewer (High | 5 pts)
**Monday.com Item ID:** 11607291680

### What to build
Complete settings screens per FR-SET-001 and FR-SET-002:

1. **Settings hub** (`settings/page.tsx`) — Organized settings page with sections:
   - **Organization Profile** — Tenant name, logo upload, brand colors (primary, secondary), contact info. Calls `updateTenant` mutation.
   - **API Keys** — List existing API keys (masked), create new key (with scopes), revoke key. Display key only once on creation.
   - **Webhook Configuration** — List webhook endpoints, add new (URL, events to subscribe, secret). Test webhook button.
   - **Notification Templates** — List templates by event type. Edit template content (SMS/email body with variable placeholders).
   - **Integration Connections** — Show connected integrations (wallet providers, credit bureau, SMS provider) with status indicator (connected/disconnected/error).
2. **User management** (`settings/users/page.tsx`) — Full CRUD:
   - User list: name, email, role badge, status (active/suspended), last login.
   - Create user: name, email, role selection (dropdown from available roles), send invitation toggle.
   - Edit user: change role, suspend/reactivate.
   - Role permission matrix: expandable view showing which permissions each role has (read-only display, roles defined in backend).
3. **Audit log viewer** (`settings/audit-log/page.tsx`) — Enhance existing page:
   - Filters: user (dropdown), action type (dropdown: create/update/delete/login/export), date range, affected resource type.
   - Table: timestamp, user, action, resource type, resource ID, IP address.
   - Row expand → shows before/after diff (JSON diff view for changed fields).
   - Audit logs are read-only, no edit/delete.

### Acceptance Criteria
- [ ] Organization profile editable with logo upload
- [ ] API key CRUD works (key shown once on creation)
- [ ] User create/edit/suspend functional
- [ ] Role permission matrix displayed correctly
- [ ] Audit log filterable by user, action, date, resource
- [ ] Audit log row expand shows before/after diff
- [ ] All settings use optimistic UI updates

### Reference
- `Docs/08-admin-portal.md` §8 (Settings) — FR-SET-001, FR-SET-002
- `Docs/10-security-compliance.md` §4 (Audit Logging)

---

## Task 8: UI Polish — Shared Components, Responsive Layout, Error Boundaries, Loading States (Medium | 5 pts)
**Monday.com Item ID:** 11607295303

### What to build
Cross-cutting quality improvements across the entire admin portal:

1. **Shared UI components** — Create/extend in `apps/admin-portal/src/components/ui/`:
   - **Modal/Dialog** — Reusable confirmation and form modal (used by operator actions, delete confirmations).
   - **Drawer/SlideOut** — Side panel for review workflows (application review, collection action).
   - **DateRangePicker** — Used across dashboard, reports, filters.
   - **SearchInput** — Debounced search with clear button and loading indicator.
   - **FilterBar** — Composable filter bar with dropdown selects, applied filter chips.
   - **EmptyState** — Illustrated empty state for tables with no results.
   - **Skeleton** — Loading skeleton variants for MetricCard, DataTable rows, chart areas.
   - **Toast/Notification** — Success/error/info toast for mutation feedback.
   - **Breadcrumb** — Navigation breadcrumbs for detail pages (Dashboard > Customers > John Doe).
   - **Tabs** — Reusable tab component used in customer detail, contract detail.
2. **Responsive layout** — Ensure all pages work at:
   - Desktop (1280px+): full layout as designed
   - Tablet (768px–1279px): sidebar collapses to icons, 2-column grids
   - Mobile (< 768px): sidebar becomes hamburger menu, single column, tables become card views
3. **Error boundaries** — Wrap each major section (dashboard, products, customers, loans, collections, reports, settings) in React error boundaries. Show friendly error message with "Retry" button. Log errors.
4. **Loading states** — Every page and tab shows skeleton loading on initial fetch. Tables show skeleton rows. Charts show placeholder. Mutations show loading spinner on buttons with disabled state.
5. **Optimistic updates** — For common mutations (status changes, assignments, notes): update Apollo cache immediately, revert on error with toast notification.
6. **Accessibility basics** — Proper aria-labels on interactive elements, keyboard navigation for modals and drawers, focus trapping in modals, proper heading hierarchy.

### Acceptance Criteria
- [ ] All 10 shared components created and used across relevant pages
- [ ] Portal usable at desktop, tablet, and mobile breakpoints
- [ ] Error boundaries catch and display errors gracefully per section
- [ ] Every data-fetching page shows loading skeletons
- [ ] Optimistic updates for at least 3 common mutations
- [ ] Keyboard navigation works for modals and drawers
- [ ] No console errors in normal operation flow

### Reference
- `Docs/08-admin-portal.md` §1.2 (Design Requirements) — FR-PT-001 through FR-PT-005
- `Docs/12-non-functional.md` — Performance and usability requirements

---

## Execution Order

```
Task 8 (UI Components) ──→ All other tasks depend on shared components
      │
      ├──→ Task 1 (Dashboard)
      ├──→ Task 2 (Products)
      ├──→ Task 3 (Customers)
      ├──→ Task 4 (Loan Operations)
      ├──→ Task 5 (Collections)
      ├──→ Task 6 (Reports)
      └──→ Task 7 (Settings)
```

**Parallel tracks:**
- Track A: Task 8 (UI Components) — build first, all others consume these
- Track B: Tasks 1, 2, 3, 4, 5, 6, 7 — all run in parallel after Task 8

**Recommended execution:** Start Task 8 first (or concurrently with Task 1 since dashboard is mostly MetricCards + charts). Then Tasks 2 and 4 (critical) in parallel, followed by Tasks 3, 5, 6, 7 (high/medium).

---

## Rules (from CLAUDE.md)

- **Money display:** Format as string with currency — `"GHS 1,234.57"`. Use `formatMoney()` from `src/lib/utils.ts`.
- **PII masking:** Phone as `+233***7890`, national ID as `GHA-***-XXX`. Only reveal with `view_pii` permission check via auth context.
- **Pagination:** All list queries use Relay cursor-based pagination. Implement "Load More" or infinite scroll, not page numbers.
- **Multi-tenancy:** Tenant context comes from auth JWT — Apollo client attaches it automatically via auth link. No manual tenant handling needed in frontend.
- **Naming:** Components in PascalCase, files in kebab-case, GraphQL queries/mutations in camelCase.
- **Existing code:** Pages and components already exist — extend them, don't rewrite from scratch. Preserve the glassmorphism design system.
- **State management:** Apollo Client cache is the primary state store. Use `useQuery` / `useMutation` hooks. Local component state via `useState` for UI-only state (form inputs, open/close toggles).
