# Dev Prompt: Platform-Wide i18n Hardcoded Strings Cleanup

**Date:** 2026-05-02
**Priority:** Medium — must complete before Sprint 11 close
**Effort:** ~3–4 hours
**Reference:** PM platform-wide sweep of all admin portal files

---

## Context

The admin portal has hundreds of hardcoded English strings that bypass the `t()` translation system. Every user-facing string — labels, placeholders, error messages, headings, subtitles, column headers, button text, empty states, tooltips, filter options — must use `t()` from `useI18n()`.

This prompt covers **every** hardcoded string across the entire admin portal, organized by module. The merchant files (File 1–3) were already documented in `FIX-SPRINT-11-TRACK-B-MINOR-2026-05-02.md` — they are included here for completeness but may already be fixed.

---

## Global Rules

1. **No hardcoded user-facing strings.** Every string the user sees must go through `t()`.
2. **Import pattern:** Each component file needs `const { t } = useI18n();` (or receive `t` via props for non-hook components).
3. **Class components** (e.g., `error-boundary.tsx`): Wrap with a functional wrapper or use the `I18nContext` consumer pattern.
4. **Key naming:** Use the existing namespace structure in `en.json` — e.g., `collections.queue.column.dpd`, `reports.revenue.title`.
5. **Common keys:** Reuse existing `common.*` keys where they match exactly (e.g., `common.loading`, `common.cancel`, `common.save`, `common.edit`, `common.search`, `common.tryAgain`, `common.error`, `common.active`, `common.inactive`, `common.none`, `common.name`, `common.email`, `common.phone`, `common.status`, `common.type`, `common.currency`, `common.processing`).
6. **Plurals:** Use interpolation: `t('key', { count: n })` instead of manual `count === 1 ? '' : 's'` ternaries.
7. **Template literals:** Extract the full string: `t('key', { value: someVar })` with `"key": "of {{value}} total"` in the locale file.
8. **Fallback drops:** Remove `|| 'Fallback'` patterns from existing `t()` calls — the keys exist.
9. **Locale file:** All new keys go in `apps/admin-portal/src/lib/i18n/locales/en.json`, merged into the appropriate namespace.

---

## Module 1: Merchants (31 strings — 3 files)

> Already documented in `FIX-SPRINT-11-TRACK-B-MINOR-2026-05-02.md`. Apply that prompt if not already done.

**Files:**
- `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx` — 10 strings (metric labels, profile label, loading states, not-found)
- `apps/admin-portal/src/components/merchants/merchant-list.tsx` — 11 strings (error fallbacks, loading, plural, placeholder, fallback drops)
- `apps/admin-portal/src/components/merchants/merchant-form.tsx` — 10 strings (validation messages, input placeholders)

---

## Module 2: Collections Components (83 strings — 5 files)

None of these files currently import or use `t()`. Add `useI18n` import and `const { t } = useI18n();` to each.

### 2A — `components/collections/action-drawer.tsx` (37 strings)

```
Line 77:  'Please select a call outcome'        → t('collections.action.error.selectCallOutcome')
Line 85:  'PTP date and amount are required'     → t('collections.action.error.ptpRequired')
Line 94:  toast messages — the entire template literal with 'Call logged' / 'PTP recorded' / 'Reminder sent' / 'Escalated' + ' successfully'
          → Build dynamically: toast('success', t(`collections.action.success.${action}`, { action }))
          Add keys: collections.action.success.log_call, .record_ptp, .send_reminder, .escalate
Line 99:  'Failed to log action'                 → t('collections.action.error.failedToLog')
Line 104: "Collections Action"                   → t('collections.action.drawerTitle')
Line 112: "Contract not found"                   → t('collections.action.contractNotFound')
Line 117: "Contract Summary"                     → t('collections.action.contractSummary')
Line 120: "Contract #"                           → t('collections.action.label.contractNumber')
Line 124: "Customer"                             → t('collections.action.label.customer')
Line 128: "Outstanding"                          → t('collections.action.label.outstanding')
Line 132: "DPD"                                  → t('collections.action.label.dpd')
Line 138: "Classification"                       → t('collections.action.label.classification')
Line 142: "Phone"                                → t('collections.action.label.phone')
Line 151: "Action History"                       → t('collections.action.actionHistory')
Line 166: "PTP: "                                → t('collections.action.ptpPrefix')
Line 171: ` by ${entry.actor}`                   → t('collections.action.byActor', { actor: entry.actor })
Line 183: "Log Action"                           → t('collections.action.logAction')
Line 187: 'Log Call'                             → t('collections.action.button.logCall')
Line 188: 'Record PTP'                           → t('collections.action.button.recordPtp')
Line 189: 'Send Reminder'                        → t('collections.action.button.sendReminder')
Line 190: 'Escalate'                             → t('collections.action.button.escalate')
Line 208: "Call Outcome"                         → t('collections.action.label.callOutcome')
Line 214: "Select outcome..."                    → t('collections.action.placeholder.selectOutcome')
Line 215: "Answered - Promise to Pay"            → t('collections.action.outcome.answeredPromise')
Line 216: "Answered - Dispute"                   → t('collections.action.outcome.answeredDispute')
Line 217: "Answered - Financial Hardship"        → t('collections.action.outcome.answeredHardship')
Line 218: "No Answer"                            → t('collections.action.outcome.noAnswer')
Line 219: "Wrong Number"                         → t('collections.action.outcome.wrongNumber')
Line 220: "Disconnected"                         → t('collections.action.outcome.disconnected')
Line 228: "PTP Date"                             → t('collections.action.label.ptpDate')
Line 236: "PTP Amount"                           → t('collections.action.label.ptpAmount')
Line 250: "Notes"                                → t('collections.action.label.notes')
Line 256: "Add notes..."                         → t('collections.action.placeholder.addNotes')
Line 265: 'Submitting...'                        → t('collections.action.button.submitting')
Line 265: 'Submit Action'                        → t('collections.action.button.submitAction')
```

