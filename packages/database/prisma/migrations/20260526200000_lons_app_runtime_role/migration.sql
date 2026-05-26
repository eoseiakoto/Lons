-- S19-STAB-1 follow-up (PM Q1 = option b): non-owner runtime role
--
-- The RLS policies in 20260526100000 are silent in dev because the
-- application currently connects as `lons` (the table owner) and
-- Postgres bypasses RLS for table owners by default. This migration
-- provisions a separate non-owner role `lons_app` for runtime
-- connections so the policies enforce naturally — no FORCE ROW LEVEL
-- SECURITY needed, no set_config bypass calls scattered through
-- every future migration.
--
-- Two-role split:
--   - `lons`     (table owner)       — used by `prisma migrate deploy`
--                                       and `pnpm db:seed`. Bypasses
--                                       RLS by being the owner.
--   - `lons_app` (non-owner runtime) — used by the application
--                                       (graphql-server, rest-server,
--                                       scheduler, etc.). Subject to
--                                       RLS; queries must set the
--                                       session vars to see anything.
--
-- The split is wired at the Prisma layer via `directUrl` in
-- schema.prisma: DATABASE_URL points at lons_app for runtime; the
-- migrate/seed commands route through DIRECT_DATABASE_URL (lons).
--
-- Dev password: 'lons_app_dev_password' is hardcoded for local-only
-- development; the .env.example placeholder makes this explicit. For
-- staging/prod, the role must be created with a strong password from
-- the secret manager — that provisioning is out of scope for this
-- migration. See Docs/MIGRATION-PLAYBOOK.md §6 for the production
-- bootstrap procedure (to be amended in this same commit).

-- ── Create role if not exists ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lons_app') THEN
    CREATE ROLE lons_app WITH LOGIN PASSWORD 'lons_app_dev_password';
  END IF;
END
$$;

-- ── Connection + schema usage ──────────────────────────────────────
GRANT CONNECT ON DATABASE lons TO lons_app;
GRANT USAGE ON SCHEMA public TO lons_app;

-- ── DML privileges on every existing table ─────────────────────────
-- lons_app gets SELECT/INSERT/UPDATE/DELETE — enough for application
-- workloads. Does NOT get TRUNCATE / CREATE / ALTER / DROP — those
-- stay with the lons owner. Audit history is therefore tamper-
-- evident: lons_app can write new rows but cannot rewrite or wipe
-- past ones.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lons_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lons_app;

-- ── Default privileges for future tables ───────────────────────────
-- Without this, every new migration that creates a table would need
-- to remember to GRANT to lons_app explicitly. ALTER DEFAULT
-- PRIVILEGES makes it automatic for anything the `lons` role creates
-- after this point.
ALTER DEFAULT PRIVILEGES FOR ROLE lons IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lons_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lons IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lons_app;

-- ── audit_writer membership ────────────────────────────────────────
-- audit_writer (created in 20260526000000) has the INSERT/SELECT
-- grants on audit_logs that the AuditService uses. Making lons_app a
-- member of audit_writer means lons_app inherits those grants
-- automatically — the application doesn't need to SET ROLE for audit
-- writes. The REVOKE on UPDATE/DELETE/TRUNCATE still holds because
-- inheritance respects the explicit REVOKEs on the writer role.
GRANT audit_writer TO lons_app;

-- ── Tighten parent revokes (defense-in-depth) ──────────────────────
-- Belt-and-braces: even though lons_app was granted SELECT/INSERT/
-- UPDATE/DELETE on ALL TABLES above, explicitly REVOKE the dangerous
-- bits on audit_logs (parent + every existing partition) to make the
-- intent unambiguous.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM lons_app;
DO $$
DECLARE
  partition_name text;
BEGIN
  FOR partition_name IN
    SELECT inhrelid::regclass::text
    FROM pg_inherits
    WHERE inhparent = 'audit_logs'::regclass
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM lons_app', partition_name);
  END LOOP;
END
$$;
