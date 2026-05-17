-- Sprint 18 code-review fix I3 — partial unique index on
-- upgrade_requests to make "at most one pending request per tier"
-- a DB-enforced invariant rather than a race-prone app-level check.
-- Catches concurrent click-the-button-twice scenarios from the
-- billing dashboard and from CLI tooling alike.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS "upgrade_requests_pending_one_per_tier"
  ON "upgrade_requests" ("tenant_id", "requested_tier")
  WHERE "status" = 'pending';
