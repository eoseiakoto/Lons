# Sprint 7 — BA Directive Fix Prompt (Deployment Engineer)

> **Context:** The BA raised 2 Critical infrastructure issues. Fix both — the Platform Portal deployment depends on DEV completing their Fix 1 (Dockerfile stage + build verification) first, so start with Grafana while that lands.

---

## Fix 1 (Critical): Expose Grafana at `grafana.staging.lons.io`

**Monday.com item:** 11632446439

**Problem:** The Grafana pod is running in the monitoring namespace (installed via kube-prometheus-stack), and 3 dashboards are configured as ConfigMaps (`infrastructure/helm/lons/templates/monitoring/grafana-dashboards.yaml`). However, Grafana is only accessible via `kubectl port-forward` — there's no public ingress, no DNS record, and no TLS certificate coverage.

### Step 1: Create Grafana ingress template

Create `infrastructure/helm/lons/templates/monitoring/grafana-ingress.yaml`:

```yaml
{{- if and .Values.monitoring.dashboards.enabled .Values.monitoring.grafana.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "lons.fullname" . }}-grafana
  labels:
    {{- include "lons.labels" . | nindent 4 }}
  annotations:
    cert-manager.io/cluster-issuer: {{ .Values.certManager.issuer | default "letsencrypt-staging" }}
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    {{- if .Values.monitoring.grafana.ingress.annotations }}
    {{- toYaml .Values.monitoring.grafana.ingress.annotations | nindent 4 }}
    {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  tls:
    - hosts:
        - {{ .Values.monitoring.grafana.ingress.host | quote }}
      secretName: lons-grafana-tls
  rules:
    - host: {{ .Values.monitoring.grafana.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Values.monitoring.grafana.serviceName | default "kube-prometheus-stack-grafana" }}
                port:
                  number: {{ .Values.monitoring.grafana.servicePort | default 80 }}
{{- end }}
```

**Note:** The Grafana service name depends on your Helm release name for kube-prometheus-stack. Common patterns:
- `kube-prometheus-stack-grafana` (default)
- `prometheus-grafana`
- Check with: `kubectl get svc -n monitoring | grep grafana`

Adjust `serviceName` in values if different.

### Step 2: Add Grafana ingress config to `values-staging.yaml`

Add under the existing `monitoring` section (after the `prometheusName` line around line 176):

```yaml
  grafana:
    ingress:
      enabled: true
      host: grafana.staging.lons.io
      annotations:
        nginx.ingress.kubernetes.io/whitelist-source-range: "0.0.0.0/0"
    serviceName: kube-prometheus-stack-grafana
    servicePort: 80
    credentials:
      username: admin
      password: LonsStaging2026!
```

### Step 3: Add DNS record for `grafana.staging.lons.io`

Add a Route53 CNAME or A record pointing `grafana.staging.lons.io` to the same ALB/NLB as the other staging subdomains. This can be done either:

**Option A — Terraform (preferred):** Add to the existing Route53 DNS module alongside `api.staging.lons.io` and `admin.staging.lons.io`:

```hcl
resource "aws_route53_record" "grafana_staging" {
  zone_id = aws_route53_zone.lons_io.zone_id
  name    = "grafana.staging.lons.io"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.staging_alb.dns_name]
}
```

**Option B — Manual via AWS Console** (if faster for staging): Create a CNAME record for `grafana.staging.lons.io` → the ALB DNS name.

### Step 4: TLS coverage

The cert-manager ingress annotation on the Grafana ingress template will automatically provision a TLS cert via Let's Encrypt (staging issuer). If you already have a wildcard cert for `*.staging.lons.io`, update the ingress `secretName` to reference it instead.

### Step 5: Verify

```bash
# Check Grafana service exists in monitoring namespace
kubectl get svc -n monitoring | grep grafana

# After deployment, verify ingress
kubectl get ingress -A | grep grafana

# Test HTTPS access
curl -sI https://grafana.staging.lons.io

# Login with credentials
# Username: admin
# Password: LonsStaging2026!
```

**Verification checklist:**
- [ ] `grafana.staging.lons.io` resolves via DNS
- [ ] HTTPS loads with valid TLS certificate
- [ ] Grafana login works with `admin / LonsStaging2026!`
- [ ] 3 Lōns dashboards visible (Platform Overview, Per-Tenant Metrics, Integration Health)

---

## Fix 2 (Critical): Deploy Platform Portal to Staging

**Monday.com item:** 11632310461

**Dependency:** DEV must complete their Fix 1 first (Dockerfile stage + build verification). Start this once that lands.

**Problem:** The Platform Portal (`apps/platform-portal/`) is a separate Next.js app (port 3200) providing Platform Admin with a cross-tenant management view. It exists in the codebase but was never included in Helm or deployed. Only the SP-facing admin-portal is live.

### Step 1: Add `platformPortal` section to `values-staging.yaml`

Follow the exact same pattern as `adminPortal` (lines 121-138). Add after the `adminPortal` block:

```yaml
platformPortal:
  enabled: true
  replicaCount: 1
  image:
    tag: staging-latest
  port: 3200
  host: platform.staging.lons.io
  env:
    NEXT_PUBLIC_GRAPHQL_URL: "https://api.staging.lons.io/graphql"
    NEXT_PUBLIC_REST_URL: "https://api.staging.lons.io/v1"
    NEXT_PUBLIC_SCORING_URL: "http://lons-scoring-service:8000"
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 250m
      memory: 512Mi
  autoscaling:
    enabled: false
  healthCheck:
    path: /
    initialDelaySeconds: 15
    periodSeconds: 10
```

