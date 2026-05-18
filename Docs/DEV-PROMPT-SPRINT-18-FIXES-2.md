# DEV-PROMPT — Sprint 18 Fix Cycle (Round 2)

**Date:** 2026-05-18
**Branch:** Continue on `claude/hopeful-haibt-32d778`
**Scope:** 1 micro-fix — 2 missing i18n keys from FIX-5/FIX-6

---

## FIX-6B: Add Missing Sidebar i18n Keys

**Problem:** FIX-5 added sidebar entries for API Keys and Billing & Plan that reference `nav.apiKeys` and `nav.billing`. These keys were not added to the locale files during FIX-6. The sidebar renders raw key paths instead of human-readable labels.

**Files:** `apps/admin-portal/src/lib/i18n/locales/{en,fr,es,sw,ar,ha,pt}.json`

**Required change:** Add these 2 keys to all 7 locale files:

| Key | en | fr | es | sw | ar | ha | pt |
|-----|----|----|----|----|----|----|-----|
| `nav.apiKeys` | API Keys | Clés API | Claves API | Funguo za API | مفاتيح API | Maɓallan API | Chaves API |
| `nav.billing` | Billing & Plan | Facturation et Plan | Facturación y Plan | Malipo na Mpango | الفواتير والخطة | Kuɗi da Shiri | Faturamento e Plano |

Place them alongside the existing `nav.settings` key in each file.

**Exit criteria:**
1. ✅ Sidebar shows "API Keys" and "Billing & Plan" (not raw key paths) in English
2. ✅ All 7 locale files contain both keys
3. ✅ No other missing keys introduced
