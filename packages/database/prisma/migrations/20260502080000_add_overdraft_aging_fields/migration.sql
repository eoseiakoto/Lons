-- Sprint 11 · A5: DPD / aging snapshot fields on credit_lines.
--
-- The aging job (apps/scheduler/aging.job.ts) refreshes these once per
-- day. They drive automated bucket-transition actions (notifications,
-- freeze, recovery referral, NPL classification) without recomputing
-- DPD on every read.
--
--   - days_past_due:    Int    — `max(0, today - due_date)` when due_date set
--   - aging_bucket:     VARCHAR(20) — "current"|"watch"|"substandard"|"doubtful"|"loss"
--   - aging_updated_at: TIMESTAMPTZ — last classifier run that touched the row
--
-- All three are nullable / defaulted so the migration is backward
-- compatible with existing rows; the next aging job populates them.

ALTER TABLE "credit_lines"
  ADD COLUMN "days_past_due"     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN "aging_bucket"      VARCHAR(20),
  ADD COLUMN "aging_updated_at"  TIMESTAMPTZ(6);

CREATE INDEX "credit_lines_aging_bucket_idx" ON "credit_lines" ("aging_bucket");
