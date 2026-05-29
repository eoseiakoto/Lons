-- S19-STAB-6: audit_logs monthly range partitioning + audit_writer role
--
-- The post-Sprint-18 baseline squash dropped both pieces of DDL that
-- previously lived in archived migrations 20260328200000 (partitioning)
-- and 20260328100000 (audit_writer grants). The baseline kept the table
-- with the composite (id, created_at) primary key — partition-ready —
-- but didn't actually partition it. This migration finishes the job.
--
-- Approach:
--   1. Create the audit_writer role (idempotent).
--   2. Rename existing audit_logs → audit_logs_legacy; free constraint
--      and index names so the new partitioned table can reclaim them.
--   3. Create a new partitioned audit_logs (PARTITION BY RANGE created_at)
--      with the same shape. PK is composite (id, created_at) — required
--      because Postgres mandates every unique/PK on a partitioned table
--      includes the partition column.
--   4. Create 24 monthly partitions spanning 2026-03 through 2027-12 —
--      enough runway for the team to add a partition-management cron
--      (see S19-STAB-6 follow-up notes). Production should adopt
--      pg_partman or similar before 2027 to avoid manual extensions.
--   5. Copy legacy rows into the partitioned table; drop legacy.
--   6. Apply audit_writer grants on the new partitioned table.
--
-- Postgres-specific gotchas handled here:
--   - INCLUDING CONSTRAINTS on LIKE would copy the PK by name and conflict
--     with the freed audit_logs_pkey identifier we want to reclaim. We
--     pass INCLUDING DEFAULTS only, and add the PK explicitly.
--   - Indexes on the partitioned table auto-propagate to existing AND
--     future child partitions, so we declare them once at the parent
--     level.

-- ── Step 1: audit_writer role (idempotent) ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

-- ── Step 2: free names so the partitioned table can reclaim them ───
ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
ALTER TABLE audit_logs_legacy DROP CONSTRAINT audit_logs_pkey;
DROP INDEX IF EXISTS audit_logs_tenant_id_idx;
DROP INDEX IF EXISTS audit_logs_actor_id_idx;
DROP INDEX IF EXISTS audit_logs_resource_type_resource_id_idx;
DROP INDEX IF EXISTS audit_logs_action_idx;
DROP INDEX IF EXISTS audit_logs_created_at_idx;
DROP INDEX IF EXISTS audit_logs_entry_hash_idx;

-- ── Step 3: partitioned audit_logs ─────────────────────────────────
CREATE TABLE audit_logs (
  LIKE audit_logs_legacy INCLUDING DEFAULTS
) PARTITION BY RANGE (created_at);

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at);

-- Recreate indexes at the parent level. These auto-propagate to every
-- partition (existing + future).
CREATE INDEX audit_logs_tenant_id_idx ON audit_logs(tenant_id);
CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_resource_type_resource_id_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
CREATE INDEX audit_logs_entry_hash_idx ON audit_logs(entry_hash);

-- ── Step 4: monthly partitions, 2026-03 through 2027-12 ────────────
-- Each partition is a separate physical table named audit_logs_YYYY_MM.
-- Adding new partitions later: CREATE TABLE audit_logs_YYYY_MM PARTITION
-- OF audit_logs FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_logs_2027_01 PARTITION OF audit_logs FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE audit_logs_2027_02 PARTITION OF audit_logs FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE audit_logs_2027_03 PARTITION OF audit_logs FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE audit_logs_2027_04 PARTITION OF audit_logs FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE audit_logs_2027_05 PARTITION OF audit_logs FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE audit_logs_2027_06 PARTITION OF audit_logs FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE audit_logs_2027_07 PARTITION OF audit_logs FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE audit_logs_2027_08 PARTITION OF audit_logs FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE audit_logs_2027_09 PARTITION OF audit_logs FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE audit_logs_2027_10 PARTITION OF audit_logs FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE audit_logs_2027_11 PARTITION OF audit_logs FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE audit_logs_2027_12 PARTITION OF audit_logs FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Safety net: catch rows outside the defined range (e.g., backfilled data
-- or inserts after 2027-12 if partition extension is delayed). Production
-- should still create monthly partitions proactively via a scheduled job
-- or pg_partman; the default partition is a fallback only.
--
-- Declared BEFORE the legacy data INSERT below so any legacy rows with
-- created_at outside 2026-03..2027-12 route here instead of failing the
-- migration. Also declared before the grant DO-block, which queries
-- pg_inherits — the loop picks up audit_logs_default automatically and
-- applies the same INSERT+SELECT-only grants as the monthly partitions.
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- ── Step 5: migrate legacy rows + drop legacy table ────────────────
INSERT INTO audit_logs SELECT * FROM audit_logs_legacy;
DROP TABLE audit_logs_legacy;

-- ── Step 6: audit_writer grants on the new partitioned table ───────
-- audit_writer needs INSERT (write new logs) + SELECT (read previous_hash
-- for the hash chain). UPDATE/DELETE/TRUNCATE are explicitly revoked so
-- a compromised application role can't tamper with history.
GRANT INSERT, SELECT ON audit_logs TO audit_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM audit_writer;

-- Grant on every partition explicitly too. ALTER DEFAULT PRIVILEGES would
-- only cover future partitions; the loop catches today's set.
DO $$
DECLARE
  partition_name text;
BEGIN
  FOR partition_name IN
    SELECT inhrelid::regclass::text
    FROM pg_inherits
    WHERE inhparent = 'audit_logs'::regclass
  LOOP
    EXECUTE format('GRANT INSERT, SELECT ON %s TO audit_writer', partition_name);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM audit_writer', partition_name);
  END LOOP;
END
$$;

-- Default privileges so any partition created in the future automatically
-- inherits the audit_writer grants (in case partitions are added by hand
-- before pg_partman is in place).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, SELECT ON TABLES TO audit_writer;
