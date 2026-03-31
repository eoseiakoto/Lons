# Sprint 7 — Staging Hardening DE Fix Prompt (BA Items + PM Finding)

**Priority: HIGH — Security and network hardening before SP prospect access**
**Owner: Deployment Engineer**
**Date: 2026-03-31**

All 4 BA items are confirmed in the codebase. PM has added 1 additional finding (Fix 5). All are DE-only — no Claude Code changes needed.

---

## Fix 1: Add platform-portal to TLS Certificate dnsNames (DE-11)

**Source:** BA item DE-11
**File:** `infrastructure/helm/lons/templates/cert-manager/certificate.yaml`

**Problem:** The cert-manager Certificate resource includes `ingress.host` (api.staging.lons.io) and `adminPortal.host` (admin.staging.lons.io) in its `dnsNames` list, but NOT `platformPortal.host` (platform.staging.lons.io). The ingress.yaml correctly references the TLS secret for all three hosts, but the Certificate resource only generates a cert covering two of them.

Current dnsNames section (lines 15-24):
```yaml
  dnsNames:
    - {{ .Values.ingress.host }}
    {{- if .Values.adminPortal }}
    {{- if .Values.adminPortal.host }}
    - {{ .Values.adminPortal.host }}
    {{- end }}
    {{- end }}
    {{- range .Values.certManager.additionalDomains }}
    - {{ . }}
    {{- end }}
```

**Fix:** Add platform-portal conditional between the adminPortal block and the additionalDomains range:

```yaml
  dnsNames:
    - {{ .Values.ingress.host }}
    {{- if .Values.adminPortal }}
    {{- if .Values.adminPortal.host }}
    - {{ .Values.adminPortal.host }}
    {{- end }}
    {{- end }}
    {{- if .Values.platformPortal }}
    {{- if .Values.platformPortal.host }}
    - {{ .Values.platformPortal.host }}
    {{- end }}
    {{- end }}
    {{- range .Values.certManager.additionalDomains }}
    - {{ . }}
    {{- end }}
```

**Verification:**
- `helm template lons infrastructure/helm/lons -f infrastructure/helm/lons/values-staging.yaml | grep -A 10 "kind: Certificate"` — should show `platform.staging.lons.io` in dnsNames
- After deploy: `kubectl get certificate -n lons-staging` — cert should list all 3 domains
- `curl -v https://platform.staging.lons.io 2>&1 | grep "subject:"` — cert should cover the platform domain

---

## Fix 2: Add NetworkPolicy for platform-portal (DE-12)

**Source:** BA item DE-12
**File:** `infrastructure/helm/lons/templates/networkpolicy.yaml`

**Problem:** The networkpolicy.yaml has policies for graphql-server, rest-server, admin-portal, scoring-service, scheduler, and notification-worker — but ZERO references to platform-portal. With `networkPolicy.enabled: true` in staging and a default deny-all policy (lines 3-15), platform-portal pods cannot receive any ingress traffic or send any egress traffic.

**Impact:** platform-portal will be unreachable from nginx ingress AND its GraphQL calls to the backend will be blocked.

**Fix:** Add two NetworkPolicy resources for platform-portal, following the exact patterns used for admin-portal. Insert after the admin-portal ingress policy (after line 86):

```yaml
---
# Allow ingress from nginx ingress controller to platform-portal
{{- if .Values.platformPortal.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "lons.fullname" . }}-allow-ingress-platform-portal
  labels:
    {{- include "lons.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: platform-portal
      app.kubernetes.io/instance: {{ .Release.Name }}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/name: ingress-nginx
      ports:
        - protocol: TCP
          port: {{ .Values.platformPortal.port }}
{{- end }}
```

Also add a platform-portal → graphql-server policy (see Fix 5 below).

**Verification:**
- `kubectl get networkpolicy -n lons-staging | grep platform-portal` — should show the new policies
- `curl -s https://platform.staging.lons.io/login` — should load (not timeout)

---

## Fix 3: Move Grafana credentials to AWS Secrets Manager (DE-13)

**Source:** BA item DE-13
**File:** `infrastructure/helm/lons/values-staging.yaml` (lines 210-212)

**Problem:** Grafana admin credentials are hardcoded in plaintext:
```yaml
monitoring:
  grafana:
    credentials:
      username: admin
      password: LonsStaging2026!
```

All other sensitive values (database, Redis, JWT, encryption keys, integration secrets) use ExternalSecrets backed by AWS Secrets Manager. Grafana credentials are the only exception — they're committed to Git in plain text.

**Fix:** Two parts:

**Part A — Add ExternalSecret for Grafana credentials.**
Create a new ExternalSecret resource in `infrastructure/helm/lons/templates/external-secrets/external-secret.yaml` (append after existing secrets):

```yaml
---
# Grafana credentials
{{- if and .Values.monitoring.grafana.ingress.enabled .Values.externalSecrets.enabled }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ include "lons.secretName" . }}-grafana
  labels:
    {{- include "lons.labels" . | nindent 4 }}
    app.kubernetes.io/component: secrets-grafana
spec:
  refreshInterval: {{ .Values.externalSecrets.refreshInterval | default "1h" }}
  secretStoreRef:
    name: {{ include "lons.fullname" . }}-aws-sm
    kind: ClusterSecretStore
  target:
    name: {{ include "lons.secretName" . }}-grafana
    template:
      engineVersion: v2
      data:
        admin-user: "{{ "{{ .username }}" }}"
        admin-password: "{{ "{{ .password }}" }}"
  data:
    - secretKey: username
      remoteRef:
        key: lons/{{ .Values.global.environment }}/grafana
        property: username
    - secretKey: password
      remoteRef:
        key: lons/{{ .Values.global.environment }}/grafana
        property: password
{{- end }}
```

