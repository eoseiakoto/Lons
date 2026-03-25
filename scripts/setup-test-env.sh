#!/usr/bin/env bash
# =============================================================================
# Lons Platform — Test Environment Setup
# Run this BEFORE test-platform.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Lons Platform — Test Environment Setup${NC}"
echo ""

# ---------------------------------------------------------------------------
# 1. Check prerequisites
# ---------------------------------------------------------------------------
echo -e "${YELLOW}1. Checking prerequisites...${NC}"

command -v docker >/dev/null 2>&1 || { echo -e "${RED}docker not found. Install Docker first.${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}node not found. Install Node.js 20+.${NC}"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}python3 not found. Install Python 3.11+.${NC}"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$NODE_VERSION" -lt 20 ]]; then
  echo -e "${RED}Node.js 20+ required, found v$(node -v)${NC}"
  exit 1
fi
echo -e "  ${GREEN}Node.js $(node -v)${NC}"
echo -e "  ${GREEN}Python $(python3 --version)${NC}"
echo -e "  ${GREEN}Docker $(docker --version | cut -d' ' -f3)${NC}"

# ---------------------------------------------------------------------------
# 2. Start infrastructure
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}2. Starting PostgreSQL and Redis...${NC}"
docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null
sleep 3

# Verify containers
if docker ps | grep -q lons-postgres; then
  echo -e "  ${GREEN}PostgreSQL running${NC}"
else
  echo -e "  ${RED}PostgreSQL failed to start${NC}"
  exit 1
fi

if docker ps | grep -q lons-redis; then
  echo -e "  ${GREEN}Redis running${NC}"
else
  echo -e "  ${RED}Redis failed to start${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Create .env if missing
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}3. Checking .env file...${NC}"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo -e "  ${GREEN}Created .env from .env.example${NC}"
else
  echo -e "  ${GREEN}.env exists${NC}"
fi

# ---------------------------------------------------------------------------
# 4. Install dependencies
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}4. Installing dependencies...${NC}"
pnpm install --silent 2>/dev/null || npx pnpm@9 install --silent

# ---------------------------------------------------------------------------
# 5. Run database migrations
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}5. Running database migrations...${NC}"
pnpm --filter @lons/database db:migrate:dev -- --name init 2>/dev/null || \
  npx pnpm@9 --filter @lons/database db:migrate:dev -- --name init 2>/dev/null || \
  echo -e "  ${YELLOW}Migration may already be up to date${NC}"

# ---------------------------------------------------------------------------
# 6. Seed database
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}6. Seeding database...${NC}"
pnpm --filter @lons/database db:seed 2>/dev/null || \
  npx pnpm@9 --filter @lons/database db:seed 2>/dev/null || \
  echo -e "  ${YELLOW}Seed may have already run${NC}"

# ---------------------------------------------------------------------------
# 7. Build all packages
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}7. Building all packages...${NC}"
pnpm build 2>/dev/null || npx pnpm@9 build

# ---------------------------------------------------------------------------
# 8. Setup Python scoring service (optional)
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}8. Setting up Python scoring service (optional)...${NC}"
if [[ -d services/scoring-service ]]; then
  cd services/scoring-service
  python3 -m venv .venv 2>/dev/null || true
  if [[ -f .venv/bin/pip ]]; then
    .venv/bin/pip install -q -r requirements.txt 2>/dev/null
    echo -e "  ${GREEN}Python dependencies installed${NC}"
  else
    echo -e "  ${YELLOW}Could not create venv — install manually: cd services/scoring-service && pip install -r requirements.txt${NC}"
  fi
  cd ../..
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo -e "To run the platform:"
echo -e "  ${YELLOW}Terminal 1:${NC} pnpm dev                                     # All NestJS services"
echo -e "  ${YELLOW}Terminal 2:${NC} cd services/scoring-service && .venv/bin/uvicorn app.main:app --port 8000  # ML scoring"
echo ""
echo -e "To run tests:"
echo -e "  ${YELLOW}Unit tests:${NC}     pnpm test"
echo -e "  ${YELLOW}E2E tests:${NC}      ./scripts/test-platform.sh"
echo ""
echo -e "Credentials:"
echo -e "  Platform Admin:  admin@lons.io / AdminPass123!@#"
echo -e "  SP Admin:        spadmin@demo.lons.io / SpAdmin123!@#"
echo ""
echo -e "URLs:"
echo -e "  GraphQL:         http://localhost:3000/graphql"
echo -e "  REST:            http://localhost:3001/v1/health"
echo -e "  Admin Portal:    http://localhost:3002"
echo -e "  Scoring Service: http://localhost:8000/health"
echo -e "  Prisma Studio:   pnpm --filter @lons/database db:studio"
