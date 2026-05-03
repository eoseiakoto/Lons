# BA Scope Estimate: Platform Portal i18n Initiative

**From:** BA (Claude)
**To:** PM (Claude)
**Date:** 2026-04-30
**Priority:** Medium
**Monday.com:** Item 11853861856 (Sprint 13)
**Related:** PM delivery review item #5 (platform portal has no i18n infrastructure)

---

## Problem Statement

The platform portal (`apps/platform-portal`) has zero internationalization infrastructure. All user-facing strings are hardcoded English. The admin portal has full i18n with 697 keys across 7 locales — the platform portal has none.

Dev estimated ~100 keys in the delivery notes. BA's audit found the actual count is significantly higher.

---

## String Audit Results

BA audited all 22 pages and 54 source files (51 .tsx, 3 .ts) in the platform portal.

**Total hardcoded strings: ~896**

### Breakdown by Category

| Category | Count | Examples |
|---|---|---|
| Form labels & placeholders | ~180 | "Company Name", "Enter email address", "Select country" |
| Constant maps (status/type labels) | ~120 | `{ active: "Active", suspended: "Suspended" }` |
| Contextual/descriptive text | ~80 | "No service providers match your filters", "This action cannot be undone" |
| Filter options & dropdowns | ~70 | "All Statuses", "Date Range", "Sort by" |
| Table column headers | ~60 | "Provider", "Created", "Total Loans", "Revenue" |
| Metric titles & KPI labels | ~60 | "Total Revenue", "Active Users", "Approval Rate" |
| Page headings & subheadings | ~50 | "Service Provider Management", "Platform Analytics" |
| Button labels | ~45 | "Save Changes", "Apply Filters", "Export CSV" |
| Empty state messages | ~25 | "No data available", "No results found" |
| Status badges | ~20 | "Active", "Pending", "Suspended" |
| Error messages | ~15 | "Failed to load", "Something went wrong" |
| Sidebar navigation items | ~13 | "Dashboard", "Providers", "Analytics", "Settings" |
| Misc (tooltips, confirmations) | ~158 | Various |

### String Pattern Distribution

The strings appear in three patterns, each requiring a different extraction approach:

**Inline JSX (~500 strings):** Strings embedded directly in JSX markup. These are the most straightforward to extract — replace with `t('key')` calls.
```tsx
<h1>Service Provider Management</h1>
```

**Module-scope constants (~250 strings):** Strings defined in `const` arrays or objects outside components. These require restructuring — either move the label resolution into the component (where the `useI18n` hook is available) or pass a translation function into the constant definition.
```tsx
const STATUS_MAP = { active: "Active", suspended: "Suspended" };
const COLUMNS = [{ header: "Provider", key: "name" }];
```

**Component props (~146 strings):** Strings passed as props from parent to child. These need the parent to resolve the translation before passing it down.
```tsx
<MetricCard title="Total Revenue" />
<FilterPill label="All Statuses" />
```

---

## Locale Requirements

The platform portal serves Lōns's own staff (platform operators), not tenant end-users. The locale set can be smaller than the admin portal's 7 locales.

**Recommendation: English + French for v1.0 launch.**

Rationale: Lōns targets West African markets initially (Ghana, Kenya). Ghana's official language is English. For francophone West African expansion (Senegal, Ivory Coast, Cameroon, Mali), French is essential. Other admin portal locales (Arabic, Spanish, Portuguese, Swahili, Hausa) serve tenant-facing features and are less critical for platform operators.

Adding more locales later is straightforward once the i18n infrastructure exists — it's just JSON files. The expensive part is the infrastructure, not the locale count.

---

## Infrastructure Requirements

The platform portal needs the same i18n foundation the admin portal already has:

1. **I18n provider and hook.** Either reuse the admin portal's `I18nProvider` and `useI18n` hook (move to `packages/common` or `packages/shared-types`), or duplicate the pattern. Reuse is strongly preferred — the admin portal's implementation is proven and includes lazy loading by namespace.

2. **Locale files.** Create `apps/platform-portal/src/lib/i18n/locales/{en,fr}.json` with namespace organization matching the portal's page structure.

3. **Number and date formatting.** The platform portal currently hardcodes `'en-GB'` in `formatDate` calls. This needs to become locale-aware using `Intl.DateTimeFormat` and `Intl.NumberFormat` with the active locale.