### 2B — `components/collections/aging-chart.tsx` (2 strings)

```
Line 15: "No aging data available"               → t('collections.aging.noData')
Line 42: "Contracts"                             → t('collections.aging.contractsLabel')
```

### 2C — `components/collections/collections-dashboard.tsx` (15 strings)

```
Lines 46-49: Fallback bucket labels '1-30 DPD', '31-60 DPD', '61-90 DPD', '90+ DPD'
             → t('collections.dashboard.bucket.1_30'), t('...31_60'), t('...61_90'), t('...90Plus')
Line 56:  "Total Overdue Amount"                 → t('collections.dashboard.totalOverdueAmount')
Line 59:  "Overdue" / "1-30 DPD"                 → t('collections.dashboard.overdue') / t('collections.dashboard.subtitle.1_30dpd')
Line 60:  "Delinquent" / "31-90 DPD"             → t('collections.dashboard.delinquent') / t('collections.dashboard.subtitle.31_90dpd')
Line 62:  "Recovery Rate"                        → t('collections.dashboard.recoveryRate')
Line 68:  "Default" / "90+ DPD"                  → t('collections.dashboard.default') / t('collections.dashboard.subtitle.90PlusDpd')
Line 69:  "Total in Collections"                 → t('collections.dashboard.totalInCollections')
Line 70:  "Total Actions"                        → t('collections.dashboard.totalActions')
Line 74:  "Aging Bucket Distribution"            → t('collections.dashboard.agingBucketDistribution')
```

### 2D — `components/collections/collections-queue.tsx` (18 strings)

```
Line 61:  'All Classifications'                  → t('collections.queue.filter.allClassifications')
Lines 64-66: 'Substandard', 'Doubtful', 'Loss'  → t('collections.queue.classification.substandard'), .doubtful, .loss
Line 73:  'All DPD Ranges'                       → t('collections.queue.filter.allDpdRanges')
Lines 76-79: '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days'
             → t('collections.queue.dpd.1_30'), .31_60, .61_90, .90Plus
Line 97:  "Loading..."                           → t('common.loading')
Lines 101-111: Column headers 'Contract #', 'Customer', 'DPD', 'Outstanding', 'Classification', 'Last Action'
               → t('collections.queue.column.contractNumber'), .customer, .dpd, .outstanding, .classification, .lastAction
Line 114: "None"                                 → t('common.none')
Line 127: "No contracts in collections queue"    → t('collections.queue.emptyMessage')
```

### 2E — `components/collections/ptp-tracker.tsx` (11 strings)

```
Line 52:  "No Promises to Pay"                   → t('collections.ptp.emptyTitle')
Line 53:  "No promise-to-pay commitments..."     → t('collections.ptp.emptyDescription')
Line 65:  "Upcoming"                             → t('collections.ptp.upcoming')
Line 71:  "Overdue PTPs"                         → t('collections.ptp.overduePtps')
Line 77:  "Fulfilled"                            → t('collections.ptp.fulfilled')
Lines 87-115: Column headers 'Contract #', 'Customer', 'PTP Date', 'Amount', 'Status', 'Created'
              → t('collections.ptp.column.contractNumber'), .customer, .ptpDate, .amount, .status, .created
```

---

## Module 3: Loans Components (64 strings — 4 files)

None of these files currently use `t()`. Add `useI18n` import to each.

### 3A — `components/loans/application-review-drawer.tsx` (39 strings)

```
Line 65:  Template literal with 'approved'/'rejected'/'escalated' + ' successfully'
          → toast('success', t(`loans.review.success.${action}`))
          Add keys: loans.review.success.approve, .reject, .escalate
Line 69:  "Failed to ${action} application"      → t('loans.review.error.actionFailed', { action: t(`loans.review.actions.${action}`) })
Line 83:  'Rejection reason is required'         → t('loans.review.error.rejectionReasonRequired')
Line 93:  "Application Review"                   → t('loans.review.drawerTitle')
Line 101: "Application not found"                → t('loans.review.notFound')
Line 106: "Customer"                             → t('loans.review.section.customer')
Line 109: "Name"                                 → t('common.name')
Line 113: "KYC Level"                            → t('loans.review.label.kycLevel')
Line 117: "Status"                               → t('common.status')
Line 121: "Phone"                                → t('common.phone')
Line 129: "Request Details"                      → t('loans.review.section.requestDetails')
Line 132: "Amount"                               → t('common.amount')
Line 136: "Tenor"                                → t('loans.review.label.tenor')
Line 137: "days"                                 → t('common.days')
Line 140: "Product"                              → t('loans.review.label.product')
Line 144: "Channel"                              → t('loans.review.label.channel')
Line 148: "Submitted"                            → t('loans.review.label.submitted')
Line 152: "Status"                               → t('common.status')
Line 161: "Scoring Breakdown"                    → t('loans.review.section.scoringBreakdown')
Line 164: "Score"                                → t('loans.review.label.score')
Line 168: "Risk Tier"                            → t('loans.review.label.riskTier')
Line 172: "Recommendation"                       → t('loans.review.label.recommendation')
Line 178: "Factors"                              → t('loans.review.label.factors')
Line 206: "Approve"                              → t('loans.review.button.approve')
Line 213: "Reject"                               → t('loans.review.button.reject')
Line 220: "Escalate"                             → t('loans.review.button.escalate')
Line 229: "Approve Application"                  → t('loans.review.modal.approveTitle')
Line 231: "Optionally modify the terms..."       → t('loans.review.modal.approveDescription')
Line 233: "Modified Amount (optional)"           → t('loans.review.modal.modifiedAmount')
Line 243: "Modified Tenor Days (optional)"       → t('loans.review.modal.modifiedTenor')
Line 254: "Cancel"                               → t('common.cancel')
Line 257: 'Processing...' / 'Confirm Approval'   → t('common.processing') / t('loans.review.modal.confirmApproval')
Line 264: "Reject Application"                   → t('loans.review.modal.rejectTitle')
Line 267: "Reason (required)"                    → t('loans.review.modal.reasonRequired')
Line 273: "Enter the reason for rejection..."    → t('loans.review.modal.rejectionPlaceholder')
Line 278: "Cancel"                               → t('common.cancel')
Line 285: 'Processing...' / 'Confirm Rejection'  → t('common.processing') / t('loans.review.modal.confirmRejection')
```

