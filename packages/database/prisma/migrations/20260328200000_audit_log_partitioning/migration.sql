-- Sprint 7 S4: Audit log monthly partitioning for production scale
-- Converts audit_logs to a range-partitioned table by created_at

-- Step 1: Rename existing table
ALTER TABLE audit_logs RENAME TO audit_logs_legacy;

-- Step 2: Create partitioned table with same structure
CREATE TABLE audit_logs (
  LIKE audit_logs_legacy INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
) PARTITION BY RANGE (created_at);

-- Step 3: Create monthly partitions (Mar 2026 through Feb 2028 = 24 months)
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

-- Step 4: Migrate existing data
INSERT INTO audit_logs SELECT * FROM audit_logs_legacy;

-- Step 5: Drop legacy table
DROP TABLE audit_logs_legacy;

-- Step 6: Re-apply audit_writer grants
GRANT INSERT, SELECT ON audit_logs TO audit_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM audit_writer;
