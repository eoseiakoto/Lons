# Lōns Platform Security Hardening

This document outlines the security hardening measures implemented for the Lōns fintech platform on AWS EKS.

## Overview

The security hardening initiative addresses five critical areas:
1. **Service Mesh & mTLS** - Encrypted pod-to-pod communication
2. **Secrets Rotation** - Automated credential rotation via AWS Secrets Manager
3. **Network Policies** - Fine-grained traffic control
4. **WAF IP Restrictions** - Tenant-specific API access controls
5. **Kubernetes & Infrastructure as Code** - Production-ready configuration

---

## 1. Service Mesh (Linkerd) Implementation

### Purpose
Provides automatic mutual TLS (mTLS) between pods, encrypting all inter-service communication and enabling traffic control policies.

### Configuration Files
- **Helm Templates:**
  - `infrastructure/helm/lons/templates/service-mesh/linkerd-annotations.yaml` - Documentation and configuration
  - `infrastructure/helm/lons/templates/service-mesh/server-authorization.yaml` - mTLS authorization policies

### How It Works
- **Automatic Injection:** Linkerd proxy sidecar is injected into each pod via annotations
- **mTLS by Default:** All pod-to-pod traffic is automatically encrypted
- **Service Profiles:** Define routing rules, retries, and timeouts per service
- **Authorization Policies:** Fine-grained control over which services can communicate

### Deployment Annotations
All service deployments now include Linkerd annotations (conditional on `serviceMesh.enabled`):
```yaml
linkerd.io/inject: enabled
config.linkerd.io/proxy-cpu-request: 25m
config.linkerd.io/proxy-memory-request: 64Mi
config.linkerd.io/proxy-cpu-limit: 250m
config.linkerd.io/proxy-memory-limit: 256Mi
```

### Environment-Specific Configuration
- **Development:** Disabled (overhead not justified for local testing)
- **Staging:** Enabled, authorization disabled (testing)
- **Preprod:** Enabled, authorization enabled (production-like)
- **Production:** Enabled, authorization enabled (full security)

### Service Communication Rules (Authorization)
When enabled, the following policies are enforced:
- **graphql-server → scoring-service:** Allowed (mTLS)
- **rest-server → scoring-service:** Allowed (mTLS)
- **admin-portal → graphql-server:** Allowed (mTLS)
- **scheduler → notification-worker:** Allowed (mTLS)
- **Ingress → graphql-server/rest-server/admin-portal:** Allowed (unauthenticated)
- **All other pod-to-pod communication:** Blocked

### Deployment Instructions
1. Install Linkerd control plane to the cluster
2. Label namespace for injection: `kubectl label namespace lons linkerd.io/inject=enabled`
3. Enable via Helm values: `serviceMesh.enabled: true` and `serviceMesh.authorization.enabled: true` (preprod/prod)

---

## 2. Network Policies Hardening

### Purpose
Provides fine-grained Layer 3/4 traffic control at the Kubernetes network level.

### Configuration File
- `infrastructure/helm/lons/templates/networkpolicy.yaml`

### Key Changes
- **Default Deny:** All ingress traffic is blocked by default
- **Explicit Allow Rules:** Only necessary traffic is permitted
- **Egress Policies:** Each service has explicit egress rules

### Traffic Rules by Service

#### graphql-server
- **Ingress:**
  - nginx ingress controller → 3000
  - admin-portal → 3000
- **Egress:**
  - → scoring-service:8000
  - → PostgreSQL:5432
  - → Redis:6379
  - → DNS:53

#### rest-server
- **Ingress:** nginx ingress controller → 3001
- **Egress:**
  - → scoring-service:8000
  - → PostgreSQL:5432
  - → Redis:6379
  - → DNS:53

#### scoring-service
- **Ingress:**
  - graphql-server → 8000
  - rest-server → 8000
- **Egress:** DNS only (no database access)

#### scheduler
- **Ingress:** None (internal only)
- **Egress:**
  - → notification-worker:3003
  - → PostgreSQL:5432
  - → Redis:6379
  - → DNS:53

#### notification-worker
- **Ingress:** scheduler → 3003
- **Egress:** External APIs (SMS/Email) + DNS

#### admin-portal
- **Ingress:** nginx ingress controller → 3100
- **Egress:**
  - → graphql-server:3000
  - → DNS:53

### Deployment
Network policies are controlled by values: `networkPolicy.enabled: true`

---

## 3. AWS Secrets Manager Key Rotation

### Purpose
Automates rotation of sensitive credentials (DB passwords, JWT keys, encryption keys) to reduce exposure window.

### Terraform Module
- **Location:** `infrastructure/terraform/modules/secrets-rotation/`
- **Files:**
  - `variables.tf` - Input variables and configuration
  - `main.tf` - Lambda function, rotation schedules, IAM roles
  - `outputs.tf` - Exported values for integration

### Rotation Strategies

