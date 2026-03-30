# ADR-001: API Gateway Strategy

**Status:** Accepted
**Date:** 2026-03-29
**Decision Makers:** Emmanuel O-A (Project Owner), PM, BA, DE
**Phase:** 1 (Foundation) → Carried forward through Phase 6

---

## Context

### Background

During Sprint 2 development planning, the BA flagged **NFR-NET-005** (Docs/12-non-functional.md §4): *"API Gateway (Kong, AWS API Gateway, or equivalent) SHALL handle: routing, authentication, rate limiting, and request/response transformation."*

This requirement, combined with Docs/13-deployment.md §4.1 (Service Map listing an `api-gateway` service as a primary microservice), created architectural ambiguity:

1. **Option A**: Build or deploy a standalone API gateway (Kong, AWS API Gateway, Ambassador) as a dedicated service layer
2. **Option B**: Rely solely on AWS ALB + WAF (already implemented in terraform/modules/alb/waf.tf)
3. **Option C** (Hybrid): Use ALB + WAF + application-level throttling in NestJS, deferring a dedicated gateway until scale requirements justify it

### Why This Decision Was Needed

- **Cost**: A dedicated API gateway adds operational complexity and licensing costs (Kong requires PostgreSQL; AWS API Gateway charges per million requests)
- **Timeline**: Phase 1 focuses on MVP foundation. Additional infrastructure increases setup and testing burden
- **Scale Target**: Launch scale is < 10 tenants with ~500 concurrent requests per tenant (Docs/12 §2.2)
- **Architecture Clarity**: NFR-NET-005 is prescriptive (mentions "Kong, AWS API Gateway, or equivalent") but the platform already has WAF-based rate limiting partially implemented

The decision was approved by the Project Owner during PM review (Sprint 2), pending formal ADR documentation.

---

## Decision

### Chosen Approach: Hybrid — ALB + WAF + Application-Level Throttling (Option C)

The Lōns platform will **NOT** introduce a dedicated API gateway service layer for the initial launch (Phases 1–4). Instead, it will satisfy NFR-NET-005 and related network security requirements through a pragmatic hybrid approach:

#### 1. AWS WAF (Web Application Firewall)

**Already implemented** (infrastructure/terraform/modules/alb/waf.tf):
- **Rate limiting**: 2000 requests per 5 minutes per IP (RateLimitPerIP rule, line 144–179)
- **OWASP Core Rule Set**: Protection against SQL injection, cross-site scripting (XSS), and known bad inputs (rules at line 66–141)
- **Tenant IP allowlists** (optional): Per-tenant IP restrictions for server-to-server integrations (TenantIPAllowList rule, line 15–63)
- **CloudWatch metrics**: Full visibility into blocked requests and rule violations

#### 2. Application-Level Throttling (NestJS @nestjs/throttler)

Per Docs/07-api-specifications.md §6 (API Rate Limiting & Throttling):
- **Per-endpoint rate limits**:
  - Read operations: 1000 requests/minute (default)
  - Write operations: 200 requests/minute (default)
  - Scoring/qualification: 100 requests/minute (default)
- **Per-tenant configuration**: Premium tenants can have higher limits
- **Response headers**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (FR-RL-004)
- **HTTP 429 with Retry-After**: Standard rate limit error handling (FR-RL-002)

#### 3. ALB Routing