### 3B — `components/loans/tab-ledger.tsx` (8 strings)

```
Line 50:  "No Ledger Entries"                    → t('loans.ledger.emptyTitle')
Line 51:  "No ledger entries have been..."       → t('loans.ledger.emptyDescription')
Lines 60-82: Column headers 'Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance'
             → t('loans.ledger.column.date'), .type, .description, .debit, .credit, .balance
```

### 3C — `components/loans/tab-payment-history.tsx` (12 strings)

```
Line 51:  "No Payments"                          → t('loans.paymentHistory.emptyTitle')
Line 52:  "No payments have been recorded..."    → t('loans.paymentHistory.emptyDescription')
Lines 61-80: Column headers 'Date', 'Amount', 'Allocation', 'Method', 'Reference', 'Status'
             → t('loans.paymentHistory.column.date'), .amount, .allocation, .method, .reference, .status
Lines 70-73: Allocation prefixes 'P: ', 'I: ', 'F: ', 'Pen: '
             → t('loans.paymentHistory.allocation.principal'), .interest, .fees, .penalties
```

### 3D — `components/loans/tab-timeline.tsx` (3 strings)

```
Line 62:  "No Timeline Events"                   → t('loans.timeline.emptyTitle')
Line 63:  "No state transitions..."              → t('loans.timeline.emptyDescription')
Line 92:  "by "                                  → t('loans.timeline.byActor', { actor: event.actor })
```

---

## Module 4: Lenders (41 strings — 3 files)

### 4A — `app/(portal)/lenders/[id]/page.tsx` (28 strings)

```
Line 91:  "Loading…"                             → t('common.loading')
Line 102: "Lender not found"                     → t('lenders.detail.notFound')
Line 135: 'Contract #'                           → t('lenders.detail.column.contractNumber')
Line 138: 'Amount'                               → t('common.amount')
Line 142: 'DPD'                                  → t('lenders.detail.column.dpd')
Line 172: "Lender · "                            → t('lenders.detail.eyebrow')
Line 183: "Licence "                             → t('lenders.detail.licencePrefix')
Line 196: "Profile"                              → t('lenders.detail.profile')
Line 200: 'License #'                            → t('lenders.detail.label.licenseNumber')
Line 201: 'Country'                              → t('lenders.detail.label.country')
Line 202: 'Funding capacity'                     → t('lenders.detail.label.fundingCapacity')
Line 203: 'Interest range'                       → t('lenders.detail.label.interestRange')
Line 206: 'Created'                              → t('common.created')
Line 218: "Settlement account"                   → t('lenders.detail.settlementAccount')
Line 223: 'Bank'                                 → t('lenders.detail.label.bank')
Line 224: 'Account'                              → t('lenders.detail.label.account')
Line 225: 'Branch'                               → t('lenders.detail.label.branch')
Line 226: 'SWIFT'                                → t('lenders.detail.label.swift')
Line 235: "No settlement account configured"     → t('lenders.detail.noSettlementAccount')
Line 241: "Risk parameters"                      → t('lenders.detail.riskParameters')
Line 253: "No risk parameters configured"        → t('lenders.detail.noRiskParameters')
Line 263: "Funding utilization"                  → t('lenders.detail.fundingUtilization')
Line 286: "Disbursed · "                         → t('lenders.detail.disbursedPrefix')
Line 287: "Capacity · "                          → t('lenders.detail.capacityPrefix')
Line 296: "Linked products"                      → t('lenders.detail.linkedProducts')
Line 306: "No products linked to this lender"    → t('lenders.detail.noLinkedProducts')
Line 314: "Linked contracts"                     → t('lenders.detail.linkedContracts')
Line 324: "No contracts under this lender"       → t('lenders.detail.noLinkedContracts')
```

### 4B — `components/lenders/lender-form.tsx` (7 strings)

```
Line 140: "Primary Markets"                      → t('lenders.form.optgroup.primaryMarkets')
Line 148: "Other African Countries"              → t('lenders.form.optgroup.otherAfrican')
Line 154: "Global"                               → t('lenders.form.optgroup.global')
Line 179: "0.00" (placeholder)                   → t('lenders.form.placeholder.amount')
Lines 189,197,203: Currency optgroup labels "Primary Currencies", "Other African Currencies", "Global Currencies"
                   → t('lenders.form.optgroup.primaryCurrencies'), .otherAfricanCurrencies, .globalCurrencies
Lines 228,237: "0.00" (rate placeholders)         → t('lenders.form.placeholder.rate')
```

### 4C — `components/lenders/lender-list.tsx` (6 strings)

```
Line 117: 'Failed to save lender'                → t('lenders.errors.saveFailed')
Line 129: 'Failed to deactivate'                 → t('lenders.errors.deactivateFailed')
Line 157: "System"                               → t('lenders.systemBadge')
Lines 203,205: "Loading…"                        → t('common.loading')
Line 217: Template with count + 'lender(s) configured. Manage capacity, rates, and settlement.'
          → t('lenders.subtitle', { count: lenders.length }) + '. ' + t('lenders.subtitleDescription')
```

---

## Module 5: Platform Components (85 strings — 4 files)

None of these files use `t()`. Add `useI18n` import to each.

### 5A — `components/platform/sp-management.tsx` (14 strings)