#### Database Credentials (30 days)
- Uses AWS-provided RDS PostgreSQL rotation Lambda template
- Lambda has VPC access to RDS security group
- Rotates master user password automatically
- CloudWatch alarms monitor rotation success

#### JWT Signing Keys (90 days)
- Managed via Secrets Manager
- Application polls for new keys via GetSecretValue API
- Old keys remain valid for grace period (configurable)
- Zero-downtime rotation

#### Encryption Keys (180 days)
- Master encryption key rotated via AWS KMS
- Data re-encryption handled asynchronously
- Previous key version available for decryption of old data

### Lambda Function Details
- **Runtime:** Python 3.11
- **Timeout:** 60 seconds
- **VPC Access:** Runs in private subnets with RDS security group access
- **IAM Permissions:**
  - `secretsmanager:GetSecretValue`
  - `secretsmanager:PutSecretValue`
  - `secretsmanager:UpdateSecretVersionStage`
  - `rds-db:connect`
  - EC2 VPC networking permissions

### CloudWatch Monitoring
- **Error Alarms:** Alert on rotation Lambda failures
- **Duration Alarms:** Alert if rotation takes >50 seconds
- **Log Retention:** 14 days of rotation logs

### Configuration Variables
```hcl
rotation_rules = {
  database_rotation_days   = 30   # Database password rotation
  jwt_rotation_days        = 90   # JWT keys rotation
  encryption_rotation_days = 180  # Encryption keys rotation
  automatically_after_days = 30   # Trigger rotation after N days
}
```

### Deployment
1. Create Lambda layer with psycopg2 (PostgreSQL driver)
2. Deploy Lambda function via Terraform
3. Create database rotation user with limited permissions
4. Configure Secrets Manager secret for rotation
5. Enable automatic rotation schedule

---

## 4. WAF IP Restrictions for Tenant APIs

### Purpose
Restricts access to tenant-specific API endpoints (`/v1/tenant/*`) to pre-approved IP ranges.

### Terraform Module
- **Location:** `infrastructure/terraform/modules/alb/waf.tf` (enhanced)

### Configuration
- **IP Set Resource:** `aws_wafv2_ip_set.tenant_allowed_ips`
- **WAF Rule:** "TenantIPAllowList" (dynamic, only created if enabled)
- **Response Code:** 403 Forbidden for blocked requests

### WAF Rule Logic
```
IF request.path starts with "/v1/tenant"
   AND source_ip NOT in tenant_allowed_ips
THEN
   BLOCK with 403
ENDIF
```

### Usage Example
```hcl
variable "enable_tenant_ip_restriction" {
  default = true
}

variable "tenant_allowed_ips" {
  # CIDR blocks for approved tenant networks
  default = [
    "203.0.113.0/24",    # Tenant A network
    "198.51.100.0/24"    # Tenant B network
  ]
}
```

### Management
- IP sets are version-controlled in Terraform
- Changes require Terraform apply (blue-green deployment recommended)
- Updates take ~30 seconds to propagate to WAF

### Other WAF Rules
- **AWS Managed Rules:** Common RuleSet, Known Bad Inputs, SQL Injection
- **Rate Limiting:** 2000 requests/5min per IP
- **Custom Rules:** Extensible pattern for future rules

---

## 5. Values File Configuration

### File Hierarchy
```
values.yaml (base production defaults)
├── values-dev.yaml (development - disabled features)
├── values-staging.yaml (staging - mesh enabled, no authz)
├── values-preprod.yaml (preprod - full mesh + authz)
└── values-production.yaml (production - full mesh + authz)
```

### serviceMesh Configuration
All values files now include:
```yaml
serviceMesh:
  enabled: true/false
  proxy:
    cpuRequest: "25m"
    memoryRequest: "64Mi"
    cpuLimit: "250m"
    memoryLimit: "256Mi"
  authorization:
    enabled: true/false
```

### Environment Defaults
| Environment | Mesh Enabled | Authorization |
|---|---|---|
| Development | false | false |
| Staging | true | false |
| Preprod | true | true |
| Production | true | true |

---

## Deployment Timeline

### Phase 1: Preparation (Week 1)
- [ ] Install Linkerd control plane to EKS
- [ ] Create Lambda layer with psycopg2
- [ ] Create IAM roles and security groups
- [ ] Update Terraform state

### Phase 2: Staging Deployment (Week 2)
- [ ] Deploy serviceMesh (enabled, no authz) to staging
- [ ] Enable network policies in staging
- [ ] Enable WAF IP restrictions in staging
- [ ] Test database credential rotation

### Phase 3: Validation (Week 3)
- [ ] Monitor Linkerd metrics and logs
- [ ] Verify network policy enforcement
- [ ] Test WAF IP blocking scenarios
- [ ] Validate rotation Lambda execution

### Phase 4: Preprod/Production (Week 4)
- [ ] Enable authorization policies
- [ ] Deploy to preprod (blue-green)
- [ ] Production canary deployment
- [ ] Full rollout to production

---

## Monitoring & Alerts

