-- Sprint 7 S4: Audit log monthly partitioning for production scale
-- Converts audit_logs to a range-partitioned table by created_at
--
-- Postgres requires every unique/PK on a partitioned table to include the
-- partition column. The legacy table's PK is on (id) alone, so we cannot
-- copy it verbatim — we re-create the table with a composite PK on
-- (id, created_at) and explicitly recreate the supporting indexes.

-- Step 1: Rename existing table + free the constraint and index names so
-- the new partitioned table can claim them without conflict.
ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
ALTER TABLE audit_logs_legacy DROP CONSTRAINT audit_logs_pkey;
DROP INDEX IF EXISTS audit_logs_tenant_id_idx;
DROP INDEX IF EXISTS audit_logs_actor_id_idx;
DROP INDEX IF EXISTS audit_logs_resource_type_resource_id_idx;
DROP INDEX IF EXISTS audit_logs_action_idx;
DROP INDEX IF EXISTS audit_logs_created_at_idx;
DROP INDEX IF EXISTS audit_logs_entry_hash_idx;

-- Step 2: Create partitioned table — columns/defaults only. CHECK constraints,
-- indexes, and the (id, created_at) PK are added explicitly below.
CREATE TABLE audit_logs (
  LIKE audit_logs_legacy INCLUDING DEFAULTS
) PARTITION BY RANGE (created_at);

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at);

-- Step 3: Create monthly partitions (Mar 2026 through Feb 2027)
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_logs_2027_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE audit_logs_2027_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

-- Step 4: Recreate non-PK indexes (these get auto-propagated to partitions)
CREATE INDEX audit_logs_tenant_id_idx ON audit_logs(tenant_id);
CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_resource_type_resource_id_idx ON audit_logs(resource_type, resource_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
CREATE INDEX audit_logs_entry_hash_idx ON audit_logs(entry_hash);

-- Step 5: Migrate existing data
INSERT INTO audit_logs SELECT * FROM audit_logs_legacy;

-- Step 6: Drop legacy table
DROP TABLE audit_logs_legacy;

-- Step 7: Re-apply audit_writer grants
GRANT INSERT, SELECT ON audit_logs TO audit_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM audit_writer;
