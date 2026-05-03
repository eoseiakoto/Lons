# @lons/overdraft-service

Overdraft product implementation. Per the ADR (`Docs/ADR-overdraft-realtime.md`),
overdraft runs as a separate NestJS service rather than being forced through
the existing process-engine state machine, because overdraft is:

- **Transaction-triggered**, not customer-initiated.
- **Revolving** — multiple drawdowns against a single approved limit.
- **Real-time** — < 3s end-to-end at point of sale.
- **Auto-repaying** — collects from the next wallet credit.

## Modules

| Module | Responsibility |
|--------|----------------|
| `credit-line` | Credit line activation, deactivation, status transitions, limit tracking. |
| `drawdown` | Real-time drawdown flow: webhook → eligibility check → wallet disbursement → balance update. |
| `repayment` | Auto-repayment from wallet credits + manual repayment, with configurable waterfall allocation. |
| `interest` | Daily interest accrual, penalty accrual, billing cycle consolidation, overdue classification. |
| `limit` | Initial limit assignment, periodic review, manual adjustment with audit trail. |
| `cache` | Redis-backed credit line cache with write-through consistency and `WATCH/MULTI/EXEC` for concurrent drawdowns. |

## Money handling

All monetary fields flow through this service as `string` (Decimal serialization).
No `Number()`, no `parseFloat()`. Arithmetic uses helpers from `@lons/common/financial`
(`add`, `subtract`, `multiply`, `divide`, `bankersRound`, `compare`).

## Tenant isolation

The Sprint 10A RLS layer (`PrismaService.enterTenantContext`, the `$use`
middleware, and the `RlsTenantContextInterceptor`) handles tenant scoping
automatically for HTTP-triggered work. Background consumers (BullMQ
processors for wallet events) must wrap their handlers in
`prisma.enterTenantContext({ tenantId }, ...)` before invoking service
methods — see `services/overdraft-service/src/main.ts` for the pattern.

## Performance budgets

- Drawdown decision (webhook receipt → response): **< 200ms p99**
- Total round-trip (decision → wallet disbursement → response): **< 3s p99**
- Credit line cache TTL: **300s** (refreshed on every drawdown / repayment)
- Concurrent drawdown safety: Redis `WATCH/MULTI/EXEC` for atomic balance check + update.
