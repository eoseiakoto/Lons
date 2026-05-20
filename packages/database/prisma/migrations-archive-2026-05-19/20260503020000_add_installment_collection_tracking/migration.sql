-- Sprint 12 G2: BNPL auto-collection scheduler tracking fields.
-- Adds two columns to installment_schedules so the daily auto-collect
-- job can (a) deduplicate same-day re-runs via lastCollectionAttemptAt
-- and (b) cap retries at bnplConfig.collectionRetryMaxAttempts via
-- collectionAttemptCount.
ALTER TABLE "installment_schedules"
  ADD COLUMN "last_collection_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "collection_attempt_count" INTEGER NOT NULL DEFAULT 0;
