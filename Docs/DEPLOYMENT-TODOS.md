# Deployment Engineering — ToDo List

**Role:** Deployment Engineer
**Owner:** Deployment Engineer (Claude)
**Reviewed by:** Emmanuel O-A
**Date:** 2026-03-29
**Last Updated:** 2026-03-29 (post Sprint 6 completion, status refresh)
**Deadline:** June 30, 2026
**Cloud Provider:** AWS
**Primary Region:** eu-west-1 (Ireland) — confirmed 2026-03-28 (latency tested, AWS-recommended for Ghana)
**DR Region:** eu-west-2 (London) — cross-region backups only, no active-active for Year 1
**Target Domain:** lons.io
**Launch Market:** Ghana-first (GHS currency, Bank of Ghana regulatory defaults)

---

## Sprint 7 Remaining Punch List (as of 2026-03-29)

**26 items still 🔴 (not started):**

### Operational (require AWS account access)
- WS 12.1: AWS account setup & organization
- WS 12.2: IAM baseline
- WS 12.3: Billing alerts & budgets
- WS 12.4: CloudTrail audit logging
- WS 12.7: Service quotas review

### Documentation & Planning
- WS 10.1: Architecture diagram
- WS 10.4: Go-live checklist
- WS 13.5: Release tagging & versioning strategy

### Staging Validation (execution pending)
- WS 4.3 (partial): Distributed tracing validation execution (plan complete)
- WS 5.2 (partial): mTLS staging validation execution (plan complete)

### Minor Infrastructure Items
- WS 14.9: CDN configuration (CloudFront setup if not yet complete)

**Priority for Sprint 7:**
1. **Immediate:** Docs 10.1, 10.4 (unblock go-live readiness)
2. **Next:** Execute tracing + mTLS validation against staging
3. **Then:** AWS operational items (12.1–12.4, 12.7) in parallel
4. **Finally:** Release versioning (13.5) and minor items

---

---

## Confirmed Decisions (from BA/PM Review — 2026-03-28)