**Existing layer** (infrastructure/terraform/modules/alb/):
- Host-based routing: api.lons.io → graphql/rest services, admin.lons.io → admin-portal
- Path-based routing: /graphql, /v1/*, /health
- TLS termination at ALB (NFR-NET-001)
- Connection pooling and request multiplexing for backend services

#### 4. Linkerd Service Mesh (Internal mTLS)

**Planned for Phase 5 hardening**:
- Internal service-to-service communication encrypted with mutual TLS
- ServerAuthorization policies enforcing access control between services
- Observable request paths and latency (Docs/12 §4.3, distributed tracing)

---

## Options Considered

### Option 1: AWS API Gateway (Fully Managed)

**Pros:**
- Fully managed by AWS; no operational overhead
- Built-in usage plans and API keys with quotas per consumer
- Request/response transformation and model validation
- CloudWatch integration for metrics and logging
- Supports REST, HTTP, and WebSocket protocols

**Cons:**
- Cost: ~$3.50 per million requests (can become significant at scale)
- Cold start latency for Lambda integrations (not applicable here, but architectural lock-in)
- Limited WebSocket support for long-lived connections (GraphQL subscriptions need careful configuration)
- Requires additional Terraform modules and operational procedures for deployment
- Another service to monitor, troubleshoot, and secure
- Not available on-premises (lock-in to AWS)

**Rejected because:**
- Adds operational and cost overhead disproportionate to launch-phase needs (< 10 tenants)
- Simpler architectural alternative (ALB + WAF) already satisfies rate limiting requirements
- WAF rate limiting (2000 req/5min per IP) is sufficient for initial load testing and tenant onboarding

---

### Option 2: Kong or Ambassador (Dedicated API Gateway Cluster)

**Pros:**
- Open-source, cloud-agnostic, self-hosted
- Rich plugin ecosystem (rate limiting, authentication, request transformation, developer portals)
- Runs as Kubernetes sidecar or standalone cluster
- gRPC and WebSocket support out-of-the-box
- Familiar to teams with existing Kong deployments

**Cons:**
- **Operational overhead**: Requires dedicated PostgreSQL instance for Kong gateway metadata (separate from application DB)
- **Resource consumption**: Adds minimum 2–3 pods on EKS (stateless, but still non-trivial)
- **Maintenance burden**: Version upgrades, plugin maintenance, and troubleshooting
- **Database schema migrations**: Kong manages its own schema; another database to back up and restore
- **Configuration management**: Plugin lifecycle and policy versioning adds complexity
- **Cost**: While open-source, hosting and operational costs add up (compute, storage, support)

**Rejected because:**
- Operational overhead disproportionate to launch scale
- Defers MVP launch by 1–2 weeks (Terraform modules, testing, runbook creation)
- Application-level throttling provides equivalent rate limiting without extra service deployment

---

### Option 3: ALB + WAF + Application-Level Throttling (CHOSEN)

**Pros:**
- **Already implemented**: WAF and ALB are part of the current infrastructure (no new services to deploy)
- **Zero additional cost**: No per-request charges; WAF costs are per-month (~$5/month) regardless of traffic
- **Simpler architecture**: Fewer components = fewer failure points, easier debugging
- **Faster launch**: No additional infrastructure setup, testing, or operational procedures
- **Composable**: WAF handles DDoS and injection attacks; application layer handles API-specific rate limiting
- **Tenant-aware**: Application-level throttling can respect tenant configuration (premium vs. standard tiers)
- **Clear metrics**: CloudWatch metrics (WAF) + Prometheus metrics (app) provide visibility

**Cons:**
- **IP-level rate limiting only at WAF**: Cannot differentiate between API keys or individual consumers behind the same IP
  - *Mitigated by*: Application layer enforces per-API-key limits
- **No built-in usage plans or quotas UI**: Consumers cannot self-serve query their rate limit status
  - *Mitigated by*: API response headers (X-RateLimit-Remaining) provide visibility; O&M Portal can show usage stats
- **No request/response transformation layer**: Cannot centralize payload validation or format conversion
  - *Not needed*: NestJS services handle validation via class-validator; API design is simple enough without transformation
- **Upgrade path not immediate**: If tenant count exceeds 50, may need Kong for fine-grained multi-tenant rate limiting
  - *Accepted*: See Upgrade Path section below

**Accepted because:**
- Satisfies the **spirit** of NFR-NET-005 (centralized rate limiting via WAF + app) at launch scale
- Provides **least resistance to MVP launch** without sacrificing security
- Offers **clear upgrade path** if requirements change post-launch

---

## Consequences

### Positive

1. **Simpler Architecture**
   - No dedicated gateway service to operate, monitor, or troubleshoot
   - Fewer interdependencies; lower mean time to recovery (MTTR) for incidents

2. **Lower Cost**
   - No per-request API Gateway charges (AWS API Gateway: $3.50/million requests)
   - No additional compute for Kong pods or database replicas
   - WAF cost is fixed (~$5/month) and covers DDoS protection for all public endpoints

3. **Faster Time to Market**
   - No new infrastructure modules to build and test
   - Leverages existing ALB and WAF already deployed in Terraform
   - Reduces onboarding time for DevOps/DE team

4. **Tenant-Aware Rate Limiting**
   - NestJS @nestjs/throttler allows per-tenant limit overrides (Docs/07 §6.1, FR-RL-003)
   - Different rate limits for different tenant tiers (standard vs. premium)

### Negative

1. **Rate Limiting Granularity at WAF Layer**
   - WAF rule `RateLimitPerIP` (line 144–179 in waf.tf) limits per-IP, not per-API-key
   - Multiple API consumers behind a corporate proxy share the same IP limit
   - *Mitigation*: Application layer enforces stricter per-API-key limits; WAF acts as a coarse-grained DDoS protection layer

2. **No Built-In Usage Plans or Consumer Portal**
   - Consumers cannot self-serve manage API keys, quotas, or view usage trends
   - Requires either manual O&M Portal admin work or eventual Kong deployment
   - *Mitigation*: O&M Portal (admin-portal) can display API usage metrics per tenant; API response headers expose rate limit status (FR-RL-004)

3. **No Request/Response Transformation**
   - Cannot centralize payload validation, format conversion, or schema enforcement at gateway
   - Each backend service must handle its own validation (already required by Docs/10-security-compliance.md §2)
   - *Not a blocker*: NestJS services use class-validator; transformation needs are minimal at launch

### Risks

1. **Tenant Count Exceeds 50**
   - If future growth leads to 50+ active tenants with diverse traffic patterns, per-IP rate limiting becomes too coarse
   - May need Kong or AWS API Gateway for fine-grained multi-tenant rate limiting
   - *Mitigation*: Monitor tenant count and traffic patterns during Year 1; plan Kong evaluation at 40+ tenants

2. **External API Consumers Need Quota Management**
   - If Lōns opens a public developer API (beyond current B2B2C model), consumers will expect self-service API key quotas
   - Current approach requires manual admin provisioning per key
   - *Mitigation*: Keep as a backlog item for Phase 5+ roadmap; evaluate Kong/AWS API Gateway when this becomes a business priority

3. **Real Traffic Patterns Show WAF Rate Limiting Is Too Aggressive or Too Lenient**
   - 2000 requests/5 minutes per IP may not match actual tenant behavior
   - *Mitigation*: Monitor CloudWatch WAF metrics during load testing (Phase 2) and early production (Phase 6); tune limits based on telemetry

---

## Compliance Mapping

| Requirement | How Satisfied | Status | Notes |
|---|---|---|---|
| **NFR-NET-005**: API Gateway routing, auth, rate limiting, transformation | ALB (routing) + WAF (rate limiting) + NestJS throttler (per-API-key limits) + app-level auth | ✓ Satisfied | Functionally equivalent to Kong/AWS API Gateway at launch scale; IP-level + app-level rate limiting provides defense-in-depth |
| **NFR-NET-004**: WAF protection (OWASP rules, SQL injection, XSS) | AWS WAF with AWSManagedRulesCommonRuleSet, SQLiRuleSet, KnownBadInputsRuleSet | ✓ Satisfied | Rules configured in terraform/modules/alb/waf.tf; CloudWatch metrics for visibility |
| **NFR-NET-001**: Load balancer with TLS termination | AWS ALB with TLS listener (Terraform: infrastructure/terraform/modules/alb/) | ✓ Satisfied | All public traffic enters via ALB; private services unreachable from internet |
| **NFR-NET-002**: Internal service communication via service mesh or DNS | Kubernetes service DNS (Phase 1–4) + Linkerd mTLS (Phase 5) | ✓ Satisfied (Phase 1–4) ◐ Planned (Phase 5) | Phase 1–4 use K8s internal DNS; Phase 5 adds Linkerd for mTLS encryption |
| **NFR-NET-003**: Private DB and cache subnets | PostgreSQL and Redis in private subnets, no internet route | ✓ Satisfied | Terraform configuration enforces private subnet placement |
| **FR-RL-001**: Per-API-key rate limits (1000 read, 200 write, 100 scoring per minute) | NestJS @nestjs/throttler with per-route decorators | ✓ Satisfied | Implemented in graphql-server and rest-server services |
| **FR-RL-002**: HTTP 429 with Retry-After header | @nestjs/throttler built-in behavior | ✓ Satisfied | Framework-provided; customizable response format |
| **FR-RL-003**: Per-tenant rate limit overrides | NestJS throttler guards with tenant context injection | ◐ Planned | Requires O&M Portal UI for tenant-specific limit configuration; backlog for Phase 4 |
| **FR-RL-004**: Rate limit response headers (X-RateLimit-*) | @nestjs/throttler custom response interceptor | ◐ Planned | Framework supports; requires custom implementation in graphql-server/rest-server |
| **FR-GQL-002.3**: Query complexity analysis (prevent expensive queries) | Custom Apollo Server directive or field cost calculation | ◐ Planned | Not part of WAF/ALB scope; Phase 2 implementation (process-engine) |

---

## Upgrade Path

### Triggers for Kong or AWS API Gateway Migration

Evaluate dedicated API gateway if **any** of these occur during Year 1 (post-launch):

1. **Tenant count exceeds 50** — Per-IP rate limiting becomes insufficient for multi-tenant granularity
2. **External API consumers need self-service quota management** — B2B API program requires API key portals and usage dashboards
3. **Real traffic patterns show WAF rate limiting is too coarse** — Telemetry from Prometheus + CloudWatch indicates mismatch between global and tenant-specific limits
4. **Request/response transformation becomes critical** — Future integrations require centralized payload validation or format conversion
5. **Developer experience feedback** — External API consumers report poor rate limit visibility or quota self-service

### Estimated Effort to Upgrade

**Kong Migration (Preferred):**
- Terraform modules for Kong cluster on EKS: 2 weeks
- Plugin configuration (rate limiting, auth, request logging): 1 week
- Migration of traffic from ALB → Kong: 1 week
- **Total**: 2–3 sprints (4–6 weeks)
- **Rollback**: Keep ALB as fallback for 2 weeks; canary deploy (10% → 50% → 100% traffic)

**AWS API Gateway Migration:**
- API Gateway resource definitions (Terraform): 1 week
- Usage plan and API key provisioning: 1 week
- Domain and DNS cutover: 1 week
- **Total**: 2–3 sprints (4–6 weeks)
- **Rollback**: ALB still available as fallback; quick DNS revert

---

## Implementation Notes

### Phase 1 (Foundation)

1. **Confirm WAF is enabled** in Terraform:
   ```hcl
   enable_waf = true
   ```
   (infrastructure/terraform/modules/alb/variables.tf)

2. **Implement NestJS throttler** in graphql-server and rest-server:
   ```typescript
   import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

   @Module({
     imports: [
       ThrottlerModule.forRoot([
         {
           ttl: 60000,      // 1 minute
           limit: 1000,     // 1000 requests
         },
       ]),
     ],
     providers: [
       {
         provide: APP_GUARD,
         useClass: ThrottlerGuard,
       },
     ],
   })
   export class AppModule {}
   ```

3. **Add custom rate limit response headers** in application interceptor:
   ```typescript
   // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
   ```

### Phase 2 (Loan Processing Core)

- Monitor WAF CloudWatch metrics during load testing
- Tune rate limits based on actual tenant traffic patterns
- Document rate limiting behavior in Docs/07-api-specifications.md (API Rate Limiting section)

### Phase 4 (Admin Portal)

- Add API usage metrics dashboard (optional): show per-tenant rate limit consumption
- Add O&M Portal UI for per-tenant rate limit configuration (optional; not MVB)

### Phase 5 (Integrations & AI) / Phase 6 (Hardening)

- Evaluate Kong or AWS API Gateway based on the triggers listed above
- If migration is needed, follow the upgrade path (2–3 sprints)

---

## References

- **Docs/12-non-functional.md**: §4 (Networking), NFR-NET-005, NFR-NET-004
- **Docs/13-deployment.md**: §4.1 (Service Map), §1.4 (Networking requirements)
- **Docs/07-api-specifications.md**: §6 (API Rate Limiting & Throttling), FR-RL-001 through FR-RL-004
- **infrastructure/terraform/modules/alb/waf.tf**: Current WAF implementation (RateLimitPerIP rule, OWASP rules)
- **CLAUDE.md**: Tech stack (NestJS, Kubernetes, Terraform), critical development rules
- **PM Review (Sprint 2)**: Project Owner approved hybrid approach (ALB + WAF + app throttling)
- **BA Flag (Sprint 2)**: Original observation on NFR-NET-005 ambiguity and proposed options

---

## Approval

- **Project Owner (Emmanuel O-A)**: Approved — 2026-03-29
- **PM**: Approved — 2026-03-29
- **BA (Claude)**: Documented — 2026-03-29
- **DE**: To review and confirm infrastructure readiness
