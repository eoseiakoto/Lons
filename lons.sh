#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  lons.sh — Lōns Platform Service Manager
#  Usage:  ./lons.sh {start|stop|restart|status|logs}
# ─────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Ports & PIDs ────────────────────────────────────────────────────
GRAPHQL_PORT=3000
REST_PORT=3001
SCHEDULER_PORT=3003
ADMIN_PORTAL_PORT=3100
PLATFORM_PORTAL_PORT=3200
SCORING_PORT=8000
POSTGRES_PORT=5432
REDIS_PORT=6379

PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Helpers ─────────────────────────────────────────────────────────
log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_err()   { echo -e "${RED}[ERR]${NC}   $1"; }
log_header(){ echo -e "\n${BOLD}${CYAN}── $1 ──${NC}"; }

check_port() {
  lsof -i :"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port() {
  local port=$1 name=$2 timeout=${3:-30}
  local elapsed=0
  while ! check_port "$port"; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$timeout" ]; then
      log_err "$name failed to start on port $port after ${timeout}s"
      return 1
    fi
  done
  log_ok "$name is running on port $port"
}

# ── Infrastructure ──────────────────────────────────────────────────
start_infra() {
  log_header "Infrastructure (Docker)"

  if ! command -v docker &>/dev/null; then
    log_err "Docker is not installed. Please install Docker Desktop first."
    exit 1
  fi

  if ! docker info &>/dev/null; then
    log_err "Docker daemon is not running. Please start Docker Desktop."
    exit 1
  fi

  local compose_file="infrastructure/docker/docker-compose.yml"
  if [ ! -f "$compose_file" ]; then
    log_err "docker-compose.yml not found at $compose_file"
    exit 1
  fi

  # Remove any stopped containers from previous runs to avoid name conflicts
  docker compose -f "$compose_file" down 2>/dev/null || true
  docker rm -f lons-postgres lons-redis 2>/dev/null || true

  docker compose -f "$compose_file" up -d

  # Wait for PostgreSQL
  local elapsed=0
  while ! docker compose -f "$compose_file" exec -T postgres pg_isready -U lons >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge 30 ]; then
      log_err "PostgreSQL failed to become ready after 30s"
      exit 1
    fi
  done
  log_ok "PostgreSQL is ready on port $POSTGRES_PORT"

  # Wait for Redis
  elapsed=0
  while ! docker compose -f "$compose_file" exec -T redis redis-cli ping >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge 15 ]; then
      log_err "Redis failed to become ready after 15s"
      exit 1
    fi
  done
  log_ok "Redis is ready on port $REDIS_PORT"
}

stop_infra() {
  log_header "Infrastructure (Docker)"
  local compose_file="infrastructure/docker/docker-compose.yml"

  # Try docker compose down with our compose file
  if [ -f "$compose_file" ]; then
    docker compose -f "$compose_file" down 2>/dev/null || true
  fi

  # Also stop lons-specific containers by name (in case started differently)
  for container in lons-postgres lons-redis; do
    if docker ps -q -f name="$container" 2>/dev/null | grep -q .; then
      docker stop "$container" 2>/dev/null || true
      docker rm "$container" 2>/dev/null || true
    fi
  done

  # Check if ports are still occupied
  sleep 1
  local still_running=false
  if check_port $POSTGRES_PORT; then
    log_warn "Port $POSTGRES_PORT still in use — may be a native PostgreSQL installation"
    still_running=true
  fi
  if check_port $REDIS_PORT; then
    log_warn "Port $REDIS_PORT still in use — may be a native Redis installation"
    still_running=true
  fi

  if [ "$still_running" = true ]; then
    log_warn "To force-stop: ./lons.sh stop --force-infra"
  else
    log_ok "Docker services stopped"
  fi
}

