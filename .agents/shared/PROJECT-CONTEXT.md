# Lōns Platform — Shared Project Context

**Last updated:** 2026-04-27
**Read this file at the start of every session.** It provides the shared context all agents need regardless of role.

---

## Project Overview

Lōns is a B2B2C fintech platform enabling financial institutions (Service Providers / SPs) to offer and manage loan products through digital wallets and telecom systems. It targets underbanked demographics in African markets, launching in Ghana and Kenya.

**Four product types:** Micro-Loan, Overdraft, BNPL, Invoice Factoring — all confirmed in-scope for v1.0.

**Deadline:** June 30, 2026 — firm.

---

## Team Structure

There are **4 agent roles**, each running in its own Cowork session, all mounting the same `Lons/` workspace folder:

| Role | Agent | Profile | Primary Outputs |
|---|---|---|---|
| **Business Analyst (BA)** | Dedicated Claude agent | `.agents/ba/AGENT.md` | Specs, ADRs, entity models, gap analysis, requirements coverage |
| **Product Manager (PM)** | Dedicated Claude agent | `.agents/pm/AGENT.md` | Roadmap, sprint plans, Monday.com management, decisions, stakeholder comms |
| **Developer (Dev)** | Dedicated Claude agent | `.agents/dev/AGENT.md` | Code implementation across all services, tests, migrations |
| **Deployment Engineer (DE)** | Dedicated Claude agent | `.agents/de/AGENT.md` | AWS infrastructure, Terraform, Helm, CI/CD, DNS, go-live ops |

**Project Owner:** Emmanuel O-A (eoseiakoto@gmail.com) — makes final product and brand direction decisions.

---

## Coordination Protocols

### How agents hand off work

1. **BA → PM:** BA produces specs in `Docs/` (e.g., `SPEC-*.md`, `ADR-*.md`). BA posts gap items and assessment summaries to Monday.com. PM reviews, makes decisions, and documents responses in `Docs/PM-RESPONSE-*.md`.

2. **PM → Dev:** PM creates sprint dev prompts in `Docs/SPRINT-*-DEV-PROMPT.md` with task-by-task implementation specs. PM decomposes epics into sub-tasks on Monday.com (board 18405683508).

3. **Dev → PM:** Dev completes implementation and updates Monday.com item status. PM reviews deliveries, identifies gaps, and either marks Done or requests remediation.

4. **PM → BA:** PM prepares briefing notes (e.g., `Docs/BA-BRIEF-*.md`) when spec-level analysis is needed. Emmanuel routes to BA agent.

5. **PM → DE:** PM assigns infrastructure tasks on Monday.com. DE executes and updates status.

6. **BA ↔ Dev:** No direct handoff. BA specs inform Dev work through PM intermediation.

### Shared file conventions

| Pattern | Purpose | Who writes | Who reads |
|---|---|---|---|
| `Docs/00-13-*.md` | Requirements docs | BA | All |
| `Docs/SPEC-*.md` | Feature specifications | BA | PM, Dev |
| `Docs/ADR-*.md` | Architecture decisions | BA | PM, Dev |
| `Docs/BA-BRIEF-*.md` | PM briefing notes for BA | PM | BA |
| `Docs/PM-RESPONSE-*.md` | PM decisions on BA findings | PM | BA, Dev |
| `Docs/SPRINT-*-DEV-PROMPT.md` | Dev implementation prompts | PM | Dev |
| `Docs/FIX-*.md` | Bug fix specifications | BA/PM | Dev |
| `CLAUDE.md` | Codebase instructions | Shared | All |

### Monday.com

- **Development Tasks board:** 18405683508
- All agents can read from Monday.com
- PM is the primary Monday.com manager (status updates, item creation, sprint assignments)
- BA posts gap items and assessment updates
- Dev updates item status on completion
- DE updates infrastructure item status

---

## Current Project State (as of 2026-04-27)

### Completed
- **Sprints 1–9:** All Done. Foundation, loan processing core, post-processing, admin portal, integrations foundation, and regulatory foundations (AML, cooling-off, exposure rules, data anonymization, CI quality).
- **BA specs complete:** Overdraft ADR, BNPL Merchant Spec, Invoice Factoring Spec, Plan Tier Matrix — all in `Docs/`.
- **PM decisions made:** All 25 open questions from BA specs decided. Sprint 10–14 decomposed into sub-tasks.

### In Progress / Upcoming
- **Sprint 8 carryover:** 9 items in "In Review" — gate task requires review before Sprint 10 starts.
- **Sprint 10 (Overdraft):** 15 items including EMI Data Integration Layer and Regulatory Caps.
- **Sprint 11 (BNPL):** 13 items.
- **Sprint 12 (Invoice Factoring):** 13 items.
- **Sprint 13A (Plan Tier + API Hardening):** 8 items.
- **Sprint 13B (Security + Audit):** 6 items.
- **Sprint 14 (Go-Live):** 10 items. Code freeze at midpoint. DR runbooks required.

### Infrastructure
- AWS deactivated 2026-04-14 to control costs.
- Staging reactivates at Sprint 13B start.
- Production reactivates at Sprint 14 code freeze.
- DE agent to be briefed at Sprint 13A start.

---

## Key Principles (All Agents)

1. **Money is never a float.** Use `Decimal` / `DECIMAL(19,4)`. Amounts in API responses are strings.
2. **Multi-tenancy is non-negotiable.** Every query is tenant-scoped via JWT. No cross-tenant access outside platform admin.
3. **PII never appears in logs.** Mask all sensitive fields.
4. **Events are the backbone.** All state transitions emit events. Consumers must be idempotent.
5. **Soft deletes only.** No hard deletes for business data. Ledger entries are append-only.
6. **BA analysis stays independent.** BA specs present options and trade-offs. PM decisions live in separate documents. Never merge decisions back into BA specs.

---

## Reference

- Full tech stack and conventions: `CLAUDE.md` (root of repo)
- Requirements docs: `Docs/00-overview.md` through `Docs/13-deployment.md`
- Monday.com board IDs, column IDs, and group IDs: each agent should store these in their own memory if they interact with Monday.com directly