```
Lines 24-26: 'Active', 'Suspended', 'Inactive'  → t('common.active'), t('platform.sp.suspended'), t('common.inactive')
Line 78:  "Service providers"                    → t('platform.sp.title')
Line 90:  "Add SP"                               → t('platform.sp.addSp')
Line 96:  "Loading service providers…"           → t('platform.sp.loading')
Line 107: "SP name" (placeholder)                → t('platform.sp.placeholder.name')
Line 112: "SP code" (placeholder)                → t('platform.sp.placeholder.code')
Line 119: "Create"                               → t('common.create')
Line 122: "Cancel"                               → t('common.cancel')
Line 132: "No service providers yet."            → t('platform.sp.emptyMessage')
Line 157: "Save"                                 → t('common.save')
Line 160: "Cancel"                               → t('common.cancel')
Line 182: 'product(s)' count                     → t('platform.sp.productCount', { count })
Line 206: "Edit"                                 → t('common.edit')
```

### 5B — `components/platform/tenant-create-wizard.tsx` (37 strings)

```
Lines 12-15: Step titles/descriptions: 'Basic Info'/'Organization details', 'Admin User'/'Initial admin account', 'Configuration'/'Platform settings', 'Review & Create'/'Confirm and create'
             → t('platform.wizard.step1Title'), .step1Desc, .step2Title, .step2Desc, .step3Title, .step3Desc, .step4Title, .step4Desc
Lines 77-87: Validation errors: 'Name is required', 'Slug is required', 'Country is required', 'Email is required', password validation messages
             → t('platform.wizard.validation.nameRequired'), .slugRequired, .countryRequired, .emailRequired, .passwordMin, .passwordUppercase, .passwordLowercase, .passwordDigit, .passwordSpecial
Line 160: "Step"                                 → t('platform.wizard.stepLabel')
Line 173: "Organization Name *"                  → t('platform.wizard.orgName')
Line 183: "Acme Financial Services" (placeholder) → t('platform.wizard.placeholder.orgName')
Line 188: "Slug *"                               → t('platform.wizard.slug')
Line 192: "acme-financial" (placeholder)         → t('platform.wizard.placeholder.slug')
Line 198: "Legal Name"                           → t('platform.wizard.legalName')
Line 202: "Acme Financial Services Ltd."         → t('platform.wizard.placeholder.legalName')
Line 207: "Registration Number"                  → t('platform.wizard.registrationNumber')
Line 211: "REG-12345" (placeholder)              → t('platform.wizard.placeholder.registrationNumber')
Line 216: "Country *"                            → t('platform.wizard.country')
Line 235: "Admin Name *"                         → t('platform.wizard.adminName')
Line 240: "John Doe" (placeholder)               → t('platform.wizard.placeholder.adminName')
Line 244: "Admin Email *"                        → t('platform.wizard.adminEmail')
Line 249: "admin@acme.com" (placeholder)         → t('platform.wizard.placeholder.adminEmail')
Line 256: "Initial Password *"                   → t('platform.wizard.initialPassword')
Line 262: "Min 12 chars..." (placeholder)        → t('platform.wizard.placeholder.password')
Line 273: "Plan Tier"                            → t('platform.wizard.planTier')
Lines 279-281: "Starter", "Professional", "Enterprise" → t('platform.wizard.plan.starter'), .professional, .enterprise
Line 285: "Initial Settings (JSON)"              → t('platform.wizard.initialSettings')
Lines 299-315: Review labels: "Organization", "Name", "Slug", "Country", "Plan", "Legal name", "Reg #", "Admin user", "Email"
               → t('platform.wizard.review.organization'), .name, .slug, .country, .plan, .legalName, .regNumber, .adminUser, .adminEmail
Line 326: "Back"                                 → t('common.back')
Line 333: "Continue"                             → t('common.next')
Line 337: 'Creating…' / 'Create tenant'          → t('platform.wizard.creating') / t('platform.wizard.createTenant')
```

### 5C — `components/platform/tenant-detail-tabs.tsx` (27 strings)

```
Line 29:  Tab names: 'General', 'Configuration', 'Billing', 'Integrations', 'Activity'
          → t('platform.tenant.tab.general'), .configuration, .billing, .integrations, .activity
Line 101: "Tenant Name"                          → t('platform.tenant.label.tenantName')
Line 109: "Slug"                                 → t('platform.tenant.label.slug')
Line 113: "Legal Name"                           → t('platform.tenant.label.legalName')
Line 121: "Registration Number"                  → t('platform.tenant.label.registrationNumber')
Line 128: "Country"                              → t('platform.tenant.label.country')
Line 138: "Schema Name"                          → t('platform.tenant.label.schemaName')
Line 145: 'Saving…' / 'Save changes'            → t('common.saving') / t('platform.tenant.saveChanges')
Line 152: "Status management"                    → t('platform.tenant.statusManagement')
Line 156: "Current"                              → t('platform.tenant.currentStatus')
Line 188: "Activate tenant"                      → t('platform.tenant.action.activate')
Line 195: "Reason for suspension…" (placeholder) → t('platform.tenant.placeholder.suspendReason')
Line 209: "Suspend tenant"                       → t('platform.tenant.action.suspend')
Line 215: "Reactivate tenant"                    → t('platform.tenant.action.reactivate')
Lines 221-222: "Created · ", "Last updated · "   → t('platform.tenant.createdAt'), t('platform.tenant.updatedAt')
Line 231: "Tenant configuration"                 → t('platform.tenant.tenantConfiguration')
Line 234: "Plan tier"                            → t('platform.tenant.planTier')
Line 238: "Settings (JSON)"                      → t('platform.tenant.settingsJson')
Line 257: "Billing information"                  → t('platform.tenant.billingInformation')
Line 260: "Billing integration coming soon."     → t('platform.tenant.billingComingSoon')
Line 262: "Plan · "                              → t('platform.tenant.planPrefix')
Line 272: "Integrations"                         → t('platform.tenant.integrations')
Line 276: "Integration configuration is managed..." → t('platform.tenant.integrationsManagedPlatform')
Line 286: "Recent activity"                      → t('platform.tenant.recentActivity')
Line 289: "Activity log will appear here."       → t('platform.tenant.activityComingSoon')
Line 291: "Tenant created on "                   → t('platform.tenant.createdOn')
```

