# Lons Platform — Credentials & Access Guide

> **WARNING**: This file contains development credentials only. Never use these in production.

---

## Service URLs & Ports

| Service | URL | Description |
|---|---|---|
| SP Admin Portal | http://localhost:3100 | Tenant operator portal (glassmorphism UI) |
| Platform Admin Portal | http://localhost:3200 | System administration portal |
| GraphQL Playground | http://localhost:3000/graphql | Apollo Sandbox — interactive API explorer |
| REST API | http://localhost:3001/v1 | SP integration REST API |
| Swagger / OpenAPI Docs | http://localhost:3001/api/docs | Interactive API documentation |
| Scoring Service | http://localhost:8000 | Python ML credit scoring |
| Scoring Health | http://localhost:8000/health | Scoring service health check |
| Prisma Studio | Run `pnpm db:studio` | Visual database browser |

---

## Platform Admin

Login at: **http://localhost:3200**

| Field | Value |
|---|---|
| Email | `admin@lons.io` |
| Password | `AdminPass123!@#` |
| Role | `platform_admin` |
| Scope | Full platform access — view all tenants, system health |

GraphQL login (no portal needed):
```graphql
mutation {
  loginPlatformUser(email: "admin@lons.io", password: "AdminPass123!@#") {
    accessToken
    refreshToken
  }
}
```

---

## Tenant Users

Login at: **http://localhost:3100**

### QuickCash Ghana (`quickcash-gh`)

| Role | Email | Password |
|---|---|---|
| SP Admin | `spadmin@quickcash.gh` | `SpAdmin123!@#` |
| SP Operator | `operator@quickcash.gh` | `Operator123!@#` |
| SP Analyst | `analyst@quickcash.gh` | `Analyst123!@#` |
| SP Auditor | `auditor@quickcash.gh` | `Auditor123!@#` |
| SP Collections | `collections@quickcash.gh` | `Collections123!@#` |

### Pesa Express Kenya (`pesa-express-ke`)

| Role | Email | Password |
|---|---|---|
| SP Admin | `spadmin@pesaexpress.ke` | `SpAdmin123!@#` |
| SP Operator | `operator@pesaexpress.ke` | `Operator123!@#` |
| SP Analyst | `analyst@pesaexpress.ke` | `Analyst123!@#` |
| SP Auditor | `auditor@pesaexpress.ke` | `Auditor123!@#` |
| SP Collections | `collections@pesaexpress.ke` | `Collections123!@#` |

### NairaLend Nigeria (`nairalend-ng`)

| Role | Email | Password |
|---|---|---|
| SP Admin | `spadmin@nairalend.ng` | `SpAdmin123!@#` |
| SP Operator | `operator@nairalend.ng` | `Operator123!@#` |
| SP Analyst | `analyst@nairalend.ng` | `Analyst123!@#` |
| SP Auditor | `auditor@nairalend.ng` | `Auditor123!@#` |
| SP Collections | `collections@nairalend.ng` | `Collections123!@#` |

---

## Role Permissions

| Role | Permissions |
|---|---|
| SP Admin | Full tenant access (all operations) |
| SP Operator | Products (read), customers (CRUD), loan requests (CRUD + process), contracts (read), repayments (CRUD), subscriptions (CRUD) |
| SP Analyst | Read-only: products, customers, loan requests, contracts, repayments, analytics |
| SP Auditor | Read-only + PII access + audit logs |
| SP Collections | Customer read + PII, contracts (read + update), repayments (CRUD), loan requests (read), customer blacklist |

---

## Database

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `lons` |
| User | `lons` |
| Password | `lons_dev_password` |
| Connection URL | `postgresql://lons:lons_dev_password@localhost:5432/lons` |

Connect via psql:
```bash
psql postgresql://lons:lons_dev_password@localhost:5432/lons
```

Or use Prisma Studio:
```bash
pnpm db:studio
```

---

## Redis

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `6379` |
| Password | (none) |
| Connection URL | `redis://localhost:6379` |

---

## REST API Authentication

### Bearer Token (recommended)

1. Get a token via GraphQL:
```bash
curl -s -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { loginBySlug(slug: \"quickcash-gh\", email: \"spadmin@quickcash.gh\", password: \"SpAdmin123!@#\") { accessToken } }"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['loginBySlug']['accessToken'])"
```

2. Use the token in REST requests:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/v1/products
```

### API Key (server-to-server)

```bash
curl -H "X-API-Key: quickcash-gh_demo-key" \
     -H "X-API-Secret: demo-secret" \
     http://localhost:3001/v1/products
```

---

## GraphQL Authentication

### Tenant User Login (by slug)
```graphql
mutation {
  loginBySlug(slug: "quickcash-gh", email: "spadmin@quickcash.gh", password: "SpAdmin123!@#") {
    accessToken
    refreshToken
  }
}
```

### Tenant User Login (by ID)
```graphql
mutation {
  loginTenantUser(tenantId: "<tenant-uuid>", email: "spadmin@quickcash.gh", password: "SpAdmin123!@#") {
    accessToken
    refreshToken
  }
}
```

### Platform Admin Login
```graphql
mutation {
  loginPlatformUser(email: "admin@lons.io", password: "AdminPass123!@#") {
    accessToken
    refreshToken
  }
}
```

### Token Refresh
```graphql
mutation {
  refreshToken(refreshToken: "<refresh_token>") {
    accessToken
    refreshToken
  }
}
```

### Using the Token

In GraphQL Playground, set HTTP headers:
```json
{
  "Authorization": "Bearer <access_token>"
}
```

---

## JWT Token Details

| Field | Value |
|---|---|
| Algorithm | RS256 |
| Access Token Expiry | 3600 seconds (1 hour) |
| Refresh Token Expiry | 604800 seconds (7 days) |
| Payload | `{ sub, tenantId, role, permissions, type, iat, exp }` |

---

## Scoring Service

### Health Check
```bash
curl http://localhost:8000/health
```

### Score a Customer
```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "any-uuid",
    "features": {
      "account_age_days": 365,
      "kyc_level": 3,
      "payment_history_pct": 95,
      "transaction_frequency": 20,
      "existing_debt_ratio": 15,
      "income_consistency": 85,
      "requested_amount": 1000
    }
  }'
```

---

## Seed Data Summary

| Tenant | Country | Currency | Products | Customers | Contracts |
|---|---|---|---|---|---|
| QuickCash Ghana | GHA | GHS | 4 (3 active, 1 draft) | 20 | 8 |
| Pesa Express Kenya | KEN | KES | 4 (3 active, 1 suspended) | 20 | 8 |
| NairaLend Nigeria | NGA | NGN | 4 (2 active, 2 draft) | 20 | 8 |

---

## Starting the Platform

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Database setup (first time)
pnpm db:migrate:dev -- --name init
pnpm db:seed

# 4. Build
pnpm build

# 5. Start all NestJS services + portals (Terminal 1)
pnpm dev

# 6. Start Python scoring service (Terminal 2)
cd services/scoring-service
.venv/bin/uvicorn app.main:app --port 8000
```

---

## Password Policy

- Minimum 12 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character (`!@#$%^&*()_+-=[]{}';:"|,.<>/?`)
