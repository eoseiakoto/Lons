# Sprint 18 Fix Cycle Round 2 — 2026-05-18

**Branch:** `claude/hopeful-haibt-32d778`
**Spec:** `Docs/DEV-PROMPT-SPRINT-18-FIXES-2.md`
**Scope:** 1 micro-fix.

## FIX-6B — Sidebar i18n keys

**Files:** `apps/admin-portal/src/lib/i18n/locales/{en,fr,es,sw,ar,ha,pt}.json`

The sidebar at `apps/admin-portal/src/components/layout/sidebar.tsx:219-220` references `nav.apiKeys` and `nav.billing` for the API Keys + Billing entries. Round-1 FIX-6 added `nav.settings` but missed these two siblings, so the sidebar was rendering raw dotted keys.

Added per the spec table:

| Locale | nav.apiKeys | nav.billing |
|---|---|---|
| en | API Keys | Billing & Plan |
| fr | Clés API | Facturation et Plan |
| es | Claves API | Facturación y Plan |
| sw | Funguo za API | Malipo na Mpango |
| ar | مفاتيح API | الفواتير والخطة |
| ha | Maɓallan API | Kuɗi da Shiri |
| pt | Chaves API | Faturamento e Plano |

## Verification

Re-ran the i18n missing-key scan against the live key set in
`apps/admin-portal/src` — **0 missing across all 7 locales**.
