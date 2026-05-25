#!/usr/bin/env bash
#
# db-fresh-start.sh — local-dev DB reset helper (§3b of MIGRATION-PLAYBOOK.md).
#
# Wipes the public schema, re-applies the migration baseline, runs the base
# seed and the stress/edge-case test seed, restarts the dev stack. Use this
# after pulling a migration-impacting commit that archives or renames
# existing migration files (e.g. a baseline squash). NEVER run against a
# database that holds data you care about — every row is dropped.
#
# Exits non-zero on the first failed step so you don't end up with a half-
# reset state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ── Safety: require local-only DB ─────────────────────────────────────
# Pull DATABASE_URL out of .env. If it points anywhere other than
# localhost / 127.0.0.1, refuse. Better an annoying re-export than a
# wiped staging DB.
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . .env; set +a
fi
DB_URL="${DATABASE_URL:-}"
if [ -z "${DB_URL}" ]; then
  echo "ERROR: DATABASE_URL is not set (checked .env). Cannot proceed."
  exit 1
fi
case "${DB_URL}" in
  *@localhost:*|*@127.0.0.1:*|*@host.docker.internal:*) ;;
  *)
    echo "ERROR: db:fresh-start refuses to run against a non-local DATABASE_URL."
    echo "  Resolved: ${DB_URL}"
    echo "  Allowed hosts: localhost, 127.0.0.1, host.docker.internal"
    echo ""
    echo "If you genuinely need to wipe a remote DB (you almost certainly do not),"
    echo "use the staging procedure in Docs/MIGRATION-PLAYBOOK.md §4 instead, or"
    echo "execute the SQL by hand and accept the consequences."
    exit 1
    ;;
esac

# ── Stop services + ensure Postgres is up ────────────────────────────
echo "→ Stopping dev stack..."
./lons.sh stop >/dev/null 2>&1 || true

COMPOSE_FILE="infrastructure/docker/docker-compose.yml"
if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "ERROR: ${COMPOSE_FILE} not found — wrong cwd?"
  exit 1
fi

echo "→ Starting Postgres + Redis..."
docker compose -f "${COMPOSE_FILE}" up -d
echo "  Waiting for Postgres readiness..."
until docker exec lons-postgres pg_isready -U lons >/dev/null 2>&1; do sleep 1; done

# ── Wipe + reapply schema ────────────────────────────────────────────
echo "→ Dropping + recreating public schema (DESTRUCTIVE)..."
docker exec -i lons-postgres psql -U lons -d lons -c \
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "→ Applying baseline migration..."
pnpm --filter @lons/database db:migrate >/dev/null

# ── Seed ─────────────────────────────────────────────────────────────
echo "→ Running base seed (3 tenants, platform admin)..."
pnpm db:seed >/dev/null

echo "→ Running test seed (stress + edge personas)..."
pnpm --filter @lons/database db:seed:test >/dev/null

# ── Restart services ─────────────────────────────────────────────────
echo "→ Starting dev stack..."
./lons.sh start

echo ""
echo "✓ db:fresh-start complete."
echo "  Platform admin:  admin@lons.io / AdminPass123!@#"
echo "  Tenant admin:    spadmin@quickcash.gh / SpAdmin123!@#"
echo "                   spadmin@pesaexpress.ke / SpAdmin123!@#"
echo "                   spadmin@nairalend.ng / SpAdmin123!@#"