4. **Pluralization.** Same fragile pattern concern as the admin portal. For v1.0, the manual `count`/`countPlural` pattern is acceptable for English + French. If Arabic is added later, proper ICU MessageFormat becomes necessary.

---

## Recommended Phasing

### Phase 1 — Infrastructure + Navigation (Sprint 13, ~3 Dev days)

Set up the i18n foundation and extract the most visible strings:

- Port or share `I18nProvider` + `useI18n` from admin portal (~4 hours)
- Create English locale file with initial namespace structure (~2 hours)
- Extract sidebar navigation items (13 strings) (~1 hour)
- Extract page headings and subheadings (~50 strings) (~2 hours)
- Extract button labels (~45 strings) (~2 hours)
- Extract error and empty state messages (~40 strings) (~2 hours)
- Wire up locale-aware date/number formatting (~3 hours)

**Phase 1 total: ~148 strings, ~3 Dev days**

After this phase, the portal's chrome (sidebar, headers, buttons, system messages) is fully internationalized. A French-speaking operator would see French navigation and controls even if page content is still English.

### Phase 2 — Tables and Filters (Sprint 13-14, ~3 Dev days)

Extract the data-presentation layer:

- Table column headers across all list pages (~60 strings) (~3 hours)
- Filter options and dropdowns (~70 strings) (~3 hours)
- Status badges and constant maps (~140 strings) (~4 hours)
- Metric titles and KPI labels (~60 strings) (~3 hours)

**Phase 2 total: ~330 strings, ~3 Dev days**

The module-scope constant pattern (~250 strings in this category) is the most labor-intensive. Dev will need to decide on one of two approaches: (a) convert constants to functions that accept a `t` parameter, or (b) move label resolution into the component render and keep constants as key-only objects.

### Phase 3 — Forms and Detail Pages (Sprint 14, ~3 Dev days)

Extract the remaining interaction-heavy strings:

- Form labels and placeholders (~180 strings) (~5 hours)
- Contextual/descriptive text (~80 strings) (~4 hours)
- Remaining miscellaneous strings (~158 strings) (~4 hours)

**Phase 3 total: ~418 strings, ~3 Dev days**

### Phase 4 — French Translation (Sprint 14, ~1 day)

- Translate all ~896 keys to French
- QA pass by a francophone team member
- Verify date/number formatting in French locale

**Phase 4 total: ~1 day (translation) + 0.5 day (QA)**

---

## Total Effort Summary

| Phase | Strings | Dev Effort | Sprint |
|---|---|---|---|
| Phase 1: Infrastructure + Navigation | ~148 | 3 days | Sprint 13 |
| Phase 2: Tables and Filters | ~330 | 3 days | Sprint 13-14 |
| Phase 3: Forms and Detail Pages | ~418 | 3 days | Sprint 14 |
| Phase 4: French Translation | ~896 (all) | 1.5 days | Sprint 14 |

**Total: ~896 keys, ~10.5 Dev days across Sprints 13-14.**

This is roughly 5x Dev's original ~100 key estimate. The discrepancy is because Dev likely counted page-level strings (headings, labels) but not constant maps, filter options, or prop-passed strings.

---

## Dependencies and Risks

**Dependency on admin portal i18n:** If the `I18nProvider` and `useI18n` hook are shared (recommended), any changes to the admin portal's i18n system during Sprints 10-12 (e.g., pluralization refactor) should be coordinated so the platform portal inherits the improvements.

**Constant map refactoring risk:** The ~250 module-scope constant strings require structural changes to how components consume labels. This is the highest-risk area for regressions. Dev should handle the pattern decision (function-based vs. key-only constants) in Phase 2 and apply it consistently.

**No test coverage for i18n:** Neither portal has tests that verify translation completeness or rendering with non-English locales. The CI staleness check recommended in the translation workflow assessment would cover both portals.

---

*PM: This initiative is correctly slotted for Sprint 13. The key input for scheduling is that the actual scope is ~896 strings (not ~100), requiring ~10.5 Dev days across Sprints 13-14. Phase 1 (infrastructure + navigation, 3 days) is the critical path — subsequent phases can be parallelized or deferred if Sprint 14 capacity is tight. Recommend English + French only for v1.0 launch.*
