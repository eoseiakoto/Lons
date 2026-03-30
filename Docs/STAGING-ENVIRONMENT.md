# Lons Staging Environment — Access & Credentials

## Environment URLs

| Service | URL | Status |
|---|---|---|
| **API (GraphQL + REST)** | https://api.staging.lons.io | Live |
| **Admin Portal** | https://admin.staging.lons.io | Live |
| **Grafana (Monitoring)** | https://grafana.staging.lons.io | Live |
| **GraphQL Endpoint** | https://api.staging.lons.io/graphql | Live |
| **REST API** | https://api.staging.lons.io/v1 | Live |
| **Health Check** | https://api.staging.lons.io/health | Live |

> **Note:** TLS certificates are issued by Let's Encrypt Staging. Your browser will show a certificate warning — this is expected for staging. Accept the warning to proceed.

---

## AWS Account

- **Account ID:** 053414411791
- **Region:** eu-west-1 (Ireland)
- **IAM User:** lons-admin
- **Console:** https://053414411791.signin.aws.amazon.com/console

---

## Kubernetes (EKS)

- **Cluster:** lons-eks-staging (v1.31)
- **Namespace:** lons-staging
- **Nodes:** 3x t3.medium (managed node group)

To connect:
```bash
aws eks update-kubeconfig --name lons-eks-staging --region eu-west-1
kubectl get pods -n lons-staging
```

### Running Services

| Service | Pod | Port | Replicas |
|---|---|---|---|
| GraphQL Server | lons-graphql-server | 3000 | 1 |
| REST Server | lons-rest-server | 3001 | 1 |
| Scheduler | lons-scheduler | 3002 | 1 |
| Notification Worker | lons-notification-worker | 3003 | 1 |
| Scoring Service | lons-scoring-service | 8000 | 1 |
| Admin Portal | lons-admin-portal | 3100 | 1 |

---

## Database (RDS PostgreSQL)

- **Host:** lons-staging-db.cr4gsmaya9z4.eu-west-1.rds.amazonaws.com
- **Port:** 5432
- **Database:** lons
- **Username:** lonsadmin
- **Password:** Stored in AWS Secrets Manager → `lons/staging/database`
- **Engine:** PostgreSQL 16, db.t4g.small, Multi-AZ

---

## Cache (ElastiCache Redis)

- **Host:** lons-staging-redis.1kyjsl.ng.0001.euw1.cache.amazonaws.com
- **Port:** 6379
- **Engine:** Redis 7.1, cache.t4g.micro

---

## Grafana (Monitoring Dashboard)

- **URL:** https://grafana.staging.lons.io
- **Username:** admin
- **Password:** LonsStaging2026!
- **Stack:** kube-prometheus-stack (Prometheus + Grafana)

---

## Container Registry (ECR)

- **Registry:** 053414411791.dkr.ecr.eu-west-1.amazonaws.com
- **Repositories:**
  - lons/graphql-server
  - lons/rest-server
  - lons/scheduler
  - lons/notification-worker
  - lons/scoring-service
  - lons/admin-portal
- **Current Tag:** staging-latest

---

## CI/CD (CodeBuild)

- **Project:** lons-staging-build
- **Source:** S3 bucket `lons-codebuild-source-053414411791`
- **Build Role:** arn:aws:iam::053414411791:role/lons-codebuild-role

---

## DNS (Route53)

- **Hosted Zone:** Z09151071W91RMNBP4IUI (lons.io)
- **Records:**
  - api.staging.lons.io → CNAME → NLB
  - admin.staging.lons.io → CNAME → NLB
  - grafana.staging.lons.io → CNAME → Grafana ELB

---

## Secrets Management

All secrets are stored in AWS Secrets Manager:

| Secret | Path |
|---|---|
| Database credentials | `lons/staging/database` |
| JWT keys | `lons/staging/jwt` |
| Encryption key | `lons/staging/encryption` |

Kubernetes secrets in `lons-staging` namespace:
- `lons-staging-db-credentials`
- `lons-staging-redis-credentials`
- `lons-staging-app-secrets`

---

## Networking

- **VPC:** vpc-030e1fd5afe4b57da (10.0.0.0/16)
- **Load Balancer (NGINX Ingress):** NLB (internet-facing)
- **cert-manager:** Let's Encrypt Staging ClusterIssuer
- **Network Policies:** Enabled

---

## Current Deployment Notes

- Services are running lightweight stub images (health check responders) pending full application Docker builds
- Database migrations have not yet been run — run `pnpm --filter database db:migrate` when connected
- Sprint 7 code fixes (commit 0ebb0e2) are ready locally but need to be pushed to GitHub