### 5D — `components/platform/tenant-list-table.tsx` (7 strings)

```
Lines 67-71: Column headers 'Name', 'Status', 'Plan', 'SPs', 'Created'
             → t('common.name'), t('common.status'), t('platform.tenantList.column.plan'), t('platform.tenantList.column.sps'), t('common.created')
Line 77:  "Loading tenants…"                     → t('platform.tenantList.loading')
Line 87:  "No tenants found."                    → t('platform.tenantList.emptyMessage')
```

---

## Module 6: Product Wizard (24 strings — 8 files)

### 6A — `components/products/product-wizard.tsx` (3 strings)

```
Line 390: 'Failed to save product'               → t('products.wizard.errors.saveFailed')
Line 464: 'Failed to activate product'           → t('products.wizard.errors.activateFailed')
Line 607: 'Loading...'                           → t('common.loading')
```

### 6B — `components/products/step-eligibility.tsx` (2 strings)

```
Line 72:  "e.g. 300" (placeholder)               → t('products.wizard.eligibility.placeholder.minScore')
Line 96:  "e.g. 1" (placeholder)                 → t('products.wizard.eligibility.placeholder.minHistory')
```

### 6C — `components/products/step-fees.tsx` (2 strings)

```
Line 88:  'e.g. 10.00' / 'e.g. 2.5' (placeholders) → t('products.wizard.fees.placeholder.flatAmount') / t('products.wizard.fees.placeholder.percentage')
```

### 6D — `components/products/step-financial-terms.tsx` (3 strings)

```
Line 179: "Cooling-Off Period (hours)"           → t('products.wizard.financial.coolingOffLabel')
Line 188: "0" (placeholder)                      → t('products.wizard.financial.placeholder.coolingOff')
Line 189: "Consumer protection period..."        → t('products.wizard.financial.coolingOffHelp')
```

### 6E — `components/products/step-funding-source.tsx` (2 strings)

```
Line 209: "e.g. 1.5" (placeholder)               → t('products.wizard.funding.placeholder.insuranceRate')
Line 262: 'e.g. 40' (placeholder)                → t('products.wizard.funding.placeholder.lenderShare')
```

### 6F — `components/products/step-notifications.tsx` (6 strings)

```
Lines 28-31: Default SMS/email templates — all 4 are full English sentences with template vars
             → t('products.wizard.notifications.template.approved'), .disbursed, .reminder, .overdue
Line 106: 'SMS'                                  → t('products.wizard.notifications.channel.sms')
Line 107: 'Email'                                → t('products.wizard.notifications.channel.email')
```

### 6G — `components/products/step-review.tsx` (6 strings)

```
Line 107: 'days' (unit suffix)                   → t('common.days')
Line 108: "Cooling-Off Period" (label)            → t('products.wizard.review.coolingOff')
Line 108: 'hours' (unit suffix)                  → t('common.hours')
Line 108: 'Disabled'                             → t('common.disabled')
Lines 109-110: 'days' (repeated)                 → t('common.days')
```

### 6H — `components/products/validation.ts` (3 strings)

```
Line 82:  'Minimum Amount'                       → t('products.wizard.validation.fieldMinAmount')
Line 99:  'Minimum Tenor'                        → t('products.wizard.validation.fieldMinTenor')
Line 318: Full warning about missing notification templates → t('products.wizard.validation.missingTemplates', { events: missingEvents.join(', ') })
```

---

## Module 7: Report Components (~170 strings — 10 files)

None of the report components use `t()`. Add `useI18n` import to each.

### 7A — `components/reports/report-layout.tsx` (10 strings)

```
Line 40:  "All reports"                          → t('reports.layout.allReports')
Line 48:  'Live · Report' (default eyebrow)      → t('reports.layout.defaultEyebrow')
Line 67:  "CSV"                                  → t('reports.layout.csv')
Line 73:  "PDF"                                  → t('reports.layout.pdf')
Line 86:  "Product"                              → t('reports.layout.productFilter')
Line 90:  'All products'                         → t('reports.layout.allProducts')
Lines 91-94: 'Overdraft', 'Micro loan', 'BNPL', 'Invoice factoring'
             → t('reports.layout.product.overdraft'), .microLoan, .bnpl, .invoiceFactoring
```

### 7B — `components/reports/report-filter-bar.tsx` (10 strings)

```
Lines 38-100: Preset labels: 'Last 7 days', 'Last 30 days', 'This month', 'Last month', 'This quarter', 'Last quarter', 'Year to date', 'Custom'
              → t('reports.filter.last7'), .last30, .thisMonth, .lastMonth, .thisQuarter, .lastQuarter, .ytd, .custom
Line 238: "Range"                                → t('reports.filter.range')
Line 269: "Apply"                                → t('reports.filter.apply')
```

### 7C — `components/reports/collections-report.tsx` (20 strings)

```
Line 69:  'Collections Report' (PDF title)       → t('reports.collections.pdfTitle')
Lines 75,155: "Loading…"                         → t('common.loading')
Lines 79-81: Title, eyebrow, subtitle            → t('reports.collections.title'), .eyebrow, .subtitle
Lines 87-90: Metric labels: 'Overdue', 'Delinquent', 'Default', 'Total in collections'
             → t('reports.collections.metric.overdue'), .delinquent, .default, .totalInCollections
Line 95:  "Monthly recovery rate (%)"            → t('reports.collections.monthlyRecoveryRate')
Line 106: "Recovery action effectiveness"        → t('reports.collections.recoveryEffectiveness')
Lines 111-115: Column headers                    → t('reports.collections.column.action'), .sent, .responded, .recovered, .successRate
Line 124: "Aging analysis"                       → t('reports.collections.agingAnalysis')
Lines 129-132: Column headers                    → t('reports.collections.column.bucket'), .contracts, .amount, .percentOfTotal
```