# ── TypeScript Services (Turborepo) ─────────────────────────────────
start_ts_services() {
  log_header "TypeScript Services (Turborepo)"
  mkdir -p "$PID_DIR" "$LOG_DIR"

  if ! command -v pnpm &>/dev/null; then
    log_err "pnpm is not installed. Run: npm install -g pnpm"
    exit 1
  fi

  # Build shared packages only (not apps — Next.js apps compile on-the-fly in dev mode)
  log_info "Building shared packages..."
  pnpm --filter '@lons/common' --filter '@lons/shared-types' --filter '@lons/event-contracts' --filter '@lons/database' build 2>&1 | tail -5
  log_ok "Shared packages built"

  # Build backend apps (NestJS needs a build, Next.js apps don't for dev mode)
  log_info "Building backend services..."
  pnpm --filter '@lons/graphql-server' --filter '@lons/rest-server' --filter '@lons/scheduler' build 2>&1 | tail -5
  log_ok "Backend services built"

  # Start turbo dev in background
  log_info "Starting all TypeScript services..."
  nohup pnpm dev > "$LOG_DIR/turbo.log" 2>&1 &
  echo $! > "$PID_DIR/turbo.pid"

  # Wait for each service
  wait_for_port $GRAPHQL_PORT        "GraphQL Server"   60
  wait_for_port $REST_PORT           "REST Server"      60
  wait_for_port $ADMIN_PORTAL_PORT   "Admin Portal"     60
  wait_for_port $PLATFORM_PORTAL_PORT "Platform Portal" 60
  wait_for_port $SCHEDULER_PORT      "Scheduler"        60
}

stop_ts_services() {
  log_header "TypeScript Services"

  # Kill turbo process group if PID file exists
  if [ -f "$PID_DIR/turbo.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/turbo.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 -- -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/turbo.pid"
  fi

  # Always kill anything listening on our ports (handles manually started services)
  local ports=("$GRAPHQL_PORT" "$REST_PORT" "$ADMIN_PORTAL_PORT" "$PLATFORM_PORTAL_PORT" "$SCHEDULER_PORT")
  for port in "${ports[@]}"; do
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null || true
    fi
  done

  # Wait a moment then force-kill any survivors
  sleep 2
  for port in "${ports[@]}"; do
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done

  log_ok "TypeScript services stopped"
}

# ── Scoring Service (Python) ───────────────────────────────────────
start_scoring() {
  log_header "Scoring Service (Python)"
  mkdir -p "$PID_DIR" "$LOG_DIR"

  if ! command -v python3 &>/dev/null; then
    log_err "python3 is not installed."
    exit 1
  fi

  # Install deps if uvicorn not available
  if ! python3 -c "import uvicorn" 2>/dev/null; then
    log_info "Installing Python dependencies..."
    pip3 install -r services/scoring-service/requirements.txt -q
  fi

  log_info "Starting Scoring Service..."
  cd services/scoring-service
  nohup python3 -m uvicorn app.main:app --reload --port $SCORING_PORT > "$LOG_DIR/scoring.log" 2>&1 &
  echo $! > "$PID_DIR/scoring.pid"
  cd "$SCRIPT_DIR"

  wait_for_port $SCORING_PORT "Scoring Service" 20
}

stop_scoring() {
  log_header "Scoring Service"

  # Kill via PID file if it exists
  if [ -f "$PID_DIR/scoring.pid" ]; then
    local pid
    pid=$(cat "$PID_DIR/scoring.pid")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/scoring.pid"
  fi

  # Always kill anything on the scoring port
  local pids
  pids=$(lsof -ti :"$SCORING_PORT" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti :"$SCORING_PORT" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  fi

  log_ok "Scoring Service stopped"
}

# ── Status ──────────────────────────────────────────────────────────
show_status() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║              Lōns Platform — Service Status                 ║${NC}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  printf "  %-24s %-8s %s\n" "SERVICE" "PORT" "STATUS"
  echo "  ──────────────────────────────────────────────────────"

  status_line "PostgreSQL"       $POSTGRES_PORT
  status_line "Redis"            $REDIS_PORT
  echo "  ──────────────────────────────────────────────────────"
  status_line "GraphQL Server"   $GRAPHQL_PORT
  status_line "REST Server"      $REST_PORT
  status_line "Admin Portal"     $ADMIN_PORTAL_PORT
  status_line "Platform Portal"  $PLATFORM_PORTAL_PORT
  status_line "Scheduler"        $SCHEDULER_PORT
  echo "  ──────────────────────────────────────────────────────"
  status_line "Scoring Service"  $SCORING_PORT

  echo ""
}

status_line() {
  local name=$1 port=$2
  if check_port "$port"; then
    printf "  %-24s %-8s ${GREEN}● running${NC}\n" "$name" "$port"
  else
    printf "  %-24s %-8s ${RED}● stopped${NC}\n" "$name" "$port"
  fi
}

# ── Logs ────────────────────────────────────────────────────────────
show_logs() {
  local service=${2:-all}
  case "$service" in
    turbo|ts)
      tail -f "$LOG_DIR/turbo.log" ;;
    scoring|python)
      tail -f "$LOG_DIR/scoring.log" ;;
    all|*)
      tail -f "$LOG_DIR/turbo.log" "$LOG_DIR/scoring.log" ;;
  esac
}

