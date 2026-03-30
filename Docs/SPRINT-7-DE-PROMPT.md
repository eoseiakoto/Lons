# Sprint 7 — Deployment Engineer Implementation Prompt

**Sprint:** 7 (Jun 19 – Jun 30, 2026)
**Objective:** Stand up a fully operational staging environment for real SP prospect testing and feedback collection.
**Scope:** Infrastructure tasks only (DE-01 through DE-08). Application code (DEV-01 through DEV-13) is already complete.
**Environment:** AWS, eu-west-1 (Ireland). Secrets via AWS Secrets Manager + External Secrets Operator.

**Read `CLAUDE.md` at the repo root before starting work.** Then read `Docs/13-deployment.md` for the full infrastructure requirements spec.

---

## Prerequisites — What Exists

The following infrastructure and application artifacts are **already built** and should NOT be recreated. Understand them before starting.

### Terraform (fully implemented)

- `infrastructure/terraform/main.tf` — Orchestrates all modules (VPC, EKS, RDS, ElastiCache, S3, ALB, DNS, Backup, CDN)
- `infrastructure/terraform/environments/staging.tfvars` — Staging-specific values: `eu-west-1`, EKS 1.28, 3 nodes (2–5), RDS `db.t4g.small` multi-AZ, Redis `cache.t4g.small` x2, WAF enabled
- `infrastructure/terraform/modules/` — VPC, EKS, RDS, ElastiCache, S3, ALB, DNS, Backup, CDN, Secrets-Rotation modules
- Remote state: S3 backend with DynamoDB locking (defined in `backend.tf`)

### Helm Chart (`infrastructure/helm/lons/`)