### 7D — `components/reports/customer-acquisition-report.tsx` (14 strings)

```
Line 66:  'Customer Acquisition Report' (PDF)    → t('reports.customerAcquisition.pdfTitle')
Lines 76-78: Title, eyebrow, subtitle            → t('reports.customerAcquisition.title'), .eyebrow, .subtitle
Lines 85-87: Metric labels                       → t('reports.customerAcquisition.metric.newCustomers'), .firstLoan, .avgConversion
Line 92:  "Weekly new customer registrations"    → t('reports.customerAcquisition.weeklyChart')
Lines 103-107: Column headers                    → t('reports.customerAcquisition.column.period'), .newCustomers, .kycCompleted, .firstLoan, .conversionRate
```

### 7E — `components/reports/disbursement-report.tsx` (11 strings)

```
Line 60:  'Disbursement Report' (PDF)            → t('reports.disbursement.pdfTitle')
Lines 70-72: Title, eyebrow, subtitle            → t('reports.disbursement.title'), .eyebrow, .subtitle
Line 79:  "Daily disbursement volume (GHS)"      → t('reports.disbursement.dailyChart')
Lines 90-94: Column headers                      → t('reports.disbursement.column.date'), .product, .count, .amount, .avgTicket
```

### 7F — `components/reports/portfolio-quality-report.tsx` (18 strings)

```
Line 73:  'Portfolio Quality Report' (PDF)       → t('reports.portfolioQuality.pdfTitle')
Lines 83-85: Title, eyebrow, subtitle            → t('reports.portfolioQuality.title'), .eyebrow, .subtitle
Lines 91-93: Metric labels                       → t('reports.portfolioQuality.metric.activeLoans'), .outstanding, .nplRatio
Line 98:  "PAR 30+ trend (%)"                   → t('reports.portfolioQuality.parTrend')
Line 109: "Portfolio at risk breakdown"          → t('reports.portfolioQuality.parBreakdown')
Lines 113-117: Column headers                    → t('reports.portfolioQuality.column.bucket'), .contracts, .amount, .percentOfPortfolio
Line 126: "Provisioning"                         → t('reports.portfolioQuality.provisioning')
Lines 130-131: Column headers                    → t('reports.portfolioQuality.column.category'), .provisionAmount
Line 137: "Total provision"                      → t('reports.portfolioQuality.totalProvision')
```

### 7G — `components/reports/product-performance-report.tsx` (16 strings)

```
Line 45:  'Product Performance Report' (PDF)     → t('reports.productPerformance.pdfTitle')
Lines 55-57: Title, eyebrow, subtitle            → t('reports.productPerformance.title'), .eyebrow, .subtitle
Lines 66-74: Column headers: 'Product', 'Active', 'Disbursed', 'Outstanding', 'Repayment Rate', 'PAR Rate', 'Avg Ticket', 'Tenor', 'Revenue'
             → t('reports.productPerformance.column.product'), .active, .disbursed, .outstanding, .repaymentRate, .parRate, .avgTicket, .tenor, .revenue
Lines 87-94: Row labels                          → t('reports.productPerformance.row.contracts'), .repaymentRate, .parRate, .revenue
```

### 7H — `components/reports/reconciliation-report.tsx` (14 strings)

```
Line 61:  'Reconciliation Report' (PDF)          → t('reports.reconciliation.pdfTitle')
Lines 71-73: Title, eyebrow, subtitle            → t('reports.reconciliation.title'), .eyebrow, .subtitle
Lines 80-82: Metric labels                       → t('reports.reconciliation.metric.matched'), .unmatched, .exceptions
Line 88:  "Reconciliation runs"                  → t('reports.reconciliation.runsTitle')
Lines 93-98: Column headers                      → t('reports.reconciliation.column.runDate'), .status, .matched, .unmatched, .exceptions, .totalProcessed
```

### 7I — `components/reports/repayment-report.tsx` (12 strings)

```
Line 66:  'Repayment Report' (PDF)               → t('reports.repayment.pdfTitle')
Lines 76-78: Title, eyebrow, subtitle            → t('reports.repayment.title'), .eyebrow, .subtitle
Line 85:  "Daily collections (GHS)"              → t('reports.repayment.dailyChart')
Lines 96-101: Column headers                     → t('reports.repayment.column.date'), .totalCollected, .principal, .interest, .fees, .payments
```

### 7J — `components/reports/revenue-report.tsx` (~45 strings)

```
Line 115: "No revenue data for this period"      → t('reports.revenue.noData')
Lines 153-156: Party labels: 'Lons Platform Fee', 'SP Net Revenue', 'Lender Share', 'SP Product Remainder'
               → t('reports.revenue.party.lonsFee'), .spNet, .lenderShare, .spRemainder
Lines 173-182: Table headers: 'Party', 'Gross Revenue', 'Share %', 'Net Amount'
               → t('reports.revenue.column.party'), .grossRevenue, .sharePercent, .netAmount
Lines 257-261: Breakdown items: 'Interest Income', 'Processing Fees', 'Late Penalties', 'Insurance Premium', 'Other Fees'
               → t('reports.revenue.breakdown.interest'), .processingFees, .latePenalties, .insurancePremium, .otherFees
Line 279: 'Revenue Report' (PDF)                 → t('reports.revenue.pdfTitle')
Lines 293-295: Title, eyebrow, subtitle          → t('reports.revenue.title'), .eyebrow, .subtitle
Lines 302-304: KPI labels                        → t('reports.revenue.kpi.totalRevenue'), .platformFee, .spNetRevenue
Line 310: "No settlement data yet..."            → t('reports.revenue.noSettlementData')
Line 319: "Revenue breakdown"                    → t('reports.revenue.revenueBreakdown')
Line 331: "Summary"                              → t('reports.revenue.summary')
Line 335: "No breakdown data available"          → t('reports.revenue.noBreakdownData')
Line 361: "Total revenue"                        → t('reports.revenue.totalRevenue')
Line 382: "Settlement periods"                   → t('reports.revenue.settlementPeriods')
Lines 389-425: Period table columns              → t('reports.revenue.period.period'), .totalRevenue, .platformFee, .lenderShare, .spShare, .status
Line 431: "No settlement runs found"             → t('reports.revenue.noSettlementRuns')
Line 440: "Settlement Detail"                    → t('reports.revenue.drawer.settlementDetail')
Lines 448-458: Detail labels                     → t('reports.revenue.drawer.period'), .status, .totalRevenue
Line 467: "Platform Billing"                     → t('reports.revenue.drawer.platformBilling')
Line 475: "No platform billing lines"            → t('reports.revenue.drawer.noBillingLines')
Line 493: "SP Internal Splits"                   → t('reports.revenue.drawer.spSplits')
```