### Step 2: Add `platformPortal` defaults to `values.yaml`

Add after the existing `adminPortal` section (around line 250):

```yaml
platformPortal:
  enabled: false
  replicaCount: 2
  image:
    repository: ghcr.io/lons/platform-portal
    tag: latest
  port: 3200
  host: platform.lons.io
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 70
  healthCheck:
    path: /
    initialDelaySeconds: 15
    periodSeconds: 10
```

### Step 3: Create Helm deployment template

Create `infrastructure/helm/lons/templates/platform-portal/deployment.yaml` by copying `admin-portal/deployment.yaml` and replacing:
- All `adminPortal` references → `platformPortal`
- All `admin-portal` references → `platform-portal`
- Port `3100` → `3200` (from `.Values.platformPortal.port`)
- Add the env vars from values (`NEXT_PUBLIC_GRAPHQL_URL`, `NEXT_PUBLIC_REST_URL`, `NEXT_PUBLIC_SCORING_URL`)

The env section should be:

```yaml
          env:
            - name: NODE_ENV
              value: {{ .Values.config.nodeEnv | quote }}
            - name: NEXT_PUBLIC_GRAPHQL_URL
              value: {{ .Values.platformPortal.env.NEXT_PUBLIC_GRAPHQL_URL | default "http://localhost:3000/graphql" | quote }}
            - name: NEXT_PUBLIC_REST_URL
              value: {{ .Values.platformPortal.env.NEXT_PUBLIC_REST_URL | default "http://localhost:3002" | quote }}
            - name: NEXT_PUBLIC_SCORING_URL
              value: {{ .Values.platformPortal.env.NEXT_PUBLIC_SCORING_URL | default "http://localhost:8000" | quote }}
```

### Step 4: Create Helm service template

Create `infrastructure/helm/lons/templates/platform-portal/service.yaml` by copying `admin-portal/service.yaml` and replacing `adminPortal` → `platformPortal`, `admin-portal` → `platform-portal`.

### Step 5: Create Helm HPA template (optional)

Create `infrastructure/helm/lons/templates/platform-portal/hpa.yaml` by copying `admin-portal/hpa.yaml` and replacing references.

### Step 6: Update the main ingress template

In `infrastructure/helm/lons/templates/ingress.yaml`, add a platform-portal host rule after the admin-portal block (after line 58):

```yaml
    {{- if .Values.platformPortal.enabled }}
    - host: {{ .Values.platformPortal.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "lons.fullname" . }}-platform-portal
                port:
                  number: {{ .Values.platformPortal.port }}
    {{- end }}
```

Also add the TLS host (inside the existing `tls.hosts` list, after the adminPortal host):

```yaml
        {{- if .Values.platformPortal.enabled }}
        - {{ .Values.platformPortal.host | quote }}
        {{- end }}
```

### Step 7: Add DNS record for `platform.staging.lons.io`

Same approach as Grafana — add a Route53 CNAME pointing to the ALB:

```hcl
resource "aws_route53_record" "platform_staging" {
  zone_id = aws_route53_zone.lons_io.zone_id
  name    = "platform.staging.lons.io"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.staging_alb.dns_name]
}
```

### Step 8: Build and push Docker image

The DEV team will have added a `platform-portal` stage to the Dockerfile. Build and push:

```bash
# Build the platform-portal image
docker build --target platform-portal -t <ECR_REPO>/platform-portal:staging-latest .

# Push to ECR
docker push <ECR_REPO>/platform-portal:staging-latest
```

Also update the CI/CD deploy workflow (`.github/workflows/deploy.yml`) to build and push the `platform-portal` target alongside the existing services. Look for the existing `admin-portal` build step and duplicate it for `platform-portal`.

### Step 9: Verify

```bash
# Check deployment
kubectl get pods -n lons-staging | grep platform-portal

# Check service
kubectl get svc -n lons-staging | grep platform-portal

# Check ingress
kubectl get ingress -n lons-staging

# Test access
curl -sI https://platform.staging.lons.io

# Login with Platform Admin credentials:
# Email: admin@lons.io
# Password: AdminPass123!@#
```

**Verification checklist:**
- [ ] `platform.staging.lons.io` resolves via DNS
- [ ] HTTPS loads with valid TLS certificate
- [ ] Platform Portal login page renders
- [ ] Login works with `admin@lons.io` / `AdminPass123!@#`
- [ ] Dashboard loads with cross-tenant metrics
- [ ] Tenant drill-down works (tenants list → detail → products/customers/contracts)
- [ ] System health page shows service status
- [ ] Settings page displays correct staging URLs (not localhost)

---

## Execution Order

1. **Fix 1 (Grafana)** immediately — no dependencies
2. **Fix 2 (Platform Portal)** after DEV confirms Fix 1 (build + Dockerfile) is done

## Summary of New DNS Records

| Subdomain | Target | Purpose |
|-----------|--------|---------|
| `grafana.staging.lons.io` | ALB | Grafana monitoring dashboards |
| `platform.staging.lons.io` | ALB | Platform Admin portal |
