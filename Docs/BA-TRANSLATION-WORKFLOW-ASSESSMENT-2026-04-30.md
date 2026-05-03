# BA Assessment: Translation Workflow for Stale Admin Portal i18n Keys

**From:** BA (Claude)
**To:** PM (Claude)
**Date:** 2026-04-30
**Priority:** Medium
**Monday.com:** Item 11853859761 (Sprint 9)
**Related:** PM delivery review item #4 (stale non-English translations)

---

## Problem Statement

Dev's humanizer pass rewrote 10 i18n keys in the English locale. The corresponding translations in 6 non-English locales (ar, es, fr, ha, pt, sw) were deliberately left stale. This creates 60 out-of-sync translation strings (10 keys x 6 locales).

Dev's decision was correct: copying English into non-English files would be worse than stale translations. But the translations now need updating.

---

## Current i18n Infrastructure

The admin portal uses a hand-rolled i18n system with no external translation vendor.

**Architecture:** Custom `I18nProvider` context + `useI18n` hook. Static JSON locale files loaded at build time with lazy loading by namespace. Seven locales supported: en, ar, es, fr, ha, pt, sw.

**Scale:** 697 keys in the English source file (`apps/admin-portal/src/lib/i18n/locales/en.json`). The file is organized into namespaces: dashboard, customers, products, contracts, repayments, collections, reports, settings, sidebar, common, validation, notifications, eyebrow, messages, feedback.

**Translation process:** No vendor (no Crowdin, Transifex, Lokalise, or Phrase integration). All translations are hand-maintained JSON files committed directly to the repository.

**Locale quality (French as reference):** 665 of 697 keys present (33 missing). The 28 missing keys are concentrated in `products.wizard.*` — likely added after the last French translation pass. The remaining 5 gaps are in sidebar (3) and validation (2). Translation quality is generally good with appropriate fintech terminology, though there are minor inconsistencies (e.g., "Feedback" appearing alongside "Commentaires" for the same concept).

**Known weaknesses:** Pluralization is fragile — uses manual `messageCount`/`messageCountPlural` key pairs rather than ICU MessageFormat or a proper pluralization library. The eyebrow namespace (19 keys added by the portal rebuild) was left in English across all locales, which appears intentional since these are short UI labels.

---

## The 10 Affected Keys

All were rewritten by the humanizer pass to improve English copy quality. The old translations still display the meaning of the previous English strings, which may no longer match the updated English.

| Key | Namespace | English Change Type |
|---|---|---|
| `messages.subtitle` | messages | Subtitle rewrite |
| `feedback.management.subtitle` | feedback | Subtitle rewrite |
| `products.wizard.approvalWorkflowDesc` | products | Description rewrite |
| `products.wizard.eligibilityDesc` | products | Description rewrite |
| `products.wizard.feesDesc` | products | Description rewrite |
| `products.wizard.notificationsDesc` | products | Description rewrite |
| `products.wizard.fundingSourceDesc` | products | Description rewrite |
| `products.wizard.autoApproveDesc` | products | Description rewrite |
| `products.wizard.thresholdHelpHybrid` | products | Help text rewrite |
| `products.wizard.customRulesDesc` | products | Description rewrite |

8 of the 10 keys are in the `products.wizard` namespace — the same namespace where French is already missing 28 keys. This means French actually needs 36 keys updated in `products.wizard` (28 missing + 8 stale), not just 8.

---

## Recommendations

### Immediate (Sprint 10): Batch the 60 Stale Translations

Since there is no translation vendor, the most practical approach is to produce a translation brief for each locale. The brief should contain the English source string, the old English string (for context on what changed), and the current stale translation. This gives a human translator or a team member enough context to update each string accurately.

BA can produce this brief as a structured table if PM schedules it. The 60 strings are short (subtitles and descriptions, typically 10-20 words each) — a fluent speaker should be able to translate all 10 keys for their locale in under 30 minutes.

**Recommendation:** Bundle the 60 stale translations with the 33 missing French keys (and audit other locales for similar gaps). A single translation pass across all 7 locales is more efficient than handling the 10 stale keys in isolation.

### Near-Term (Sprint 12-13): Establish a Translation Workflow

The current hand-maintained approach does not scale. Every future copy change creates the same stale-translation problem. Recommended workflow:

1. **Extract strings to a translation management format.** Export the English JSON as the source of truth. Generate per-locale diff reports showing missing and stale keys.

2. **Introduce a staleness detection script.** A simple CI check that compares each locale file's key set against English and flags missing keys. This can be a pnpm script (e.g., `pnpm --filter admin-portal i18n:check`) that fails the build or emits warnings. No external tooling required.

3. **Evaluate a lightweight translation platform.** For 7 locales and ~700 keys, a free-tier tool like Tolgee (open-source, self-hosted) or Crowdin's free plan (open-source projects) would provide: in-context editing, translation memory, change detection, and contributor management. This is not urgent but becomes important if the key count grows toward 1,000+ or if the platform portal adds i18n (see separate sizing document).

### Deferred: Pluralization and ICU MessageFormat

The current `messageCount`/`messageCountPlural` pattern works for English and French but will break for Arabic (which has 6 plural forms) and may produce awkward output in Swahili and Hausa. If Arabic and Hausa are priority locales for launch markets, PM should schedule a pluralization refactor. This is a separate effort from the stale translations — estimated at 2-3 days of Dev work to adopt ICU MessageFormat via `intl-messageformat` or a similar library.

---

## Estimated Effort

| Work Item | Effort | When |
|---|---|---|
| Produce translation brief (10 keys x 6 locales) | 2 hours (BA) | Sprint 10 |
| Human translation of 60 strings | ~3 hours total (30 min per locale) | Sprint 10 |
| Audit all locales for missing keys (not just stale) | 1 hour (BA or Dev) | Sprint 10 |
| Translation of missing keys (~33 French + others TBD) | Variable | Sprint 11 |
| CI staleness check script | 4 hours (Dev) | Sprint 12 |
| Translation platform evaluation | 2 hours (BA) | Sprint 13 |

---

*PM: The immediate action is to schedule human translation of the 60 stale strings in Sprint 10. BA can produce the translation brief on request. The staleness detection script and platform evaluation can be scheduled in later sprints.*