- `values.yaml` — Base values (ghcr.io registry, 6 service definitions, health checks, autoscaling)
- `values-staging.yaml` — Staging overrides (1 replica each, reduced resources, `api.staging.lons.io` ingress, Let's Encrypt staging issuer, service mesh, network policies, resource quotas, logging, tracing)
- `values-dev.yaml`, `values-preprod.yaml`, `values-production.yaml` — Other environment overrides
- Templates exist for: all 6 services (graphql-server, rest-server, scheduler, notification-worker, admin-portal, scoring-service), ingress with HSTS/security headers, cert-manager issuers, external-secrets, migration job, monitoring (Prometheus rules, Grafana dashboards, AlertManager), network policies, resource quotas, canary/rollout, logging (Fluent Bit), OTel collector, service mesh

### CI/CD (`.github/workflows/`)

- `ci.yml` — Lint, test, build, security scan on push
- `deploy.yml` — 4-environment deploy pipeline (dev/staging/preprod/production) with OIDC auth, ECR retag, Helm upgrade, smoke tests, rollback
- `terraform.yml` — Terraform plan/apply pipeline
- `load-test.yml`, `sast.yml` — Load testing and SAST scanning

### Docker (`infrastructure/docker/`)

- Dockerfiles: `graphql-server.Dockerfile`, `rest-server.Dockerfile`, `scheduler.Dockerfile`, `notification-worker.Dockerfile`, `admin-portal.Dockerfile`
- `docker-compose.yml` — Local dev (PostgreSQL 16, Redis 7)
- `otel-collector-config.yaml`

### Application Code (Sprint 7 DEV complete)

- Prisma schema has all models including new Sprint 7 additions (WalletProviderConfig, NotificationProviderConfig, NotificationMockLog, Feedback, SurveyResponse) with RLS policies
- Staging seed script at `packages/database/prisma/seed-staging.ts` — 3 SPs (Ghana/Kenya/Nigeria), 16 customers per SP, all contract states, financial records
- Mock adapters (WalletAdapterResolver, MockWalletAdapter, NotificationAdapterResolver, RecordingNotificationAdapter) all wired and tested
- REST API with 14+ endpoints, Swagger/OpenAPI
- Admin portal with debug panel, feedback system, NPS widget

---

## Task Execution Order

Execute in this order. Tasks within the same group can run in parallel.

```
Group 1 (parallel):  DE-01, DE-02, DE-03
Group 2 (sequential): DE-04 (depends on DE-01 + DE-02)
Group 3 (parallel):  DE-05, DE-06
Group 4 (parallel):  DE-07, DE-08
```

---

## DE-01: Deploy Staging EKS Namespace

**Monday.com ID:** 11621695509
**Priority:** Must — Critical
**Dependencies:** Terraform EKS module must be applied first

### What to Do

1. **Apply Terraform for staging** — Run `terraform apply` with `staging.tfvars` to provision the full staging infrastructure stack:

```bash
cd infrastructure/terraform
terraform workspace select staging || terraform workspace new staging
terraform plan -var-file=environments/staging.tfvars -out=staging.plan
terraform apply staging.plan
```

This creates: VPC, EKS cluster (`lons-staging-cluster`), RDS (`db.t4g.small`, multi-AZ), ElastiCache Redis (2 nodes), S3 buckets, ALB with WAF, Route53 DNS records, Backup vault.

2. **Configure kubectl** to point at the staging cluster:

```bash
aws eks update-kubeconfig --name lons-staging-cluster --region eu-west-1
```

3. **Create the staging namespace** with appropriate labels:

```bash
kubectl create namespace lons-staging
kubectl label namespace lons-staging \
  environment=staging \
  team=engineering \
  app.kubernetes.io/part-of=lons
```

4. **Install prerequisite operators** (if not already on the cluster):
   - **External Secrets Operator** — For syncing AWS Secrets Manager → K8s secrets
   - **cert-manager** — For TLS certificate automation
   - **NGINX Ingress Controller** (or ALB Ingress Controller) — For routing
   - **Prometheus Operator** (kube-prometheus-stack) — For monitoring

```bash
# External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace

# cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --set installCRDs=true

# NGINX Ingress Controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

# kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace
```

5. **Verify** the namespace is ready and operators are running:

```bash
kubectl get ns lons-staging
kubectl get pods -n external-secrets
kubectl get pods -n cert-manager
kubectl get pods -n ingress-nginx
kubectl get pods -n monitoring
```

### Acceptance Criteria
- [ ] `lons-staging` namespace exists with correct labels
- [ ] EKS cluster is accessible via `kubectl`
- [ ] All 4 operators are running (External Secrets, cert-manager, NGINX Ingress, Prometheus)
- [ ] Terraform outputs show VPC, EKS, RDS, Redis, ALB endpoints

---

## DE-02: Staging Helm Values & Environment Variables

**Monday.com ID:** 11621695485
**Priority:** Must — Critical
**Dependencies:** None (values file already exists, needs review and secret seeding)

### What to Do

1. **Review `values-staging.yaml`** — The file already exists at `infrastructure/helm/lons/values-staging.yaml`. Verify it is complete and correct. The current file defines:
   - 1 replica per service, autoscaling disabled
   - Ingress: `api.staging.lons.io` with Let's Encrypt staging issuer
   - Admin portal: `admin.staging.lons.io`
   - Logging, tracing, monitoring enabled
   - Service mesh enabled (mTLS proxy)
   - Network policies and resource quotas enabled
   - External secrets enabled

2. **Add any missing staging-specific values.** Verify that the following are set or add them:

```yaml
# Confirm these exist in values-staging.yaml or add if missing:
config:
  nodeEnv: staging
  logLevel: debug
  enableTracing: "true"
  allowMockAdapters: "true"         # <-- CRITICAL for staging mock adapter testing
  scoringServiceUrl: "http://lons-scoring-service:8000"
  notificationServiceUrl: "http://lons-notification-worker:3003"
  integrationServiceUrl: "http://lons-rest-server:3001"

postgresql:
  host: <RDS_ENDPOINT_FROM_TERRAFORM_OUTPUT>
  port: 5432
  database: lons

redis:
  host: <ELASTICACHE_ENDPOINT_FROM_TERRAFORM_OUTPUT>
  port: 6379
```

3. **Seed AWS Secrets Manager** with staging secrets. Create these secret paths:

| Secret Path | Keys |
|---|---|
| `lons/staging/database` | `url` = `postgresql://lons_staging:<password>@<rds-endpoint>:5432/lons` |
| `lons/staging/redis` | `url` = `redis://<elasticache-endpoint>:6379` |
| `lons/staging/jwt` | `private_key` = RS256 private key (PEM), `public_key` = RS256 public key (PEM) |
| `lons/staging/encryption` | `key` = 32-byte base64-encoded AES-256 key |
| `lons/staging/integrations` | `mtn_momo_api_key`, `mtn_momo_api_secret`, `africas_talking_api_key`, `africas_talking_username` — use sandbox/test values |

```bash
# Generate JWT RS256 keypair
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem

# Generate AES-256 encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Create secrets in AWS Secrets Manager
aws secretsmanager create-secret --name lons/staging/database \
  --secret-string '{"url":"postgresql://lons_staging:<password>@<rds-endpoint>:5432/lons"}'

aws secretsmanager create-secret --name lons/staging/redis \
  --secret-string '{"url":"redis://<elasticache-endpoint>:6379"}'

aws secretsmanager create-secret --name lons/staging/jwt \
  --secret-string "{\"private_key\":\"$(cat jwt-private.pem | base64 -w0)\",\"public_key\":\"$(cat jwt-public.pem | base64 -w0)\"}"

aws secretsmanager create-secret --name lons/staging/encryption \
  --secret-string "{\"key\":\"$ENCRYPTION_KEY\"}"

aws secretsmanager create-secret --name lons/staging/integrations \
  --secret-string '{"mtn_momo_api_key":"sandbox-key","mtn_momo_api_secret":"sandbox-secret","africas_talking_api_key":"sandbox-key","africas_talking_username":"sandbox"}'
```

4. **Verify** External Secrets Operator can sync:

```bash
kubectl get externalsecrets -n lons-staging
kubectl get secrets -n lons-staging
```

### Acceptance Criteria
- [ ] `values-staging.yaml` has `allowMockAdapters: "true"` and correct service URLs
- [ ] PostgreSQL and Redis connection parameters reference Terraform outputs
- [ ] All 5 AWS Secrets Manager secrets created (`lons/staging/database`, `redis`, `jwt`, `encryption`, `integrations`)
- [ ] ExternalSecret CRDs sync successfully — K8s secrets populated in `lons-staging` namespace

---

## DE-03: DNS & TLS for staging.lons.io

**Monday.com ID:** 11621695418
**Priority:** Must — Critical
**Dependencies:** DE-01 (ALB endpoint needed)

### What to Do

1. **Verify Route53 hosted zone** exists for `lons.io` (created by Terraform DNS module). Confirm NS delegation from GoDaddy → Route53 is active.

2. **Create/verify DNS records** for staging subdomains. Terraform DNS module should have created these, but verify:

| Record | Type | Target |
|---|---|---|
| `api.staging.lons.io` | CNAME / A (alias) | ALB DNS name |
| `admin.staging.lons.io` | CNAME / A (alias) | ALB DNS name |

```bash
# Verify DNS resolution
dig api.staging.lons.io
dig admin.staging.lons.io
```

If missing, add via Terraform or manually:

```bash
# Get ALB DNS from Terraform output
terraform output alb_dns_name
```

3. **Verify TLS certificates** — The Helm chart includes cert-manager ClusterIssuer templates. After Helm install, cert-manager should automatically provision Let's Encrypt certificates.

The staging values use `letsencrypt-staging` issuer (test certificates). Confirm the ClusterIssuer and Certificate resources:

```bash
kubectl get clusterissuers -n lons-staging
kubectl get certificates -n lons-staging
kubectl describe certificate lons-staging-tls -n lons-staging
```

4. **Test HTTPS** once the deployment is live:

```bash
curl -v https://api.staging.lons.io/v1/health
curl -v https://admin.staging.lons.io
```

### Acceptance Criteria
- [ ] `api.staging.lons.io` resolves to the ALB
- [ ] `admin.staging.lons.io` resolves to the ALB
- [ ] TLS certificates issued (Let's Encrypt staging initially)
- [ ] HTTPS works end-to-end with proper HSTS headers

---

## DE-04: Run Migration & Seed Staging DB

**Monday.com ID:** 11621687243
**Priority:** Must — Critical
**Dependencies:** DE-01 (EKS namespace), DE-02 (secrets), DEV-01 (Prisma schema), DEV-07 (seed script)

### What to Do

1. **Deploy the Helm chart to staging** (this triggers the migration Job automatically via Helm pre-upgrade hook):

```bash
cd infrastructure/helm
helm upgrade --install lons ./lons \
  -f ./lons/values-staging.yaml \
  --namespace lons-staging \
  --create-namespace \
  --wait \
  --timeout 15m
```

The migration job (`migration-job.yaml`) runs `npx prisma migrate deploy` as a Helm pre-install/pre-upgrade hook. It waits for PostgreSQL connectivity before executing.

2. **Verify migration succeeded:**

```bash
# Check the migration job
kubectl get jobs -n lons-staging | grep migrate
kubectl logs job/lons-db-migrate-1 -n lons-staging

# Connect to the database and verify tables
kubectl run psql-client --rm -it --image=postgres:16 -n lons-staging -- \
  psql "$DATABASE_URL" -c "\dt"
```

3. **Run the staging seed script.** The seed script is at `packages/database/prisma/seed-staging.ts`. Run it via a one-off Kubernetes Job:

Create a temporary seed job manifest (`infrastructure/helm/lons/templates/seed-job.yaml`):

```yaml
# This is a manual/one-time job, not a Helm hook
apiVersion: batch/v1
kind: Job
metadata:
  name: lons-staging-seed
  namespace: lons-staging
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: seed
          image: <ECR_REGISTRY>/lons-graphql-server:<CURRENT_TAG>
          command: ["npx", "ts-node", "packages/database/prisma/seed-staging.ts"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: lons-secrets
                  key: DATABASE_URL
            - name: NODE_ENV
              value: "staging"
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
```

```bash
kubectl apply -f seed-job.yaml
kubectl wait --for=condition=complete job/lons-staging-seed -n lons-staging --timeout=600s
kubectl logs job/lons-staging-seed -n lons-staging
```

4. **Verify seed data:**

```bash
# Check seeded SPs
kubectl run psql-client --rm -it --image=postgres:16 -n lons-staging -- \
  psql "$DATABASE_URL" -c "SELECT id, name, country FROM tenants LIMIT 10;"

# Check customer count per SP
kubectl run psql-client --rm -it --image=postgres:16 -n lons-staging -- \
  psql "$DATABASE_URL" -c "SELECT tenant_id, COUNT(*) FROM customers GROUP BY tenant_id;"
```

### Acceptance Criteria
- [ ] Helm deployment completes without errors
- [ ] Migration job succeeds — all tables created including Sprint 7 additions (wallet_provider_configs, notification_provider_configs, notification_mock_logs, feedbacks, survey_responses)
- [ ] Seed data loaded: 3 tenants, ~48 customers, contracts in all lifecycle states
- [ ] All pods running: `kubectl get pods -n lons-staging` shows all services healthy

---

## DE-05: Staging Access Control

**Monday.com ID:** 11621695505
**Priority:** Must — High
**Dependencies:** DE-01 (EKS cluster)

### What to Do

1. **Configure RBAC for staging namespace.** Create Kubernetes Role and RoleBinding to restrict who can access staging:

Create `infrastructure/helm/lons/templates/staging-rbac.yaml`:

```yaml
{{- if eq .Values.global.environment "staging" }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: staging-developer
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "lons.labels" . | nindent 4 }}
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "services", "configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/exec", "pods/portforward"]
    verbs: ["create"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "watch", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: staging-admin
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "lons.labels" . | nindent 4 }}
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: staging-admin-binding
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "lons.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: staging-admin
subjects:
  - kind: User
    name: emmanuel
    apiGroup: rbac.authorization.k8s.io
{{- end }}
```

2. **Configure Network Policies** — The Helm chart already has `networkpolicy.yaml` enabled for staging (`networkPolicy.enabled: true`). Verify the policy restricts:
   - Ingress: only from NGINX Ingress Controller namespace and within `lons-staging`
   - Egress: allow DNS, PostgreSQL, Redis, external HTTPS (for webhook delivery)

3. **Restrict public access** — Staging should NOT be open to the internet. Configure the ALB or Ingress to restrict access via IP allowlist or basic auth:

Option A — IP allowlist via NGINX Ingress annotation:
```yaml
# Add to values-staging.yaml under ingress.annotations:
ingress:
  annotations:
    nginx.ingress.kubernetes.io/whitelist-source-range: "<Emmanuel-IP>/32,<office-CIDR>"
```

Option B — Basic auth for staging:
```bash
# Create htpasswd secret
htpasswd -c auth staging-user
kubectl create secret generic staging-basic-auth --from-file=auth -n lons-staging
```
```yaml
# Add to ingress annotations:
nginx.ingress.kubernetes.io/auth-type: basic
nginx.ingress.kubernetes.io/auth-secret: staging-basic-auth
nginx.ingress.kubernetes.io/auth-realm: "Lons Staging - Authentication Required"
```

4. **Application-level access** — The admin portal already has JWT authentication. Platform admin credentials are created by the seed script. Verify the seed creates a platform_admin user for Emmanuel.

### Acceptance Criteria
- [ ] RBAC roles created (staging-developer, staging-admin)
- [ ] Emmanuel has staging-admin access
- [ ] Staging is NOT publicly accessible without authentication (IP allowlist or basic auth)
- [ ] Network policies restrict inter-namespace traffic

---

## DE-06: Staging Observability Stack

**Monday.com ID:** 11621687102
**Priority:** Must — High
**Dependencies:** DE-01 (EKS + Prometheus Operator)

### What to Do

1. **Verify Prometheus is scraping Lōns services.** The Helm chart includes:
   - `servicemonitor.yaml` — ServiceMonitor CRD (enabled in staging: `interval: 60s`)
   - `prometheus-rules.yaml` — PrometheusRule with 4 alert groups: infrastructure, database, redis, application, security (already comprehensive — 20+ rules)

```bash
# Check ServiceMonitor is discovered
kubectl get servicemonitors -n lons-staging
# Port-forward Prometheus UI
kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring
# Visit http://localhost:9090/targets and confirm lons services are listed
```

2. **Deploy Grafana dashboards.** The Helm chart includes `grafana-dashboards.yaml`. Verify they're loaded:

```bash
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
# Visit http://localhost:3000, default creds: admin/prom-operator
# Verify Lōns dashboards appear
```

If dashboards aren't auto-loading, create a ConfigMap with the dashboard JSON from `infrastructure/monitoring/grafana/`:

```bash
ls infrastructure/monitoring/grafana/
# Apply any dashboard ConfigMaps
```

3. **Configure AlertManager routing** for staging. The Helm chart includes `alertmanager-config.yaml`. For staging, alerts should go to:
   - Slack: `#lons-alerts` channel (requires webhook URL)
   - Email: Emmanuel (`eoseiakoto@gmail.com`) for critical alerts

Update `values-staging.yaml` if AlertManager routing needs Slack webhook:

```yaml
monitoring:
  alerts:
    enabled: true
    slackWebhookUrl: "<SLACK_WEBHOOK_URL>"  # Get from Emmanuel
    slackChannel: "#lons-alerts"
```

4. **Verify logging** — Fluent Bit is configured in `templates/logging/fluent-bit-config.yaml`. In staging, logs go to CloudWatch (per `logging.aws.region: eu-west-1`). Verify:

```bash
# Check Fluent Bit is running
kubectl get pods -n lons-staging -l app.kubernetes.io/component=logging

# Check CloudWatch log groups
aws logs describe-log-groups --log-group-name-prefix /lons/staging
```

5. **Verify tracing** — OpenTelemetry Collector is deployed (templates exist). Staging has `tracing.enabled: true` and `config.enableTracing: "true"`. Verify:

```bash
kubectl get pods -n lons-staging -l app.kubernetes.io/component=otel-collector
```

### Acceptance Criteria
- [ ] Prometheus scraping all Lōns services (verify in Targets UI)
- [ ] Grafana dashboards loaded and rendering
- [ ] AlertManager configured with at least email routing for critical alerts
- [ ] Fluent Bit running and logs appearing in CloudWatch (`/lons/staging/` log groups)
- [ ] OTel Collector running for distributed tracing

---

## DE-07: CI/CD Staging Auto-Deploy

**Monday.com ID:** 11621695517
**Priority:** Should — High
**Dependencies:** DE-01, DE-02

### What to Do

The deploy pipeline at `.github/workflows/deploy.yml` already supports staging auto-deploy on merge to `main`. Review and verify the following:

1. **Verify the staging deploy job** triggers correctly:
   - Trigger: `workflow_run` on CI success for `main` branch, OR manual `workflow_dispatch` with `environment: staging`
   - Steps: OIDC → ECR login → retag images → kubeconfig → Helm upgrade → smoke tests → rollback on failure

2. **Configure GitHub Environment** for staging:

   In the GitHub repository settings → Environments:
   - Create environment `staging` (if not exists)
   - Add environment secrets:
     - `AWS_ROLE_ARN_STAGING` = The IAM role ARN for OIDC federation (from `infrastructure/terraform/oidc.tf`)
   - Add environment variables:
     - `STAGING_URL` = `https://api.staging.lons.io`
   - No deployment protection rules needed for staging (auto-deploy is desired per NFR-CD-001)

3. **Verify ECR repositories exist** for all 6 services:

```bash
aws ecr describe-repositories --region eu-west-1 | grep lons
# Expected: lons-graphql-server, lons-rest-server, lons-scheduler,
#           lons-notification-worker, lons-admin-portal, lons-scoring-service
```

If missing, create them (Terraform S3 module should handle ECR repos):

```bash
for service in graphql-server rest-server scheduler notification-worker admin-portal scoring-service; do
  aws ecr create-repository --repository-name "lons-$service" --region eu-west-1 \
    --image-scanning-configuration scanOnPush=true
done
```

4. **Test a manual deploy:**

```bash
gh workflow run deploy.yml --field environment=staging
gh run list --workflow=deploy.yml --limit 1
```

5. **Verify smoke tests pass** — The deploy workflow runs `curl -sf "$STAGING_URL/v1/health"`. Ensure the REST server health endpoint responds correctly.

### Acceptance Criteria
- [ ] GitHub `staging` environment configured with `AWS_ROLE_ARN_STAGING` and `STAGING_URL`
- [ ] ECR repositories exist for all 6 services
- [ ] Manual staging deploy via `workflow_dispatch` succeeds
- [ ] Smoke test passes (health check returns 200)
- [ ] Merges to `main` trigger automatic staging deploy

---

## DE-08: Staging Backup & Reset

**Monday.com ID:** 11621695425
**Priority:** Should — Medium
**Dependencies:** DE-01, DE-04

### What to Do

1. **Verify AWS Backup** is configured for staging. The Terraform `backup` module (already applied in DE-01) creates:
   - Backup vault for staging
   - Daily RDS snapshots (7-day retention for staging per `daily_retention_days`)
   - Monthly RDS snapshots (90-day retention)
   - Redis snapshots

Verify:

```bash
aws backup list-backup-plans --region eu-west-1
aws backup list-backup-vaults --region eu-west-1
aws rds describe-db-snapshots --db-instance-identifier lons-staging --region eu-west-1
```

2. **Create a staging reset script** at `infrastructure/scripts/reset-staging.sh`. Per NFR-ENV-005, staging must be resettable within 30 minutes.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Reset Lōns Staging Environment
# This script tears down and rebuilds the staging data layer.
# Infrastructure (EKS, VPC, ALB) is preserved — only data is reset.

NAMESPACE="lons-staging"
HELM_RELEASE="lons"
HELM_CHART="infrastructure/helm/lons"
VALUES_FILE="infrastructure/helm/lons/values-staging.yaml"
REGION="eu-west-1"

echo "=== Lōns Staging Reset ==="
echo "This will:"
echo "  1. Scale down all services"
echo "  2. Drop and recreate the staging database"
echo "  3. Run migrations and seed data"
echo "  4. Flush Redis cache"
echo "  5. Redeploy all services"
echo ""
read -p "Are you sure? (type 'reset-staging' to confirm): " CONFIRM
if [ "$CONFIRM" != "reset-staging" ]; then
  echo "Aborted."
  exit 1
fi

START_TIME=$(date +%s)

echo "[1/5] Scaling down services..."
kubectl scale deployment --all --replicas=0 -n "$NAMESPACE"
kubectl wait --for=delete pods --all -n "$NAMESPACE" --timeout=120s || true

echo "[2/5] Resetting database..."
# Get DATABASE_URL from K8s secret
DB_URL=$(kubectl get secret lons-secrets -n "$NAMESPACE" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
# Drop and recreate database (connect to RDS directly)
kubectl run db-reset --rm -it --image=postgres:16 -n "$NAMESPACE" --restart=Never -- \
  psql "$DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS platform CASCADE;"

echo "[3/5] Running migrations and seed..."
helm upgrade --install "$HELM_RELEASE" "$HELM_CHART" \
  -f "$VALUES_FILE" \
  --namespace "$NAMESPACE" \
  --wait --timeout 10m

# Wait for migration hook to complete
sleep 10
kubectl wait --for=condition=complete job -l app.kubernetes.io/component=db-migration -n "$NAMESPACE" --timeout=300s

# Run seed
kubectl apply -f infrastructure/helm/lons/templates/seed-job.yaml
kubectl wait --for=condition=complete job/lons-staging-seed -n "$NAMESPACE" --timeout=600s

echo "[4/5] Flushing Redis cache..."
REDIS_URL=$(kubectl get secret lons-secrets -n "$NAMESPACE" -o jsonpath='{.data.REDIS_URL}' | base64 -d)
kubectl run redis-flush --rm -it --image=redis:7 -n "$NAMESPACE" --restart=Never -- \
  redis-cli -u "$REDIS_URL" FLUSHALL

echo "[5/5] Verifying services..."
kubectl get pods -n "$NAMESPACE"
kubectl wait --for=condition=ready pods --all -n "$NAMESPACE" --timeout=300s

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
echo ""
echo "=== Staging reset complete in ${ELAPSED}s ==="
```

```bash
chmod +x infrastructure/scripts/reset-staging.sh
```

3. **Create a staging snapshot script** at `infrastructure/scripts/snapshot-staging.sh` for on-demand backups before destructive testing:

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_INSTANCE="lons-staging"
REGION="eu-west-1"

echo "Creating staging snapshot: lons-staging-manual-$TIMESTAMP"

aws rds create-db-snapshot \
  --db-instance-identifier "$DB_INSTANCE" \
  --db-snapshot-identifier "lons-staging-manual-$TIMESTAMP" \
  --region "$REGION"

echo "Snapshot initiated. Monitor with:"
echo "  aws rds describe-db-snapshots --db-snapshot-identifier lons-staging-manual-$TIMESTAMP"
```

```bash
chmod +x infrastructure/scripts/snapshot-staging.sh
```

### Acceptance Criteria
- [ ] AWS Backup plans verified for staging (daily RDS snapshots, 7-day retention)
- [ ] `reset-staging.sh` exists, executable, and documented
- [ ] `snapshot-staging.sh` exists for on-demand manual snapshots
- [ ] Reset script completes within 30 minutes (NFR-ENV-005)

---

## Verification Checklist — Full Staging Environment

After all 8 tasks are complete, run through this final validation:

- [ ] **Infrastructure**: `terraform output` shows all endpoints (VPC, EKS, RDS, Redis, ALB)
- [ ] **Kubernetes**: `kubectl get pods -n lons-staging` — all pods Running, 1/1 Ready
- [ ] **Secrets**: `kubectl get externalsecrets -n lons-staging` — all synced (Status: SecretSynced)
- [ ] **Database**: All tables created (including Sprint 7 additions), seed data loaded
- [ ] **DNS**: `api.staging.lons.io` and `admin.staging.lons.io` resolve correctly
- [ ] **TLS**: HTTPS works, HSTS headers present
- [ ] **Health**: `curl https://api.staging.lons.io/v1/health` returns 200
- [ ] **GraphQL**: `curl https://api.staging.lons.io/graphql` returns GraphQL Playground or schema response
- [ ] **Admin Portal**: `https://admin.staging.lons.io` loads the login page
- [ ] **Monitoring**: Prometheus targets show Lōns services, Grafana dashboards render
- [ ] **Logging**: CloudWatch log groups exist under `/lons/staging/`
- [ ] **Access Control**: Staging is not publicly accessible without auth
- [ ] **CI/CD**: Manual dispatch to staging deploys successfully
- [ ] **Backup**: Daily snapshots scheduled, manual snapshot script works

---

## Files Modified / Created Summary

| Task | Action | File |
|------|--------|------|
| DE-02 | Modify | `infrastructure/helm/lons/values-staging.yaml` (add `allowMockAdapters`, service URLs, DB/Redis params) |
| DE-04 | Create | Seed job manifest (one-off, can be temporary) |
| DE-05 | Create | `infrastructure/helm/lons/templates/staging-rbac.yaml` |
| DE-05 | Modify | `infrastructure/helm/lons/values-staging.yaml` (IP allowlist or basic auth annotations) |
| DE-08 | Create | `infrastructure/scripts/reset-staging.sh` |
| DE-08 | Create | `infrastructure/scripts/snapshot-staging.sh` |
