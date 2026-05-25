-- Create a restricted role for audit log writes
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

-- Grant INSERT-only on audit_logs to audit_writer
GRANT INSERT ON audit_logs TO audit_writer;

-- Explicitly revoke UPDATE and DELETE
REVOKE UPDATE, DELETE ON audit_logs FROM audit_writer;

-- Grant SELECT for hash chain lookups (needed by AuditService.log)
GRANT SELECT ON audit_logs TO audit_writer;

-- Also revoke TRUNCATE for extra safety
REVOKE TRUNCATE ON audit_logs FROM audit_writer;

-- NOTE: The application connection should use the audit_writer role
-- when writing audit logs. This can be done via SET ROLE or a
-- separate connection string. For now, the grants establish the
-- permission boundary; role switching will be wired in Sprint 7
-- with the full infrastructure setup.