# ── Database ────────────────────────────────────────────────────────
db_migrate() {
  log_header "Database"
  log_info "Generating Prisma client..."
  pnpm db:generate 2>&1 | tail -3
  log_info "Running migrations..."
  pnpm db:migrate 2>&1 | tail -5
  log_ok "Database migrations applied"
}

db_seed() {
  log_info "Seeding database..."
  pnpm db:seed 2>&1 | tail -5
  log_ok "Database seeded"
}

db_setup() {
  db_migrate
  db_seed
}

# ── Main ────────────────────────────────────────────────────────────
case "${1:-help}" in
  start)
    echo -e "\n${BOLD}${CYAN}🚀 Starting Lōns Platform${NC}\n"
    start_infra
    db_migrate
    start_ts_services
    start_scoring
    show_status
    echo -e "${GREEN}${BOLD}All services started.${NC}"
    echo -e "Admin Portal:    ${CYAN}http://localhost:$ADMIN_PORTAL_PORT${NC}"
    echo -e "Platform Portal: ${CYAN}http://localhost:$PLATFORM_PORTAL_PORT${NC}"
    echo -e "GraphQL:         ${CYAN}http://localhost:$GRAPHQL_PORT/graphql${NC}"
    echo -e "REST API:        ${CYAN}http://localhost:$REST_PORT/api/docs${NC}"
    echo -e "Scoring:         ${CYAN}http://localhost:$SCORING_PORT/docs${NC}"
    echo ""
    ;;

  stop)
    echo -e "\n${BOLD}${CYAN}Stopping Lōns Platform${NC}\n"
    stop_scoring
    stop_ts_services

    if [[ "${2:-}" == "--force-infra" ]]; then
      log_header "Infrastructure (Force Stop)"
      # Stop Docker containers
      local compose_file="infrastructure/docker/docker-compose.yml"
      if [ -f "$compose_file" ]; then
        docker compose -f "$compose_file" down 2>/dev/null || true
      fi
      for container in lons-postgres lons-redis; do
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
      done
      # Force-kill anything on the ports
      for port in $POSTGRES_PORT $REDIS_PORT; do
        local pids
        pids=$(lsof -ti :"$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
          echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
      done
      log_ok "Infrastructure force-stopped"
    else
      stop_infra
    fi

    show_status
    echo -e "${YELLOW}All services stopped.${NC}\n"
    ;;

  restart)
    echo -e "\n${BOLD}${CYAN}Restarting Lōns Platform${NC}\n"
    stop_scoring
    stop_ts_services
    stop_infra
    sleep 2
    start_infra
    start_ts_services
    start_scoring
    show_status
    echo -e "${GREEN}${BOLD}All services restarted.${NC}\n"
    ;;

  status)
    show_status
    ;;

  logs)
    show_logs "$@"
    ;;

  db:setup)
    db_setup
    ;;

  db:seed)
    db_seed
    ;;

  help|*)
    echo ""
    echo -e "${BOLD}Lōns Platform Service Manager${NC}"
    echo ""
    echo "Usage: ./lons.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start      Start all services (Docker + DB migrate + TypeScript + Python)"
    echo "  stop       Stop all services"
    echo "  restart    Stop and restart all services"
    echo "  status     Show status of all services"
    echo "  logs       Tail logs (all | turbo | scoring)"
    echo "  db:setup   Run migrations and seed the database"
    echo "  db:seed    Seed the database (without re-running migrations)"
    echo ""
    echo "Examples:"
    echo "  ./lons.sh start"
    echo "  ./lons.sh stop --force-infra"
    echo "  ./lons.sh status"
    echo "  ./lons.sh logs scoring"
    echo "  ./lons.sh restart"
    echo ""
    ;;
esac