### Linkerd Metrics
```
linkerd_proxy_connections_total - Pod connection metrics
linkerd_proxy_request_latency - Service latency
linkerd_proxy_errors_total - Failed requests
```

### Network Policy Monitoring
- Use NetworkPolicy-aware CNI (Calico/Cilium) metrics
- Monitor denied connections in logs
- Alert on unexpected denials

### WAF Metrics
- `BlockedRequests` - Count of blocked requests
- `AllowedRequests` - Count of allowed requests
- `RateLimitedRequests` - Count of rate-limited IPs

### Secrets Rotation Monitoring
- Lambda error metrics via CloudWatch
- Rotation completion status in Secrets Manager console
- Manual trigger via EventBridge rule

---

## Security Considerations

### Threats Mitigated
1. **Unencrypted inter-service communication** → Linkerd mTLS
2. **Lateral movement in cluster** → Network Policies + authorization
3. **Credential exposure** → Secrets rotation + encryption
4. **Unauthorized API access** → WAF IP allowlisting
5. **Container image tampering** → Image scanning + admission controllers (future)

### Residual Risks
- **Secrets at rest in Secrets Manager** → Mitigated by KMS encryption
- **Ingress TLS** → Managed by cert-manager (separate)
- **Application-level auth** → JWT/OAuth (separate)
- **Data in transit to external systems** → TLS (application responsibility)

### Future Hardening
- Pod Security Policy (PSP) / Pod Security Standards (PSS)
- RBAC refinements per team
- Service account token improvements
- Runtime security monitoring (Falco/Sysdig)
- Image scanning and policy enforcement

---

## Troubleshooting

### Linkerd Issues
```bash
# Check mesh health
linkerd check

# Inspect pod injection
kubectl get pods -o jsonpath='{.items[*].spec.initContainers[*].name}'

# View mTLS metrics
linkerd viz top
```

### Network Policy Issues
```bash
# Test connectivity
kubectl exec -it <pod> -- curl http://<service>:<port>

# Check NetworkPolicy resources
kubectl get networkpolicy -A

# Examine traffic logs
kubectl logs <pod> -c linkerd-proxy
```

### Secrets Rotation Issues
```bash
# Check Lambda logs
aws logs tail /aws/lambda/lons-db-rotation-production --follow

# Manual rotation trigger
aws secretsmanager rotate-secret --secret-id <secret-arn> --rotation-rules AutomaticallyAfterDays=1

# Verify secret version
aws secretsmanager describe-secret --secret-id <secret-arn>
```

### WAF Issues
```bash
# Check WAF rules
aws wafv2 describe-web-acl --name lons-waf-production --scope REGIONAL

# Update IP set
aws wafv2 update-ip-set --name lons-tenant-allowed-ips --ip-set-id <id> --addresses "203.0.113.0/24"

# View blocked requests
aws wafv2 get-sampled-requests --web-acl-arn <arn> --rule-metric-name TenantIPAllowList
```

---

## Files Modified/Created

### New Helm Templates
- `infrastructure/helm/lons/templates/service-mesh/linkerd-annotations.yaml`
- `infrastructure/helm/lons/templates/service-mesh/server-authorization.yaml`

### Updated Helm Templates
- `infrastructure/helm/lons/templates/graphql-server/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/rest-server/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/scheduler/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/notification-worker/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/scoring-service/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/admin-portal/deployment.yaml` - Added Linkerd annotations
- `infrastructure/helm/lons/templates/networkpolicy.yaml` - Hardened rules + egress policies

### New Terraform Modules
- `infrastructure/terraform/modules/secrets-rotation/variables.tf`
- `infrastructure/terraform/modules/secrets-rotation/main.tf`
- `infrastructure/terraform/modules/secrets-rotation/outputs.tf`

### Updated Terraform Modules
- `infrastructure/terraform/modules/alb/waf.tf` - Added IP set + tenant restriction rule
- `infrastructure/terraform/modules/alb/variables.tf` - Added tenant IP restriction variables

### Updated Values Files
- `infrastructure/helm/lons/values.yaml` - Added serviceMesh config (disabled)
- `infrastructure/helm/lons/values-dev.yaml` - Added serviceMesh config (disabled)
- `infrastructure/helm/lons/values-staging.yaml` - Added serviceMesh config (enabled, no authz)
- `infrastructure/helm/lons/values-preprod.yaml` - Added serviceMesh config (enabled with authz)
- `infrastructure/helm/lons/values-production.yaml` - Added serviceMesh config (enabled with authz)

---

## References

- **Linkerd Docs:** https://linkerd.io/2.14/reference/
- **Kubernetes Network Policies:** https://kubernetes.io/docs/concepts/services-networking/network-policies/
- **AWS WAF:** https://docs.aws.amazon.com/waf/
- **AWS Secrets Manager Rotation:** https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html
- **Terraform AWS WAFv2:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/wafv2_web_acl

---

**Document Version:** 1.0
**Last Updated:** 2026-03-29
**Status:** Ready for Staging Deployment