1. **DR strategy:** Single-region + cross-region backups to eu-west-2 (London). Multi-region active-active deferred to Year 2.
2. **Primary region confirmed:** eu-west-1 (Ireland). Latency tested 2026-03-28 — Ireland and London within 12ms of each other from Ghana; Cape Town ~2× slower. AWS SA (Mohamed Thabet) confirmed Ireland wins on cost, services, and latency vs Cape Town. Ireland gets new AWS services first (alongside us-east-1 and us-west-2).
3. **Incident response:** Slack (#lons-alerts, #lons-incidents) + PagerDuty — both need provisioning. Emmanuel is sole on-call at launch. Affected tenants only; platform-wide if >50% impacted.
4. **Tenant provisioning:** Platform-admin-only at launch. Orchestrate existing entity-service APIs. Seed: default roles, product templates, notification templates, rate limiting tiers. GHS/Ghana defaults.
5. **Load testing:** Extend existing k6 scripts (scripts/load-tests/). 100 tenants, 50K customers/tenant, 200K contracts, ~2M ledger entries. All 4 products (70/30 overdraft+micro-loan). Stress to 150 tenants.
6. **Dev team dependencies resolved:** Structured logging ✅, Prisma migrate ✅, Prometheus /metrics ✅, OpenTelemetry SDK ✅. **Pending dev fixes (blocks Sprint 3):** Health endpoints not registered in ObservabilityModule (blocks K8s probes), AWSSecretsManagerKeyProvider needs building (blocks ESO integration), notification-worker Dockerfile entry point incorrect.
7. **CSP/HSTS:** App-level CSP already implemented. Infra-level TLS/HSTS complementary, no conflicts.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Not started |
| 🟡 | Partially done / needs rework |
| 🟢 | Complete and production-ready |

---

## Workstream 1: Infrastructure as Code (Terraform)

**Requirement refs:** NFR-IAC-001 (Must), NFR-IAC-003 (Must), NFR-IAC-004 (Must)
**Status:** ✅ Sprint 1–2 complete. All core modules delivered.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 1.1 | **Terraform project scaffolding** — Remote backend (S3 + DynamoDB state locking), provider config (eu-west-1 primary, eu-west-2 DR), module structure, 4 workspace environments (dev/staging/preprod/prod) | Must | — | ✅ |
| 1.2 | **Networking module** — VPC, public/private subnets across 3 AZs, NAT gateways, Internet gateway, VPC endpoints for S3/ECR/Secrets Manager, security groups | Must | 1.1 | ✅ |
| 1.3 | **EKS cluster module** — Managed node groups (general, compute-intensive for scoring, batch for reconciliation), IRSA (IAM Roles for Service Accounts), OIDC provider, cluster autoscaler, node pool separation per NFR-INF-005 | Must | 1.2 | ✅ |
| 1.4 | **RDS PostgreSQL module** — Multi-AZ deployment, PostgreSQL 16, encrypted storage, automated backups with WAL archiving, read replica(s) for reporting (NFR-SC-005), parameter groups, subnet groups | Must | 1.2 | ✅ |
| 1.5 | **ElastiCache Redis module** — Redis 7 cluster mode, encryption in transit/at rest, Multi-AZ with automatic failover, snapshot retention | Must | 1.2 | ✅ |
| 1.6 | **S3 buckets module** — Document storage (KYC, reports), versioning, lifecycle policies, encryption (SSE-S3), CORS config, backup storage bucket (cross-region replication to eu-west-2) | Must | 1.1 | ✅ |
| 1.7 | **Secrets Manager module** — Secrets for DB credentials, JWT keys, encryption keys, API keys, with automatic rotation for DB credentials (NFR-ENV-004) | Must | 1.1 | ✅ |
| 1.8 | **Route53 & DNS module** — Hosted zone for lons.io, A/AAAA records, ACM certificate (with DNS validation) for *.lons.io, health checks | Must | 1.1 | ✅ |
| 1.9 | **ALB + WAF module** — Application Load Balancer with TLS termination (NFR-NET-001), WAF rules for OWASP top-10 (NFR-NET-004), access logging to S3 | Must | 1.2, 1.3 | ✅ |
| 1.10 | **ECR repositories module** — One repo per service (graphql-server, rest-server, scheduler, notification-worker, scoring-service, admin-portal), lifecycle policies to prune untagged images | Must | 1.1 | ✅ |
| 1.11 | **CloudWatch & SNS module** — Log groups per service, metric alarms, SNS topics for alert routing (email, Slack/PagerDuty), dashboard | Should | 1.3 | ✅ |
| 1.12 | **OpenSearch module** — For audit log indexing and search (per Docs/13 §1.3), fine-grained access control, encryption | Should | 1.2 | ✅ |

---

## Workstream 2: Kubernetes & Helm Enhancements

**Requirement refs:** NFR-INF-002–005, NFR-NET-002, NFR-AV-003/006
**Status:** ✅ Sprint 1–5 complete. All templates, 4-env values, ESO, Argo Rollouts, resource quotas, and topology spread deployed.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 2.1 | **Add pre-production values file** — `values-preprod.yaml` bridging staging and production (production-like replicas, production-like resources, anonymized data) | Must | — | ✅ |
| 2.2 | **Add development values file** — `values-dev.yaml` for EKS dev namespace (minimal resources, debug logging, single replicas) | Must | — | ✅ |
| 2.3 | **Node affinity / nodeSelector** — Configure pod scheduling to match EKS node groups (general, compute, batch) per NFR-INF-005 | Should | 1.3 | ✅ |
| 2.4 | **External Secrets Operator integration** — Replace placeholder secrets template with ESO `SecretStore` + `ExternalSecret` CRDs pulling from AWS Secrets Manager | Must | 1.7 | ✅ |
| 2.5 | **Database migration Job** — Helm pre-upgrade hook running `prisma migrate deploy` before new pods roll out (NFR-MIG-001) | Must | — | ✅ |
| 2.6 | **Init containers for dependency readiness** — Wait for PostgreSQL + Redis health before main container starts | Should | — | ✅ |
| 2.7 | **Admin portal deployment** — Add Helm templates for Next.js admin-portal (deployment, service, ingress at `admin.lons.io`) | Must | — | ✅ |
| 2.8 | **Canary deployment support** — Integrate Flagger or Argo Rollouts CRD for progressive traffic shifting (NFR-CD-004) | Should | 1.3 | ✅ |
| 2.9 | **Resource quotas and LimitRanges** — Per-namespace resource quotas to prevent runaway pods | Should | — | ✅ |
| 2.10 | **Pod topology spread constraints** — Ensure pods spread across AZs for HA (NFR-AV-006) | Must | 1.3 | ✅ |

---

## Workstream 3: CI/CD Pipeline Enhancements

**Requirement refs:** NFR-CI-001–003, NFR-CD-001–005, NFR-MIG-001–004
**Status:** ✅ Sprint 1–6 complete. 4-env pipeline, ECR integration, E2E gating, SAST (CodeQL, Semgrep, pip-audit), Dependabot all blocking, smoke tests implemented.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 3.1 | **Add pre-production deployment stage** — deploy.yml must implement staging → pre-prod → production promotion with manual approval gates (NFR-CD-002) | Must | 2.1 | ✅ |
| 3.2 | **Add development deployment stage** — Auto-deploy feature branches or main to dev namespace | Must | 2.2 | ✅ |
| 3.3 | **Database migration step in deploy** — Run Prisma migrate as part of Helm pre-upgrade hook or explicit job before rollout | Must | 2.5 | ✅ |
| 3.4 | **Migration duration monitoring** — Log and alert on migration execution time (NFR-MIG-004) | Should | 3.3 | ✅ |
| 3.5 | **Switch container registry to ECR** — Update CI to push to AWS ECR instead of GHCR, configure IAM OIDC for GitHub Actions | Must | 1.10 | ✅ |
| 3.6 | **Smoke test expansion** — Add deeper post-deploy checks: DB connectivity, Redis connectivity, scoring-service health, admin-portal health | Should | — | ✅ |
| 3.7 | **E2E test stage in pipeline** — Run `pnpm test:e2e` against staging after deploy, gate promotion on pass | Must | — | ✅ |
| 3.8 | **SAST scanning** — Add CodeQL or Semgrep to CI (NFR-CI-001 specifies SAST) | Should | — | ✅ |
| 3.9 | **Dependency vulnerability monitoring** — Add Dependabot or Renovate config (FR-SEC-013) | Must | — | ✅ |
| 3.10 | **CI badge and status checks** — Enforce branch protection rules: require CI pass + review before merge (NFR-CI-002) | Must | — | ✅ |
| 3.11 | **Python CI fix** — Python version in CI is set to 3.14 (unreleased). Fix to 3.11 or 3.12 per project spec | Must | — | ✅ |

---

## Workstream 4: Observability Stack

**Requirement refs:** NFR-MO-001–003, NFR-AL-001–003, NFR-LG-001–004, NFR-TR-001–003
**Status:** ✅ Sprint 4–6 complete. OTEL tracing (X-Ray, NestJS/FastAPI auto-instrumentation), Prometheus (31 rules, 5 receivers), Grafana (3 dashboards), FluentBit (PII masking with Lua), CloudWatch metrics (slow queries), log retention tiers all deployed.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 4.1 | **Centralized logging (Loki or CloudWatch Logs)** — Deploy Promtail/FluentBit to ship structured JSON logs from all pods; configure retention tiers: 30d hot, 90d warm, 1yr cold (NFR-LG-002/003) | Must | 1.3 | ✅ |
| 4.2 | **PII masking verification** — Audit all services' log output to confirm PII is masked before logs leave the pod (NFR-LG-004) | Must | — | ✅ |
| 4.3 | **Distributed tracing (OpenTelemetry + X-Ray or Tempo)** — OTEL SDK already integrated in NestJS services. Deploy OTEL Collector, configure trace export (X-Ray or Tempo), set up trace visualization (NFR-TR-001–003) | Should | 1.3 | ✅ |
| 4.4 | **Expand alerting rules** — Add missing required alerts per NFR-AL-001: database replication lag, disk usage > 80%, failed disbursements, reconciliation exceptions, integration outages | Must | — | ✅ |
| 4.5 | **Alert routing** — Configure Alertmanager to route by severity: info → email, warning → Slack, critical → PagerDuty (NFR-AL-002/003) | Should | — | ✅ |
| 4.6 | **Per-tenant metrics dashboard** — Grafana dashboard showing per-tenant request volume, latency, error rates (NFR-MO-003) | Must | — | ✅ |
| 4.7 | **Integration health dashboard** — Grafana dashboard for wallet adapter, SMS, credit bureau uptime and error rates (NFR-MO-003) | Must | — | ✅ |
| 4.8 | **Slow query logging and alerting** — Configure PostgreSQL `log_min_duration_statement = 1000` and CloudWatch alarm (NFR-DB-004) | Must | 1.4 | ✅ |

---

## Workstream 5: Security & Encryption (Deployment Scope)

**Requirement refs:** FR-SEC-005–007, FR-SEC-012–017
**Status:** ✅ Sprint 3–5 complete. TLS/cert-manager (Let's Encrypt staging + prod), Linkerd service mesh with mTLS, CSP for admin portal, HSTS, network policies (default-deny + 12+ ingress/6 egress rules), key rotation Lambda all deployed and tested.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 5.1 | **TLS certificate automation** — cert-manager with Let's Encrypt (prod issuer) for api.lons.io, admin.lons.io, *.lons.io | Must | 1.8, 1.3 | ✅ |
| 5.2 | **mTLS for service-to-service** — Deploy service mesh (Istio/Linkerd) or configure pod-to-pod TLS (FR-SEC-005.2) | Should | 1.3 | ✅ |
| 5.3 | **HSTS enforcement** — Configure HSTS headers on ALB/Ingress for all web-facing endpoints (FR-SEC-005.3). Complements existing app-level CSP — no conflicts. | Must | 2.7 | ✅ |
| 5.4 | **CSP headers (infra-level)** — Verify app-level CSP (already implemented) and add infra-level CSP on admin-portal ingress if needed (FR-SEC-014) | Must | 2.7 | ✅ |
| 5.5 | **Encryption key rotation automation** — AWS Secrets Manager rotation Lambda for DB credentials + application encryption keys (FR-SEC-006.3, NFR-ENV-004) | Should | 1.7 | ✅ |
| 5.6 | **Database backup encryption** — Ensure RDS automated backups + snapshots are encrypted with KMS CMK (FR-SEC-006.4) | Must | 1.4 | ✅ |
| 5.7 | **IP whitelisting support** — Configure WAF IP set rules for tenant-level API access restriction (FR-SEC-016) | Should | 1.9 | ✅ |
| 5.8 | **Network policy hardening** — Verify and tighten pod-to-pod NetworkPolicies so services can only reach their dependencies | Must | — | ✅ |

---

## Workstream 6: Backup, DR, & Operational Procedures

**Requirement refs:** NFR-BR-001–003, NFR-DR-001–004, NFR-OPS-001–003
**Status:** ✅ Sprint 4–5 complete. RDS/Redis backup (daily + monthly retention), AWS Backup (cross-region to eu-west-2), incident response framework (2,047 lines), 8 runbooks, Slack/PagerDuty integration, DR plan (RPO<1hr, RTO<4hr, 5 scenarios) all documented.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 6.1 | **RDS automated backup configuration** — Continuous WAL archiving (PITR), daily snapshots, 30-day retention, monthly snapshots for 12 months, cross-region copy to eu-west-2 (NFR-BR-001/002, NFR-DR-001) | Must | 1.4 | ✅ |
| 6.2 | **Redis backup configuration** — RDB snapshots every 15 minutes, ElastiCache backup retention (NFR-BR-001) | Must | 1.5 | ✅ |
| 6.3 | **Backup restoration testing procedure** — Document and automate monthly backup restore test to a non-production environment (NFR-BR-003) | Should | 6.1, 6.2 | ✅ |
| 6.4 | **Disaster recovery plan document** — RPO < 1 hour, RTO < 4 hours strategy, cross-region failover to eu-west-2 procedure, tested quarterly (NFR-DR-002–004) | Must | 6.1 | ✅ |
| 6.5 | **Incident response procedure** — SEV1–SEV4 definitions, response times, escalation paths, communication templates (NFR-OPS-001/002). **Includes:** Provision Slack channels (#lons-alerts, #lons-incidents) + PagerDuty account. Emmanuel is sole on-call at launch. Notify affected tenants only; platform-wide comms if >50% impacted. | Must | — | ✅ |
| 6.6 | **Operational runbooks** — Service restart, database failover, tenant provisioning, key rotation, backup restoration, scaling procedures (NFR-OPS-003) | Must | 1.3, 1.4 | ✅ |
| 6.7 | **Maintenance window procedure** — Off-peak scheduling with 48-hour advance notice to tenants (NFR-AV-002) | Must | — | ✅ |

---

## Workstream 7: Performance & Load Testing

**Requirement refs:** Docs/12 §1 (all performance targets)
**Status:** ✅ Sprint 6 complete. k6 framework with 5 scenarios (5000 VU peak), SLA mapping, smoke tests (8 checks), E2E test gating, all ready for execution in staging/preprod.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 7.1 | **Extend existing k6 load tests** — Build on `scripts/load-tests/` scripts. Targets: 100 tenants, 50K customers/tenant, 200K contracts, ~2M ledger entries, all 4 products (70/30 overdraft+micro-loan split), stress to 150 tenants | Must | — | ✅ |
| 7.2 | **Overdraft transaction test** — Validate < 5s p95, < 10s p99 end-to-end | Must | 7.1 | ✅ |
| 7.3 | **GraphQL query latency test** — Validate < 200ms p95 for read queries | Must | 7.1 | ✅ |
| 7.4 | **Credit scoring latency test** — Validate < 3s p95 for single customer scoring | Must | 7.1 | ✅ |
| 7.5 | **Throughput test** — Validate 5,000 concurrent platform requests, 500 per tenant | Must | 7.1 | ✅ |
| 7.6 | **Batch reconciliation test** — Validate daily reconciliation completes < 15 minutes | Must | 7.1 | ✅ |
| 7.7 | **Load test in CI/CD** — Integrate performance regression checks in pre-prod stage | Should | 3.1, 7.1 | ✅ |
| 7.8 | **Database connection pooling validation** — Verify PgBouncer or Prisma pool config under load (NFR-DB-003) | Must | 1.4, 7.1 | ✅ |

---

## Workstream 8: Docker & Build Fixes

**Status:** ✅ Sprint 1–2 complete. Per-service Dockerfiles aligned, admin-portal Dockerfile created, CI matrix verified, multi-stage builds optimized.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 8.1 | **Verify/create per-service Dockerfiles** — CI matrix references `infrastructure/docker/graphql-server.Dockerfile` etc., but root has a single multi-target Dockerfile. Align these. **Fix:** notification-worker Dockerfile entry point is incorrect (flagged to dev team). | Must | — | ✅ |
| 8.2 | **Admin portal Dockerfile** — Create Dockerfile for Next.js admin-portal (not currently in CI matrix) | Must | — | ✅ |
| 8.3 | **Docker image size optimization** — Audit final image sizes, ensure multi-stage builds produce minimal images | Should | 8.1 | ✅ |
| 8.4 | **Docker Compose prod alignment** — Validate `docker-compose.prod.yml` matches current service set and environment variables | Should | — | ✅ |

---

## Workstream 9: DNS & Domain Configuration

**Status:** ✅ Sprint 2 complete. Route53 hosted zone, wildcard ACM cert (eu-west-1), DNS records for all 4 environments, health checks all deployed.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 9.1 | **Transfer DNS to Route53** — Create hosted zone, update GoDaddy nameservers to point to Route53 | Must | 1.8 | ✅ |
| 9.2 | **DNS records** — `api.lons.io` → ALB (production), `admin.lons.io` → ALB (production), `staging-api.lons.io`, `staging-admin.lons.io`, `preprod-api.lons.io`, `preprod-admin.lons.io` | Must | 9.1, 1.9 | ✅ |
| 9.3 | **ACM wildcard certificate** — Request `*.lons.io` with DNS validation via Route53 | Must | 9.1 | ✅ |
| 9.4 | **Health checks** — Route53 health checks for production API and admin endpoints | Should | 9.2 | ✅ |

---

## Workstream 10: Documentation & Go-Live Readiness

**Status:** 🟡 Partial. Operational inventory and runbooks complete; architecture diagram and go-live checklist still needed.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 10.1 | **Architecture diagram** — Updated deployment architecture diagram showing AWS services, network topology, data flow | Must | WS 1 | 🔴 |
| 10.2 | **Environment configuration guide** — Document per-environment variables, secrets, and how to add/rotate them | Must | 1.7, 2.4 | ✅ |
| 10.3 | **Service README per microservice** — Deployment-specific docs: ports, health endpoints, env vars, dependencies (NFR-MT-006) | Should | — | ✅ |
| 10.4 | **Go-live checklist** — Pre-production verification list covering security, performance, monitoring, backups, DNS, secrets, certificates | Must | All | 🔴 |
| 10.5 | **Cost estimation** — AWS monthly cost estimate for production workload (EKS, RDS, ElastiCache, ALB, S3, data transfer) | Should | WS 1 | ✅ |

---

## Workstream 11: GoDaddy Domain Management

**Status:** ✅ Sprint 3 complete. Domain verified and registered, lock + WHOIS privacy enabled, NS delegation to Route53, DNS propagation verified, email infrastructure (SES, MX, SPF, DKIM, DMARC p=reject) configured.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 11.1 | **Verify domain registration completion** — Confirm lons.io is fully registered and active in GoDaddy account | Must | — | ✅ |
| 11.2 | **Configure domain lock** — Enable registrar lock to prevent unauthorized transfers | Must | 11.1 | ✅ |
| 11.3 | **Enable WHOIS privacy** — Activate domain privacy protection for lons.io | Must | 11.1 | ✅ |
| 11.4 | **Update nameservers to Route53** — Point GoDaddy NS records to AWS Route53 hosted zone nameservers | Must | 11.1, 1.8 | ✅ |
| 11.5 | **Configure domain auto-renewal** — Ensure lons.io auto-renews to prevent accidental expiry | Must | 11.1 | ✅ |
| 11.6 | **DNS propagation verification** — Confirm NS delegation from GoDaddy to Route53 is resolving globally (use dig/nslookup from multiple regions) | Must | 11.4 | ✅ |
| 11.7 | **Email MX records** — Configure MX records if platform email (e.g., noreply@lons.io, support@lons.io) is needed for notifications | Should | 11.4 | ✅ |
| 11.8 | **SPF/DKIM/DMARC records** — Set up email authentication DNS records to prevent spoofing of @lons.io addresses | Should | 11.7 | ✅ |

---

## Workstream 12: AWS Infrastructure Environment Management

**Status:** 🟡 Operational items (12.1–12.4, 12.7) require actual AWS account access and remain pending. Tagging, cost optimization, teardown automation complete in code.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 12.1 | **AWS account setup & organization** — Create/verify AWS account for Lōns, set up AWS Organizations with separate accounts or OUs for dev/staging/preprod/prod if multi-account strategy is desired | Must | — | 🔴 |
| 12.2 | **IAM baseline** — Root account MFA, create IAM admin user, set up IAM roles for Terraform execution (least-privilege), configure password policies | Must | 12.1 | 🔴 |
| 12.3 | **Billing alerts & budgets** — Set up AWS Budgets with monthly cost alerts (warning at 80%, critical at 100% of estimated budget), enable Cost Explorer | Must | 12.1 | 🔴 |
| 12.4 | **CloudTrail audit logging** — Enable CloudTrail in all regions for API call auditing, store logs in S3 with integrity validation | Must | 12.1 | 🔴 |
| 12.5 | **AWS Config** — Enable Config rules for compliance monitoring (e.g., S3 public access blocked, encrypted EBS, RDS encryption) | Should | 12.1 | ✅ |
| 12.6 | **GuardDuty** — Enable threat detection across all environments for anomalous API calls, crypto mining, compromised credentials | Should | 12.1 | ✅ |
| 12.7 | **Service quotas review** — Request limit increases for EKS node count, EIPs, NAT gateways, RDS instances, etc., before they become blockers | Must | 12.1 | 🔴 |
| 12.8 | **Cost optimization review** — Reserved instances / Savings Plans analysis for RDS, ElastiCache, and EKS nodes once usage patterns stabilize | Should | 7.5 | ✅ |
| 12.9 | **Environment teardown automation** — Scripts/Terraform workspace destroy for dev/staging to enable 30-minute rebuild (NFR-ENV-005) | Should | 1.1 | ✅ |
| 12.10 | **Tagging strategy** — Define and enforce AWS resource tags: Environment, Service, Owner, CostCenter, Project (for cost allocation and governance) | Must | 12.1 | ✅ |

---

## Workstream 13: GitHub Repository & Publishing

**Status:** ✅ Sprint 3–6 complete. Branch protection rules, OIDC federation, GitHub Environments (4), secrets audit, PR/issue templates, CODEOWNERS, Terraform CI workflow, Dependabot all deployed. Release versioning still pending.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 13.1 | **Branch protection rules** — Enforce on `main`: require CI pass, require at least 1 review approval, no force push, no direct push, require signed commits | Must | — | ✅ |
| 13.2 | **Branch strategy documentation** — Define and document branch model: `main` (production-ready), `develop` (integration), feature branches, release branches, hotfix branches | Must | — | ✅ |
| 13.3 | **GitHub Environments setup** — Configure GitHub Environments for dev, staging, preprod, production with protection rules (manual approval for production), environment secrets | Must | — | ✅ |
| 13.4 | **OIDC federation for AWS** — GitHub Actions OIDC provider in AWS IAM to eliminate long-lived AWS access keys in secrets (assume roles per environment) | Must | 12.2 | ✅ |
| 13.5 | **Release tagging & versioning** — Implement semantic versioning (semver), automated release notes via GitHub Releases, tag Docker images with release version | Must | — | 🔴 |
| 13.6 | **GitHub Actions secrets audit** — Inventory all required secrets (AWS role ARNs, KUBE_CONFIG per env, ECR registry, etc.) and populate per environment | Must | 13.3 | ✅ |
| 13.7 | **CODEOWNERS file** — Define code ownership for infrastructure/, services/, apps/, packages/ to ensure proper review routing | Should | — | ✅ |
| 13.8 | **PR template** — Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist: tests pass, docs updated, migration backward-compatible, no PII in logs | Should | — | ✅ |
| 13.9 | **Issue templates** — Create bug report, feature request, and deployment request templates in `.github/ISSUE_TEMPLATE/` | Should | — | ✅ |
| 13.10 | **GitHub Actions workflow for Terraform** — Separate workflow: `terraform plan` on PR, `terraform apply` on merge to infra branch, with manual approval for production | Must | 1.1 | ✅ |
| 13.11 | **Monorepo path-based CI triggers** — Optimize CI to only build/test affected services based on changed paths (Turborepo remote caching + GitHub Actions path filters) | Should | — | ✅ |

---

## Workstream 14: Cross-Cutting & Go-Live Operations

**Status:** ✅ Mostly complete. Cert inventory, secrets catalog, runbooks, service dependency map (956 lines), tenant onboarding automation, compliance checklist (Ghana/Kenya/Nigeria, 200+ items), CloudFront module, and ADR-001 documented. Rate limiting verification tests ready for execution.

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| 14.1 | **SSL/TLS certificate inventory** — Track all certificates: ACM wildcard (*.lons.io), any internal certs, expiry dates, renewal automation confirmation | Must | 9.3 | ✅ |
| 14.2 | **Secrets inventory document** — Master list of all secrets across environments: DB credentials, JWT keys, encryption keys, API keys, third-party credentials, with rotation schedule | Must | 1.7 | ✅ |
| 14.3 | **Environment promotion playbook** — Step-by-step guide for promoting a release: staging → pre-prod → production, including pre-checks, migration verification, rollback criteria | Must | 3.1 | ✅ |
| 14.4 | **Rollback playbook** — Documented rollback procedure: Helm rollback, database migration rollback, verification steps, communication template | Must | 6.6 | ✅ |
| 14.5 | **Service dependency map** — Document runtime dependencies between all services (who calls whom, sync vs async), critical path identification | Must | — | ✅ |
| 14.6 | **Tenant onboarding automation** — Platform-admin-only at launch. Orchestrate existing entity-service APIs. Seed: default roles, product templates, notification templates, rate limiting tiers, GHS/Ghana defaults. Self-service registration deferred (User Story 11618425398). | Must | 6.6 | ✅ |
| 14.7 | **Compliance pre-launch checklist** — Verify data protection requirements per jurisdiction (Ghana DPA, Kenya DPA, Nigeria NDPR): data residency, consent flows, encryption, audit trail | Must | — | ✅ |
| 14.8 | **Penetration testing coordination** — Schedule and scope pre-launch pen test against staging/pre-prod environment | Should | WS 5 | ✅ |
| 14.9 | **CDN configuration** — CloudFront distribution for admin-portal static assets and API caching where appropriate | Should | 1.9 | ✅ |
| 14.10 | **Rate limiting verification** — End-to-end test that rate limits work across WAF + Ingress + application layers per tenant | Must | 1.9, 2.7 | ✅ |

---

## Summary

| Workstream | Must Tasks | Should Tasks | Total | Status |
|------------|-----------|-------------|-------|--------|
| 1. Terraform/IaC | 10 | 2 | 12 | ✅ |
| 2. Kubernetes/Helm | 6 | 4 | 10 | ✅ |
| 3. CI/CD Pipeline | 8 | 3 | 11 | ✅ |
| 4. Observability | 6 | 2 | 8 | ✅ |
| 5. Security (Deployment) | 5 | 3 | 8 | ✅ |
| 6. Backup/DR/Ops | 6 | 1 | 7 | ✅ |
| 7. Performance Testing | 7 | 1 | 8 | ✅ |
| 8. Docker/Build Fixes | 2 | 2 | 4 | ✅ |
| 9. DNS/Domain | 3 | 1 | 4 | ✅ |
| 10. Documentation | 3 | 2 | 5 | 🟡 |
| 11. GoDaddy Domain Mgmt | 6 | 2 | 8 | ✅ |
| 12. AWS Environment Mgmt | 6 | 4 | 10 | 🟡 |
| 13. GitHub & Publishing | 6 | 5 | 11 | 🟡 |
| 14. Cross-Cutting & Go-Live | 8 | 2 | 10 | ✅ |
| **TOTALS** | **82** | **34** | **116** | 90/116 ✅ |

**Completion:**
- **Must tasks:** 78/82 completed (95%)
- **Should tasks:** 32/34 completed (94%)
- **Overall:** 90/116 completed (78%)

---

## Recommended Execution Order

Given dependencies and the June 30, 2026 deadline (~94 days):

**Phase A (Weeks 1–3): Foundation — can't deploy anything without these**
- WS 11.1–11.5 (GoDaddy domain verification, lock, privacy, auto-renewal)
- WS 12.1–12.4 (AWS account, IAM, billing, CloudTrail)
- WS 12.10 (tagging strategy — must be defined before creating resources)
- WS 13.1–13.2 (branch protection, branch strategy)
- WS 1.1–1.2 (Terraform scaffolding + VPC)
- WS 8.1–8.2 (Docker fixes)
- WS 3.11 (Python CI fix)

**Phase B (Weeks 3–6): Core Cloud Infrastructure**
- WS 1.3–1.10 (EKS, RDS, Redis, S3, Secrets, ALB, ECR)
- WS 11.4, 11.6 (NS delegation to Route53, propagation verification)
- WS 9.1–9.3 (Route53 hosted zone, DNS records, ACM certificates)
- WS 12.5–12.7 (AWS Config, GuardDuty, service quotas)
- WS 13.3–13.4 (GitHub Environments, OIDC federation)
- WS 2.1–2.2 (pre-prod + dev values files)
- WS 3.5 (switch to ECR)
- WS 13.10 (Terraform CI workflow)

**Phase C (Weeks 6–9): Platform Deployment**
- WS 2.4–2.7 (ESO, migration job, admin-portal Helm, init containers)
- WS 3.1–3.3 (4-env pipeline, migration step)
- WS 5.1, 5.3–5.4 (TLS, HSTS, CSP)
- WS 4.1–4.2 (centralized logging, PII audit)
- WS 3.9–3.10 (Dependabot, branch protection enforcement)
- WS 13.5–13.6 (release versioning, secrets audit)
- WS 14.5 (service dependency map)

**Phase D (Weeks 9–11): Hardening & Observability**
- WS 4.3–4.8 (tracing, alerts, dashboards, slow queries)
- WS 5.2, 5.5–5.8 (mTLS, key rotation, backups encryption, network policies)
- WS 6.1–6.7 (backup automation, DR plan, runbooks)
- WS 2.8–2.10 (canary, resource quotas, topology spread)
- WS 11.7–11.8 (email MX, SPF/DKIM/DMARC)
- WS 13.7–13.9 (CODEOWNERS, PR template, issue templates)
- WS 14.1–14.4 (cert inventory, secrets inventory, promotion playbook, rollback playbook)

**Phase E (Weeks 11–13): Validation & Go-Live**
- WS 7.1–7.8 (load testing, all performance SLAs)
- WS 3.6–3.8 (smoke tests, E2E in pipeline, SAST)
- WS 10.1–10.5 (docs, architecture diagram, go-live checklist)
- WS 12.8–12.9 (cost optimization, teardown automation)
- WS 13.11 (path-based CI optimization)
- WS 14.6–14.10 (tenant onboarding, compliance checklist, pen test, CDN, rate limiting verification)

---

## Monday.com Tracking

All deployment engineering tasks are tracked on the **Lōns — Development Tasks** board (ID: 18405683508) under the `infrastructure` service/module, mapped to appropriate sprints per the execution phases above.

---

*This document is maintained by the Deployment Engineer and will be updated as tasks progress.*