**Part B — Add the secret to AWS Secrets Manager.**
Update `infrastructure/scripts/seed-secrets.sh` to include:
```bash
aws secretsmanager create-secret \
  --name "lons/${ENVIRONMENT}/grafana" \
  --secret-string '{"username":"admin","password":"LonsStaging2026!"}' \
  --region "${AWS_REGION}" 2>/dev/null || \
aws secretsmanager update-secret \
  --secret-id "lons/${ENVIRONMENT}/grafana" \
  --secret-string '{"username":"admin","password":"LonsStaging2026!"}' \
  --region "${AWS_REGION}"
```

**Part C — Remove plaintext password from values-staging.yaml.**
Replace the credentials block with a reference:
```yaml
monitoring:
  grafana:
    credentials:
      existingSecret: lons-staging-grafana  # Managed by ExternalSecret
```

**Note:** The Grafana ingress template references `.Values.monitoring.grafana.credentials` for documentation only (the TODO comment). The actual Grafana deployment (kube-prometheus-stack) is configured separately. If Grafana's Helm sub-chart requires `adminPassword` directly, reference the secret name instead.

**Verification:**
- `aws secretsmanager get-secret-value --secret-id lons/staging/grafana --region eu-west-1` — returns credentials
- `kubectl get externalsecret -n lons-staging | grep grafana` — shows synced state
- `kubectl get secret lons-staging-grafana -n lons-staging` — secret exists
- Login to grafana.staging.lons.io with admin / LonsStaging2026! — still works

---

## Fix 4: Restrict Staging IP Whitelist (DE-14)

**Source:** BA item DE-14
**File:** `infrastructure/helm/lons/values-staging.yaml` (lines 73-75, line 207)

**Problem:** Both the main ingress and the Grafana ingress have `whitelist-source-range: "0.0.0.0/0"` — staging is open to the entire internet. There's even a TODO comment at line 74: `# TODO: Replace "0.0.0.0/0" with Emmanuel's IP and office CIDR before SP prospect access`.

**Locations to update:**
1. Main ingress annotation (line 75): `nginx.ingress.kubernetes.io/whitelist-source-range: "0.0.0.0/0"`
2. Grafana ingress annotation (line 207): `nginx.ingress.kubernetes.io/whitelist-source-range: "0.0.0.0/0"`

**Fix:** Replace `0.0.0.0/0` with Emmanuel's office/home IP(s) and any SP prospect IPs. Use CIDR notation, comma-separated:

```yaml
# Main ingress (line 75)
nginx.ingress.kubernetes.io/whitelist-source-range: "<EMMANUEL_IP>/32,<OFFICE_CIDR>"

# Grafana ingress (line 207)
nginx.ingress.kubernetes.io/whitelist-source-range: "<EMMANUEL_IP>/32,<OFFICE_CIDR>"
```

**Action required from Emmanuel:** Provide the IP addresses or CIDR ranges to whitelist. The DE should:
1. Ask Emmanuel for his current public IP(s) and any office network CIDRs
2. Replace `0.0.0.0/0` with those values in both locations
3. Add a comment with the date and reason for the restriction

**Verification:**
- From whitelisted IP: `curl -s https://api.staging.lons.io/health` → 200 OK
- From non-whitelisted IP: `curl -s https://api.staging.lons.io/health` → 403 Forbidden
- Same for grafana.staging.lons.io

---

## Fix 5: Add platform-portal → graphql-server NetworkPolicy (PM Finding)

**Source:** PM cross-check
**File:** `infrastructure/helm/lons/templates/networkpolicy.yaml`

**Problem:** There's an existing `admin-portal → graphql-server` network policy (lines 140-162) that allows admin-portal pods to reach the GraphQL backend. Platform-portal also needs to reach graphql-server for all its cross-tenant queries (`allTenants`, `allWalletProviderConfigs`, `platformMetrics`, etc.), but there's NO equivalent policy.

With the default deny-all active, platform-portal's GraphQL requests to the backend will be silently blocked — the page will load (Fix 2 handles ingress) but all data fetches will fail.

**Fix:** Add after the existing `allow-admin-to-graphql` policy (after line 162):

```yaml
---
# Allow platform-portal to reach graphql-server
{{- if .Values.platformPortal.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "lons.fullname" . }}-allow-platform-to-graphql
  labels:
    {{- include "lons.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: graphql-server
      app.kubernetes.io/instance: {{ .Release.Name }}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: platform-portal
              app.kubernetes.io/instance: {{ .Release.Name }}
      ports:
        - protocol: TCP
          port: {{ .Values.graphqlServer.port }}
{{- end }}
```

**Verification:**
- `kubectl get networkpolicy -n lons-staging | grep platform` — should show both ingress and graphql policies
- Platform Portal dashboard loads AND shows cross-tenant data (not just the HTML shell)

---

## Summary

| # | Fix | File(s) | Task | Urgency |
|---|-----|---------|------|---------|
| 1 | TLS cert dnsNames for platform-portal | `cert-manager/certificate.yaml` | DE-11 | CRITICAL |
| 2 | NetworkPolicy ingress for platform-portal | `networkpolicy.yaml` | DE-12 | CRITICAL |
| 3 | Grafana creds to Secrets Manager | `external-secret.yaml`, `values-staging.yaml`, `seed-secrets.sh` | DE-13 | HIGH |
| 4 | Restrict IP whitelist | `values-staging.yaml` (2 locations) | DE-14 | HIGH |
| 5 | NetworkPolicy platform-portal → graphql | `networkpolicy.yaml` | DE-12 (addendum) | CRITICAL |

**Dependencies:** Fix 4 requires Emmanuel's IP addresses — DE should request these before starting.

No Claude Code (DEV) fixes needed this round.
