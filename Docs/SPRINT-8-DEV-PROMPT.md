# Sprint 8 — Claude Code Development Prompt

**Priority: HIGH — Feature completeness for SP prospect demos**
**Owner: Claude Code (DEV)**
**Date: 2026-04-10**
**Sprint Duration: 2 weeks**

This prompt covers 10 development items across three categories: Bugs/Fixes (3), Platform Portal (4), and SP Admin Portal (3). All items are frontend + backend work — no infrastructure changes needed.

**Important context:** The platform has two portals:
- **SP Admin Portal** (`apps/admin-portal/`) — used by Service Provider staff to manage their own loans, customers, products, lenders
- **Platform Portal** (`apps/platform-portal/`) — used by Lōns platform operators to manage all SPs (tenants), platform users, cross-tenant analytics

---

## Table of Contents

1. [Lender Management Page (Admin Portal)](#task-1)
2. [Lender & Stakeholder Detail Views (Admin Portal)](#task-2)
3. [Credit Scoring Visibility](#task-3)
4. [Platform User Management (Platform Portal)](#task-4)
5. [Audit Log Viewer (Platform Portal)](#task-5)
6. [SP Detail View with Insights (Platform Portal)](#task-6)
7. [In-App Messaging System](#task-7)
8. [Settlement Report & Revenue Insights (Admin Portal)](#task-8)
9. [SP Messaging & Notifications (Admin Portal)](#task-9)
10. [Funding Source Step in Product Wizard (Admin Portal)](#task-10)

---

<a id="task-1"></a>
## Task 1: Lender Management Page (Admin Portal)

**Monday.com ID:** 11708162407
**Category:** Bug/Fix — "Audit where Lender is added/configured"

### Problem

The `Lender` Prisma model exists (`packages/database/prisma/schema.prisma` lines 400-422) with full fields: name, licenseNumber, country, fundingCapacity, fundingCurrency, minInterestRate, maxInterestRate, settlementAccount (JSON), riskParameters (JSON), status. However, there is NO UI page in the admin portal to create, list, edit, or deactivate lenders. The only lender references in the admin portal are read-only displays on product detail and contract detail pages.

### What to Build

Create a full Lender CRUD management page at `apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx`.

### Implementation Details

**1. GraphQL Schema** — Add to `apps/graphql-server/`:

```graphql
type Lender {
  id: ID!
  name: String!
  licenseNumber: String
  country: String
  fundingCapacity: String  # Decimal as string
  fundingCurrency: String
  minInterestRate: String  # Decimal as string
  maxInterestRate: String  # Decimal as string
  settlementAccount: JSON
  riskParameters: JSON
  status: LenderStatus!
  products: [Product!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum LenderStatus { ACTIVE, SUSPENDED, INACTIVE }

input CreateLenderInput {
  name: String!
  licenseNumber: String
  country: String
  fundingCapacity: String
  fundingCurrency: String
  minInterestRate: String
  maxInterestRate: String
  settlementAccount: JSON
  riskParameters: JSON
}

input UpdateLenderInput {
  name: String
  licenseNumber: String
  country: String
  fundingCapacity: String
  fundingCurrency: String
  minInterestRate: String
  maxInterestRate: String
  settlementAccount: JSON
  riskParameters: JSON
  status: LenderStatus
}

# Queries
lenders(pagination: PaginationInput): LenderConnection!
lender(id: ID!): Lender

# Mutations
createLender(input: CreateLenderInput!): Lender!
updateLender(id: ID!, input: UpdateLenderInput!): Lender!
deactivateLender(id: ID!): Lender!
```

**2. Backend Resolver** — Create `apps/graphql-server/src/modules/lender/` with resolver, service, and module following the existing patterns in `apps/graphql-server/src/modules/`. The service must:
- Scope all queries to the current tenant (`tenantId` from JWT context)
- Use soft delete (`deletedAt`) — never hard delete
- Validate that a lender cannot be deactivated if it has active products

**3. Admin Portal Page** — Create these files:

- `apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx` — Route page
- `apps/admin-portal/src/components/lenders/lender-list.tsx` — Data table with columns: Name, License #, Country, Funding Capacity, Interest Rate Range, Status, Actions
- `apps/admin-portal/src/components/lenders/lender-form.tsx` — Create/Edit form in a Drawer (follow the pattern in `apps/admin-portal/src/components/settings/user-management.tsx`)
- `apps/admin-portal/src/components/lenders/lender-detail.tsx` — Detail drawer showing lender info + linked products

**4. Navigation** — Add "Lenders" to the Settings section in the sidebar navigation. Follow the existing sidebar pattern.

### Existing Patterns to Follow

- Data table: `apps/admin-portal/src/components/ui/data-table.tsx`
- Form in drawer: `apps/admin-portal/src/components/settings/user-management.tsx`
- Apollo queries: Use `gql` tag with `useQuery`/`useMutation` from `@apollo/client`
- Money formatting: `formatMoney()` from `@/lib/utils` — always pass amount as STRING
- Status badges: Use the glass card + colored pill pattern seen in existing components

---

<a id="task-2"></a>
## Task 2: Lender & Stakeholder Detail Views (Admin Portal)

**Monday.com ID:** 11708149659
**Category:** Bug/Fix — "Fix Lender and stakeholder detail views"

### Problem

When a user clicks on a Lender name (e.g., on a product detail page or contract detail page), there's nowhere to navigate. No lender detail view exists.

### What to Build

A lender detail page at `apps/admin-portal/src/app/(portal)/settings/lenders/[id]/page.tsx` showing:

1. **Lender profile card** — Name, license number, country, status badge, funding capacity, interest rate range
2. **Settlement account details** — Parsed from the `settlementAccount` JSON: bank name, account number (masked), branch code, swift code
3. **Risk parameters** — Parsed from the `riskParameters` JSON: max exposure, concentration limits, sector preferences
4. **Linked products** — Table of products assigned to this lender (from `Product.lenderId`). Columns: Code, Name, Type, Status. Click navigates to product detail.
5. **Linked contracts** — Table of active contracts under this lender (from `Contract.lenderId`). Columns: Contract #, Customer, Amount, Status, Days Past Due. Click navigates to contract detail.
6. **Funding utilization** — Visual indicator (progress bar or gauge) showing total disbursed via this lender vs. their `fundingCapacity`

### Implementation Details

- Query lender by ID with nested `products` and `contracts` relations
- Mask sensitive settlement account fields: show last 4 digits only
- All monetary amounts as strings, formatted with `formatMoney()`
- Follow the existing customer detail page pattern at `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx`

---

<a id="task-3"></a>
## Task 3: Credit Scoring Visibility

**Monday.com ID:** 11708159812
**Category:** Bug/Fix — "Add credit scoring visibility"

### Problem

The admin portal has a basic credit score display on the customer detail page (`apps/admin-portal/src/components/customers/tab-credit-summary.tsx`) showing score, credit limit, and utilization. However, it's missing the score factor breakdown and there's no predictive analytics dashboard.

### What to Build — Two Parts

**Part A: Per-Customer Score Factor Breakdown (Admin Portal)**

Enhance `tab-credit-summary.tsx` to show:

1. **Contributing factors chart** — The `ScoringResult.contributingFactors` JSON field contains factor name + weight pairs. Display as a horizontal bar chart or radar chart showing what drove the score (e.g., "Repayment History: +85", "Account Age: +60", "Utilization: -15").
2. **Score history** — Query the customer's `scoringResults` ordered by `createdAt` DESC. Show a line chart of score over time. Table below with: Date, Score, Risk Tier, Model Version, Context (pre-qualification / application / review).
3. **Risk tier explanation** — Color-coded badge with meaning: `low_risk` (green), `medium_risk` (amber), `high_risk` (red), `very_high_risk` (dark red).
4. **Recommended limit** — Show `recommendedLimit` with comparison to current credit limit.

**GraphQL query to add/extend:**
```graphql
query CustomerScoringHistory($customerId: ID!, $first: Int) {
  customer(id: $customerId) {
    scoringResults(first: $first, orderBy: { createdAt: DESC }) {
      id
      score
      scoreRangeMin
      scoreRangeMax
      riskTier
      confidence
      probabilityDefault
      recommendedLimit
      contributingFactors
      modelType
      modelVersion
      context
      createdAt
    }
  }
}
```

**Part B: Scoring Analytics Dashboard (Platform Portal)**

Create a new page at `apps/platform-portal/src/app/(portal)/analytics/scoring/page.tsx`:

1. **Score distribution** — Histogram showing distribution of scores across all tenants (or filterable per tenant). Buckets: 0-300, 300-500, 500-700, 700-850, 850+.
2. **Risk tier breakdown** — Donut chart showing % of customers in each risk tier across the platform.
3. **Model performance metrics** — If `probabilityDefault` data is available, show: predicted vs. actual default rate, model accuracy over time.
4. **Scoring volume** — Line chart of scoring requests per day/week, broken down by model type (rule_based vs. ml).
5. **Tenant comparison** — Table comparing average scores, default rates, and scoring volume across tenants.

**GraphQL query for platform-level aggregation:**
```graphql
query PlatformScoringAnalytics($filter: ScoringAnalyticsFilterInput) {
  platformScoringAnalytics(filter: $filter) {
    scoreDistribution { bucket count }
    riskTierBreakdown { tier count percentage }
    scoringVolume { date count modelType }
    tenantComparison {
      tenantId tenantName
      avgScore totalScored defaultRate
    }
  }
}
```

The backend resolver for `platformScoringAnalytics` should aggregate across the `scoring_results` table. This is a platform-schema operation (crosses tenants), so it must be behind platform admin authorization.

### Charts

Use `recharts` — already imported in the project (see `apps/admin-portal/src/components/reports/revenue-report.tsx` for the pattern with `ResponsiveContainer`, `PieChart`, `Tooltip`, etc.).

---

<a id="task-4"></a>
## Task 4: Platform User Management (Platform Portal)

**Monday.com ID:** 11708142179
**Category:** Platform Portal — "User management"

### Problem

The `PlatformUser` model exists in Prisma (`schema.prisma` lines 329-346) with fields: email, passwordHash, name, role (PlatformUserRole: `platform_admin`, `platform_support`), mfaEnabled, status, lastLoginAt, lockedUntil, failedLoginCount. The admin portal has user management for SP-level users at `apps/admin-portal/src/app/(portal)/settings/users/page.tsx`, but the **platform portal** has NO user management page.

### What to Build

Create a Platform User management page at `apps/platform-portal/src/app/(portal)/settings/users/page.tsx`.

### Implementation Details

**1. GraphQL Schema** — Add to graphql-server (platform-schema operations):

```graphql
type PlatformUser {
  id: ID!
  email: String!
  name: String
  role: PlatformUserRole!
  mfaEnabled: Boolean!
  lastLoginAt: DateTime
  status: UserStatus!
  createdAt: DateTime!
}

enum PlatformUserRole { PLATFORM_ADMIN, PLATFORM_SUPPORT }

input CreatePlatformUserInput {
  email: String!
  name: String
  role: PlatformUserRole!
  password: String!
}

input UpdatePlatformUserInput {
  name: String
  role: PlatformUserRole
  status: UserStatus
}

# Queries (platform-admin only)
platformUsers(pagination: PaginationInput): PlatformUserConnection!

# Mutations (platform-admin only)
createPlatformUser(input: CreatePlatformUserInput!): PlatformUser!
updatePlatformUser(id: ID!, input: UpdatePlatformUserInput!): PlatformUser!
deactivatePlatformUser(id: ID!): PlatformUser!
resetPlatformUserPassword(id: ID!, newPassword: String!): PlatformUser!
```

**2. Authorization** — Only `platform_admin` role can create/edit/deactivate other platform users. `platform_support` can view the list but not modify.

**3. Frontend Page** — Follow the exact pattern from `apps/admin-portal/src/components/settings/user-management.tsx` but adapted for PlatformUser:
- Table columns: Name, Email, Role, MFA Status, Last Login, Status, Actions
- Create user form in Drawer: Email, Name, Role dropdown, Password
- Edit form: Name, Role, Status
- Deactivate with confirmation dialog
- Password reset action

**4. Password handling** — Hash passwords server-side using bcrypt (follow existing auth patterns in the graphql-server). NEVER send plaintext passwords in responses.

**5. Navigation** — Add "Users" to the Platform Portal Settings section in sidebar.

---

<a id="task-5"></a>
## Task 5: Audit Log Viewer (Platform Portal)

**Monday.com ID:** 11708150027
**Category:** Platform Portal — "Audit log viewer"

### Problem

The admin portal has a comprehensive audit log viewer at `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx` using the `auditLogs` GraphQL query. The platform portal has NO audit log viewer, but platform operators need to see cross-tenant audit activity.

### What to Build

Create an audit log viewer at `apps/platform-portal/src/app/(portal)/settings/audit-log/page.tsx`.

### Implementation Details

**1. GraphQL Query** — Add a platform-level audit log query:

```graphql
query PlatformAuditLogs($filter: PlatformAuditLogFilterInput, $take: Int, $cursor: String) {
  platformAuditLogs(filter: $filter, take: $take, cursor: $cursor) {
    items {
      id
      tenantId
      tenantName    # Resolved from tenant join
      actorId
      actorType
      actorIp
      action
      resourceType
      resourceId
      correlationId
      createdAt
    }
    hasMore
  }
}

input PlatformAuditLogFilterInput {
  tenantId: String       # Filter by specific SP
  actorType: String
  action: String
  resourceType: String
  dateFrom: DateTime
  dateTo: DateTime
  search: String
}
```

**2. Backend** — The resolver queries the `audit_logs` table across all tenant schemas (platform-admin privilege). Include tenant name by joining with `tenants` table. Do NOT return `beforeValue`/`afterValue` at the platform level — these may contain sensitive SP data. Only platform_admin role can access this query.

**3. Frontend** — Mirror the admin portal's audit log page (`apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx`) with these additions:
- **Tenant filter dropdown** — Select a specific SP to filter logs
- **Cross-tenant columns** — Add "SP Name" column to the table
- Filters: Tenant, Action, Resource Type, Date Range, Search
- Click row to expand details (but NOT before/after values)
- Export CSV functionality

**4. Navigation** — Add "Audit Log" under Settings in platform portal sidebar.

---

<a id="task-6"></a>
## Task 6: SP Detail View with Insights (Platform Portal)

**Monday.com ID:** 11708162464
**Category:** Platform Portal — "SP detail view with insights"

### Problem

The platform portal has a tenant detail page at `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx` that shows basic info (name, slug, country, plan tier, dates) and links to Products, Customers, and Contracts sub-pages. But it lacks analytics/insights and the platformFee field.

### What to Build

Enhance the tenant detail page to include:

**Part A: Platform Fee on Tenant Model**

1. **Prisma schema change** — Add `platformFee` to the Tenant model in `packages/database/prisma/schema.prisma`:

```prisma
model Tenant {
  // ... existing fields ...
  platformFeePercent  Decimal?     @map("platform_fee_percent") @db.Decimal(5, 2)
  // ... rest of model ...
}
```

2. **Migration** — Create a new Prisma migration: `ALTER TABLE tenants ADD COLUMN platform_fee_percent DECIMAL(5,2);`

3. **GraphQL** — Add `platformFeePercent` to the Tenant type. Only platform_admin can SET this field (via `updateTenant` mutation or a dedicated `setPlatformFee` mutation). SP admin users can READ it but NOT modify it.

4. **Platform Portal UI** — On the tenant detail page and tenant create page, show an editable "Platform Fee (%)" field for platform admins.

**Part B: SP Insights Dashboard on Tenant Detail**

Add an analytics section to the existing tenant detail page showing:

1. **KPI cards** at the top:
   - Total active contracts (count)
   - Total outstanding portfolio (sum of `totalOutstanding` on active contracts)
   - Default rate (% of contracts in `default` or `written_off` status)
   - Average credit score (from `scoring_results` for this tenant)

2. **Portfolio health chart** — Donut chart of contract classifications: `performing`, `watch`, `substandard`, `doubtful`, `loss` (from `Contract.classification`).

3. **Monthly disbursement trend** — Bar chart of total disbursed per month for the last 12 months.

4. **Revenue summary** — If settlement data exists for this tenant, show: total revenue, platform share, lender share, net SP revenue.

5. **Product performance table** — For each active product: name, total contracts, total disbursed, default rate, average score.

### GraphQL Query

```graphql
query TenantInsights($tenantId: ID!) {
  tenantInsights(tenantId: $tenantId) {
    activeContracts
    totalOutstanding
    defaultRate
    avgCreditScore
    portfolioHealth { classification count amount }
    monthlyDisbursements { month totalAmount count }
    revenueBreakdown { totalRevenue platformShare lenderShare netSPRevenue }
    productPerformance { productId productName contracts disbursed defaultRate avgScore }
  }
}
```

The resolver aggregates across the tenant's data. This is a platform-schema operation requiring platform_admin authorization.

---

<a id="task-7"></a>
## Task 7: In-App Messaging System

**Monday.com ID:** 11708162464 (Platform Portal) + 11708149685 (Admin Portal)
**Category:** Cross-cutting feature — new data model + UI in both portals

### Problem

There is no messaging system. The existing `Notification` model (schema.prisma lines 864-893) is for transactional notifications to customers (SMS, email, push). There's no model for platform-to-SP or SP-to-platform messages, and no in-app notification inbox.

### What to Build

A persistent in-app messaging system with a 90-day retention policy.

### Implementation Details

**Part A: Prisma Schema — New Models**

Add to `packages/database/prisma/schema.prisma`:

```prisma
// ============================================================================
// PLATFORM SCHEMA — MESSAGING
// ============================================================================

enum MessageType {
  announcement   // Platform → all SPs (broadcast)
  direct         // Platform ↔ SP (one-to-one)
  system         // Auto-generated system messages
}

enum MessagePriority {
  low
  normal
  high
  urgent
}

model PlatformMessage {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type          MessageType
  priority      MessagePriority @default(normal)
  subject       String          @db.VarChar(500)
  body          String          @db.Text
  senderType    String          @map("sender_type") @db.VarChar(50)  // "platform" or "tenant"
  senderId      String          @map("sender_id") @db.Uuid
  senderName    String?         @map("sender_name") @db.VarChar(255)
  tenantId      String?         @map("tenant_id") @db.Uuid           // null for broadcasts
  metadata      Json?
  expiresAt     DateTime?       @map("expires_at") @db.Timestamptz(6)
  createdAt     DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime        @updatedAt @map("updated_at") @db.Timestamptz(6)

  recipients    MessageRecipient[]

  @@index([tenantId])
  @@index([type])
  @@index([createdAt])
  @@map("platform_messages")
}

model MessageRecipient {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  messageId     String    @map("message_id") @db.Uuid
  recipientType String    @map("recipient_type") @db.VarChar(50)  // "platform_user" or "tenant_user"
  recipientId   String    @map("recipient_id") @db.Uuid
  tenantId      String?   @map("tenant_id") @db.Uuid
  readAt        DateTime? @map("read_at") @db.Timestamptz(6)
  archivedAt    DateTime? @map("archived_at") @db.Timestamptz(6)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  message       PlatformMessage @relation(fields: [messageId], references: [id])

  @@unique([messageId, recipientId])
  @@index([recipientId, readAt])
  @@index([tenantId])
  @@map("message_recipients")
}
```

Create the migration after adding these models.

**Part B: GraphQL Schema**

```graphql
type PlatformMessage {
  id: ID!
  type: MessageType!
  priority: MessagePriority!
  subject: String!
  body: String!
  senderType: String!
  senderId: String!
  senderName: String
  tenantId: String
  isRead: Boolean!        # Computed for the current user
  createdAt: DateTime!
}

input SendMessageInput {
  type: MessageType!
  priority: MessagePriority
  subject: String!
  body: String!
  tenantId: String        # Required for direct messages, null for announcements
}

# Queries
messages(filter: MessageFilterInput, pagination: PaginationInput): MessageConnection!
unreadMessageCount: Int!

# Mutations
sendMessage(input: SendMessageInput!): PlatformMessage!
markMessageRead(id: ID!): PlatformMessage!
markAllMessagesRead: Boolean!
archiveMessage(id: ID!): Boolean!
```

**Part C: Notification Bell Component**

Create a shared notification bell component that works in both portals:

- `packages/common/src/components/notification-bell.tsx` — OR create in each portal separately if they use different GraphQL clients
- Shows unread count badge (red dot with number)
- Click opens a dropdown/popover with recent messages (last 10)
- "View All" link navigates to full inbox page
- Poll for unread count every 30 seconds (or use GraphQL subscriptions if available)

**Part D: Inbox Page**

Create inbox pages in both portals:
- `apps/platform-portal/src/app/(portal)/messages/page.tsx`
- `apps/admin-portal/src/app/(portal)/messages/page.tsx`

Features:
- List of messages with: Subject, Sender, Date, Priority badge, Read/Unread status
- Click to expand message body
- Mark as read (individual and bulk)
- Archive messages
- Filter by: Type (announcement/direct/system), Priority, Read/Unread, Date range
- Compose button (platform portal can send to any SP; admin portal can send to platform)

**Part E: Retention Policy**

Add a scheduled job (or extend the existing scheduler at `apps/scheduler/`) to:
- Delete messages older than 90 days where all recipients have read or archived them
- Delete `MessageRecipient` records for archived messages older than 90 days
- Run daily

---

<a id="task-8"></a>
## Task 8: Settlement Report & Revenue Insights (Admin Portal)

**Monday.com ID:** 11708150512
**Category:** SP Portal — "Settlement report and revenue insights"

### Problem

The revenue report page (`apps/admin-portal/src/components/reports/revenue-report.tsx`) has a GraphQL query for settlements but the revenue breakdown pie chart uses hardcoded mock data (lines 36-42):
```typescript
const revenueBreakdown = [
  { name: 'Interest Income', value: 245000 },
  { name: 'Processing Fees', value: 42000 },
  // ... more hardcoded values
];
```

The `SettlementRun` and `SettlementLine` Prisma models exist (lines 907-944) with real structure (periodStart, periodEnd, totalRevenue, status, lines with partyType, grossRevenue, sharePercentage, shareAmount, netAmount).

### What to Build

Replace mock data with real settlement queries and enhance the report.

### Implementation Details

**1. GraphQL Queries** — Ensure these are implemented in the backend:

```graphql
type SettlementRun {
  id: ID!
  periodStart: DateTime!
  periodEnd: DateTime!
  status: SettlementStatus!
  totalRevenue: String!      # Decimal as string
  approvedBy: String
  approvedAt: DateTime
  lines: [SettlementLine!]!
  createdAt: DateTime!
}

type SettlementLine {
  id: ID!
  partyType: String!   # "platform", "lender", "sp"
  partyId: String!
  grossRevenue: String!
  sharePercentage: String!
  shareAmount: String!
  deductions: String!
  netAmount: String!
}

query Settlements($filter: SettlementFilterInput, $pagination: PaginationInput) {
  settlements(filter: $filter, pagination: $pagination) {
    edges {
      node {
        id periodStart periodEnd totalRevenue status
        lines { partyType grossRevenue sharePercentage shareAmount netAmount }
      }
    }
  }
}

query RevenueBreakdown($periodStart: DateTime, $periodEnd: DateTime) {
  revenueBreakdown(periodStart: $periodStart, periodEnd: $periodEnd) {
    interestIncome
    processingFees
    latePenalties
    insurancePremium
    otherFees
    total
  }
}
```

**2. Backend Resolver** — Create or complete settlement resolvers in graphql-server:
- `settlements` query: paginated list of SettlementRun with lines, scoped to tenant
- `revenueBreakdown` query: aggregate revenue by category from ledger entries or repayments within a date range

**3. Frontend Updates** — In `apps/admin-portal/src/components/reports/revenue-report.tsx`:
- Replace hardcoded `revenueBreakdown` array with data from `revenueBreakdown` query
- Show settlement runs table with: Period, Total Revenue, Platform Fee, Lender Share, SP Share, Status
- Add date range filter for the revenue breakdown chart
- Add settlement detail drawer: click a settlement row to see line-by-line breakdown
- Show "No settlement data" placeholder when no runs exist (handle empty state gracefully — don't crash with mock data)

**4. Revenue Dashboard Enhancement** — Add summary KPI cards above the chart:
- Total Revenue (current period)
- Platform Fee Amount
- SP Net Revenue
- YoY/MoM trend indicator (if historical data exists)

---

<a id="task-9"></a>
## Task 9: SP Messaging & Notifications (Admin Portal)

**Monday.com ID:** 11708149685
**Category:** SP Portal — "Send messages and notifications"

### Problem

This is the admin portal (SP-side) counterpart of Task 7. SP admins need to see messages from the platform and send messages back.

### What to Build

This task depends on Task 7 (messaging data model and GraphQL schema). Once Task 7 is complete:

1. **Notification bell** — Add the notification bell component to the admin portal's header/navbar. Shows unread count for messages where `recipientType = 'tenant_user'` and `tenantId` matches the current tenant.

2. **Inbox page** — `apps/admin-portal/src/app/(portal)/messages/page.tsx` — Same inbox pattern as the platform portal version, but:
   - Only shows messages where the current tenant is a recipient
   - Can compose messages to platform (senderType = "tenant", type = "direct")
   - Cannot send announcements (that's platform-only)

3. **Navigation** — Add "Messages" with unread badge to the admin portal sidebar.

### Note

Implement Task 7 first. This task reuses the same backend queries/mutations — it's purely the admin-portal frontend integration.

---

<a id="task-10"></a>
## Task 10: Funding Source Step in Product Wizard (Admin Portal)

**Monday.com ID:** 11708084110
**Category:** SP Portal — "Add Funding Source step to product wizard"

### Problem

The product creation wizard (`apps/admin-portal/src/components/products/wizard/product-wizard.tsx`) has 7 steps but does NOT include a step for selecting the funding source (Lender). The `Product` model has an optional `lenderId` field (line 501 in schema.prisma) and a `revenueSharing` JSON field (line 518), but the wizard never sets these.

Current steps: Basic Info → Financial Terms → Fees → Eligibility → Approval → Notifications → Review

### What to Build

Add a "Funding Source" step between Eligibility (Step 4) and Approval (Step 5), making it the new Step 5 (and shifting Approval to 6, Notifications to 7, Review to 8).

### Implementation Details

**1. New Step Component** — Create `apps/admin-portal/src/components/products/wizard/step-funding-source.tsx`:

The step should have:
- **Lender selection** — Dropdown to select an existing active lender. Query `lenders` (from Task 1) to populate the dropdown. The dropdown should show: Lender Name, Country, Interest Rate Range. This is OPTIONAL — a product can exist without a lender.
- **Insurance configuration** — Checkbox to enable insurance for this product. If enabled, show:
  - Insurance provider name (text input)
  - Insurance premium rate (% — this already exists in the fee structure as insurance fee, but here it's the configuration)
  - Coverage type (dropdown: credit_life, repayment_protection, full_cover)
- **Revenue sharing preview** — Read-only summary showing:
  - Platform fee % (from the tenant's `platformFeePercent` — read-only, set by platform admin)
  - Lender share % (if lender selected, default to a reasonable split or allow input)
  - SP share % (computed: 100% - platform fee - lender share)

**2. Form State Changes** — Update `ProductFormState` interface in `product-wizard.tsx`:

```typescript
export interface ProductFormState {
  // ... existing fields ...
  lenderId: string;           // UUID or empty string
  insuranceEnabled: boolean;
  insuranceProvider: string;
  insuranceCoverageType: string;
  revenueSharing: {
    lenderSharePercent: string;
    // platformFeePercent is read from tenant, not editable here
  };
}
```

Add corresponding defaults in `DEFAULT_STATE`.

**3. Mutation Input Changes** — Update `buildMutationInput()` to include:
```typescript
lenderId: form.lenderId || null,
revenueSharing: {
  lenderSharePercent: form.revenueSharing.lenderSharePercent ? Number(form.revenueSharing.lenderSharePercent) : null,
  insuranceEnabled: form.insuranceEnabled,
  insuranceProvider: form.insuranceProvider || null,
  insuranceCoverageType: form.insuranceCoverageType || null,
},
```

**4. Wizard Orchestrator Changes** — Update `product-wizard.tsx`:
- Add `StepFundingSource` to imports
- Insert in the steps array between StepEligibility and StepApproval
- Update step labels in `WizardProgress`
- Update validation in `validation.ts` for the new step

**5. Review Step** — Update `step-review.tsx` to display the funding source selection (Lender name, insurance config, revenue split).

**6. GraphQL Input** — Ensure `CreateProductInput` and `UpdateProductInput` in the backend accept `lenderId` and `revenueSharing`.

---

## Execution Order (Recommended)

Some tasks have dependencies. Recommended order:

1. **Task 1** (Lender Management) — needed by Task 2 and Task 10
2. **Task 6 Part A** (Platform Fee on Tenant) — needed by Task 10
3. **Task 7** (Messaging System) — needed by Task 9
4. **Tasks 2, 3, 4, 5** — can be done in parallel after Task 1
5. **Task 10** (Funding Source wizard step) — after Tasks 1 and 6A
6. **Task 8** (Settlement Reports) — independent, can start anytime
7. **Task 9** (SP Messaging) — after Task 7

---

## Cross-Cutting Requirements

### For ALL frontend work:
- Use the `'use client'` directive on pages with interactivity
- Import Apollo hooks from `@apollo/client`
- Use the `glass` CSS class for card components (existing design system)
- Monetary amounts always as STRING, formatted with `formatMoney()` from `@/lib/utils`
- All tables use `DataTable` component from `@/components/ui/data-table`
- All forms in drawers use the `Drawer` component from `@/components/ui/drawer`
- Toast notifications via `useToast()` hook from `@/components/ui/toast`
- Loading states: skeleton loading patterns already in use
- Error states: show error message with retry button
- Empty states: show placeholder message with action button

### For ALL backend work:
- GraphQL resolvers go in `apps/graphql-server/src/modules/<module-name>/`
- Each module has: `<name>.module.ts`, `<name>.resolver.ts`, `<name>.service.ts`, `<name>.types.ts`
- Tenant-scoped queries MUST use the `tenantId` from JWT context
- Platform-scoped queries require `platform_admin` or `platform_support` role check
- All mutations should emit audit log entries
- Money as `Decimal` (Prisma) — never float

### For Prisma changes:
- Run `pnpm --filter database db:migrate` after schema changes
- Migration names: descriptive, kebab-case (e.g., `add-platform-fee-to-tenant`)
- Seed data: update `packages/database/prisma/seed.ts` with sample lenders, messages, etc.

---

## Verification Checklist

After all tasks are complete:

- [ ] Lender CRUD works: create, list, edit, deactivate — all scoped to tenant
- [ ] Lender detail page shows profile, products, contracts, funding utilization
- [ ] Customer credit score shows contributing factors chart + score history
- [ ] Platform scoring analytics page shows distribution, risk tiers, volume, tenant comparison
- [ ] Platform user CRUD works with proper role-based access
- [ ] Platform audit log shows cross-tenant activity with tenant filter
- [ ] Tenant detail page shows platform fee (editable by platform admin only) and analytics KPIs
- [ ] Messages can be sent from platform → SP and SP → platform
- [ ] Notification bell shows unread count in both portals
- [ ] Inbox shows messages with read/unread/archive functionality
- [ ] Settlement report uses real data (not mock) with date range filtering
- [ ] Product wizard has 8 steps with Funding Source between Eligibility and Approval
- [ ] Funding Source step allows lender selection from dropdown + insurance config
- [ ] All new pages have proper navigation entries in sidebar
- [ ] All GraphQL mutations emit audit log entries
- [ ] All money handled as Decimal/String — no floats
- [ ] Tests pass: `pnpm test`
- [ ] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