---

## Module 8: Screening Pages (10 strings — 2 files)

### 8A — `app/(portal)/screening/page.tsx` (9 strings)

```
Line 149: "Screening hits flagged..."            → t('screening.subtitle')
Line 155: "Awaiting review"                      → t('screening.metric.awaitingReview')
Line 157: "Pending operator action"              → t('screening.metric.awaitingReviewSub')
Line 163: "Matches"                              → t('screening.metric.matches')
Line 165: "MATCH + POTENTIAL"                    → t('screening.metric.matchesSub')
Line 171: "Critical risk"                        → t('screening.metric.criticalRisk')
Line 173: "Immediate review"                     → t('screening.metric.criticalRiskSub')
Line 179: "High risk"                            → t('screening.metric.highRisk')
Line 181: "Investigate"                          → t('screening.metric.highRiskSub')
```

### 8B — `app/(portal)/screening/[id]/page.tsx` (1 string)

```
Line 165: "AML review · "                       → t('screening.detail.amlReviewEyebrow')
```

---

## Module 9: Settings — Integrations (22 strings — 1 file)

### 9A — `app/(portal)/settings/integrations/page.tsx` (22 strings)

```
Line 88:  'Request failed'                       → t('settings.integrations.error.requestFailed')
Lines 156,170: "Integration Settings"/"Integration settings" → t('settings.integrations.title')
Line 171: "Wallet providers and external..."     → t('settings.integrations.subtitle')
Line 174: "Add provider"                         → t('settings.integrations.addProvider')
Line 180: "Wallet providers"                     → t('settings.integrations.walletProviders')
Line 184: "No wallet provider configurations..." → t('settings.integrations.noProviders')
Line 200: "Default"                              → t('settings.integrations.defaultBadge')
Line 210: 'Active' / 'Inactive'                  → t('common.active') / t('common.inactive')
Line 224: 'Testing...' / 'Test Connection'       → t('settings.integrations.testing') / t('settings.integrations.testConnection')
Line 230: "Set Default"                          → t('settings.integrations.setDefault')
Line 238: "Deactivate"                           → t('settings.integrations.deactivate')
Lines 252-253: Success/failure messages           → t('settings.integrations.connectionSuccess', { ms }) / t('settings.integrations.connectionFailed', { error })
Line 265: "Add Wallet Provider"                  → t('settings.integrations.addProviderTitle')
Line 269: "Display Name"                         → t('settings.integrations.displayName')
Line 277: "Provider Type"                        → t('settings.integrations.providerType')
Line 289: "Environment"                          → t('settings.integrations.environment')
Line 301: "API Base URL (optional)"              → t('settings.integrations.apiBaseUrl')
Line 310: "Config JSON"                          → t('settings.integrations.configJson')
Line 323: "Cancel"                               → t('common.cancel')
Line 330: "Create"                               → t('common.create')
```

---

## Module 10: Debug Page (~35 strings — 1 file)

### 10A — `app/(portal)/debug/page.tsx` (35 strings)

```
Lines 153-157: Tab labels: 'API Call Log', 'Adapter Operations', 'Event Bus', 'State Transitions', 'Scoring Breakdowns'
               → t('debug.tab.apiCallLog'), .adapterOps, .eventBus, .stateTransitions, .scoringBreakdowns
Line 197: 'expand' / 'collapse'                  → t('debug.expand') / t('debug.collapse')
Lines 219-223: API log columns: 'Method', 'URL', 'Status', 'Time (ms)', 'Timestamp'
               → t('debug.apiLog.column.method'), .url, .status, .timeMs, .timestamp
Line 226: "No API logs captured yet"             → t('debug.apiLog.emptyMessage')
Lines 240-244: Adapter columns                   → t('debug.adapter.column.adapter'), .operation, .latencyMs, .result, .timestamp
Line 247: "No adapter logs captured yet"         → t('debug.adapter.emptyMessage')
Lines 265-267: Event bus columns                 → t('debug.eventBus.column.eventName'), .timestamp, .payload
Line 273: "No events captured yet"               → t('debug.eventBus.emptyMessage')
Line 319: "Enter entity ID to search..."         → t('debug.stateTransitions.placeholder')
Line 325: "Search"                               → t('common.search')
Line 331: "Enter an entity ID..."                → t('debug.stateTransitions.emptyPrompt')
Line 337: "No state transitions found..."        → t('debug.stateTransitions.emptyMessage')
Lines 423-428: Scoring columns                   → t('debug.scoring.column.customer'), .loanRequest, .model, .finalScore, .decision, .executedAt
Line 434: "No scoring breakdowns captured yet"   → t('debug.scoring.emptyMessage')
Lines 456-461: Rule detail columns               → t('debug.scoring.rule.ruleName'), .passed, .rawScore, .weight, .weighted, .reason
Line 518: "Staging only · Debug" (eyebrow)       → t('debug.eyebrow')
Line 525: "Debug panel" (title)                  → t('debug.title')
Line 528: "Inspect API logs..." (subtitle)       → t('debug.subtitle')
Line 539: "Debug mode" (badge)                   → t('debug.modeBadge')
```

---

## Module 11: Error Boundary (3 strings — 1 file)

### 11A — `components/ui/error-boundary.tsx` (3 strings)

Note: This is a class component — cannot use `useI18n()` hook directly. Wrap the render method with a functional `<I18nWrapper>` or use the context consumer.

```
Line 40:  "Something went wrong"                 → t('common.error')
Line 43:  'An unexpected error occurred.'        → t('common.unexpectedError')
Line 48:  "Try again"                            → t('common.tryAgain')
```

---

## Module 12: Previously Swept Files (from prior agents — already documented)

The following modules were swept in the prior conversation and their hardcoded strings were inventoried. The pattern is identical — add `useI18n` import, wrap all strings in `t()`, add keys to `en.json`. These files should be included in the work:

| Module | Files | Approx. String Count |
|--------|-------|---------------------|
| Dashboard | `app/(portal)/dashboard/page.tsx` | 23 |
| Login | `app/(portal)/login/page.tsx` | 9 |
| Layout | `app/(portal)/layout.tsx` | 3 |
| Error pages | `app/(portal)/error.tsx`, `app/error.tsx` | 4 |
| Alerts | `components/header/alerts-panel.tsx` | 6 |
| Customers list | `app/(portal)/customers/page.tsx` | 14 |
| Customer detail | `app/(portal)/customers/[id]/page.tsx` | 40+ |
| Customer tab-profile | `components/customers/tab-profile.tsx` | 19 |
| Customer tab-contracts | `components/customers/tab-contracts.tsx` | 9 |
| Customer tab-credit-summary | `components/customers/tab-credit-summary.tsx` | 30 |
| Customer tab-financial-profile | `components/customers/tab-financial-profile.tsx` | 6 |
| Customer tab-activity-log | `components/customers/tab-activity-log.tsx` | 3 |
| Customer tab-repayment-history | `components/customers/tab-repayment-history.tsx` | 10 |
| Collections page | `app/(portal)/collections/page.tsx` | 2 |
| Loan applications | `app/(portal)/loans/applications/page.tsx` | 40+ |
| Contracts page | `app/(portal)/loans/contracts/page.tsx` | 13 |
| Contract detail | `app/(portal)/loans/contracts/[id]/page.tsx` | 30+ |
| Overdraft page | `app/(portal)/loans/overdraft/page.tsx` | 20+ |
| Products page | `app/(portal)/products/page.tsx` | 27 |
| Product detail | `app/(portal)/products/[id]/page.tsx` | 1 |
| Reports page | `app/(portal)/reports/page.tsx` | 1 |
| Reports [type] | `app/(portal)/reports/[type]/page.tsx` | 4 |
| Settings page | `app/(portal)/settings/page.tsx` | 12 |
| Audit log | `app/(portal)/settings/audit-log/page.tsx` | 30 |
| Users page | `app/(portal)/settings/users/page.tsx` | 1 |
| Profile page | `app/(portal)/settings/profile/page.tsx` | 14 |
| Tenant settings | `app/(portal)/settings/tenant/page.tsx` | 49 |

---

## Locale File Updates

All new keys go in `apps/admin-portal/src/lib/i18n/locales/en.json`.

The locale file already has these top-level namespaces: `common`, `nav`, `sidebar`, `header`, `login`, `dashboard`, `products`, `lenders`, `merchants`, `customers`, `loans`, `collections`, `screening`, `reports`, `messages`, `settings`, `feedback`, `eyebrow`, `label`, `validation`.

**Add these new namespaces:**
- `platform` — for sp-management, tenant wizard, tenant detail, tenant list
- `debug` — for the debug page

**Add `common.days` and `common.hours`** if not already present:
```json
"days": "days",
"hours": "hours",
"unexpectedError": "An unexpected error occurred."
```

For each module above, create the nested key structure matching the `t()` calls listed. The English values are the original hardcoded strings — copy them verbatim into the locale file under the appropriate key path.

---

## Execution Order

1. **Start with shared infrastructure:** Add any missing `common.*` keys to `en.json`.
2. **Add the `platform` and `debug` namespaces** to `en.json`.
3. **Work module by module** (Modules 1–12), file by file:
   - Add `import { useI18n } from '@/lib/i18n';` if not present.
   - Add `const { t } = useI18n();` at the top of the component function if not present.
   - Replace each hardcoded string with the `t()` call.
   - Add the corresponding key to `en.json`.
4. **Handle `error-boundary.tsx` specially** — class component needs a wrapper or context consumer.
5. **Verify:** Run `grep -rn "\"[A-Z]" --include="*.tsx" apps/admin-portal/src/ | grep -v "t(" | grep -v import | grep -v '//'` to catch any remaining hardcoded strings.
6. **Test:** Verify the app renders correctly with no broken strings.

---

## Summary

| Module | Files | Strings |
|--------|-------|---------|
| 1. Merchants | 3 | 31 |
| 2. Collections components | 5 | 83 |
| 3. Loans components | 4 | 64 |
| 4. Lenders | 3 | 41 |
| 5. Platform | 4 | 85 |
| 6. Product wizard | 8 | 24 |
| 7. Reports | 10 | ~170 |
| 8. Screening | 2 | 10 |
| 9. Settings/integrations | 1 | 22 |
| 10. Debug | 1 | 35 |
| 11. Error boundary | 1 | 3 |
| 12. Previously swept pages | ~27 | ~296 |
| **TOTAL** | **~69 files** | **~864 strings** |

**Estimated locale keys to add: ~500+ new keys** (many strings will map to existing `common.*` keys).

Report back when done — confirm the `grep` verification step passes clean.
