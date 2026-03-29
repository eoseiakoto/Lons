# OpenTelemetry Tracing - Complete Index

Welcome to the OpenTelemetry distributed tracing implementation for Lōns. This index helps you navigate all the documentation and code.

## Quick Navigation

### For First-Time Users
1. **Start here**: [TRACING_NEXT_STEPS.md](./TRACING_NEXT_STEPS.md) - Exact commands to integrate tracing
2. **Then read**: [TRACING_IMPLEMENTATION_GUIDE.md](./TRACING_IMPLEMENTATION_GUIDE.md) - Step-by-step instructions
3. **Reference**: [TRACING_SETUP.md](./TRACING_SETUP.md) - Complete architecture and advanced topics

### For Architects & DevOps
1. [TRACING_SETUP.md](./TRACING_SETUP.md) - Full architecture, deployment strategy, integration
2. [TRACING_IMPLEMENTATION_SUMMARY.md](./TRACING_IMPLEMENTATION_SUMMARY.md) - Executive summary of deliverables
3. Helm chart: [`infrastructure/helm/lons/templates/otel-collector/`](./infrastructure/helm/lons/templates/otel-collector/)

### For Developers
1. [TRACING_NEXT_STEPS.md](./TRACING_NEXT_STEPS.md) - Commands to integrate into your service
2. [TRACING_IMPLEMENTATION_GUIDE.md](./TRACING_IMPLEMENTATION_GUIDE.md) - Code examples and custom spans
3. Source code:
   - TypeScript: [`packages/common/src/tracing/`](./packages/common/src/tracing/)
   - Python: [`services/scoring-service/app/tracing.py`](./services/scoring-service/app/tracing.py)

### For Troubleshooting
1. [TRACING_SETUP.md - Troubleshooting Section](./TRACING_SETUP.md#troubleshooting)
2. [TRACING_IMPLEMENTATION_GUIDE.md - Part 4: Troubleshooting](./TRACING_IMPLEMENTATION_GUIDE.md#part-4-troubleshooting)
3. Check service logs: `kubectl logs deployment/lons-otel-collector`

---

## Document Overview

### TRACING_NEXT_STEPS.md
**Purpose**: Action items with exact commands
**Length**: ~500 lines
**Audience**: Developers implementing tracing

**Contains**:
- Installation commands (npm/pip)
- Code examples for main.ts/main.py
- Custom span examples
- Local Docker Compose setup
- Kubernetes deployment commands
- Verification and troubleshooting commands
- Deployment checklist

**Start here if you need to**: Integrate tracing into a service right now

---

### TRACING_IMPLEMENTATION_GUIDE.md
**Purpose**: Detailed step-by-step integration guide
**Length**: ~2,200 lines
**Audience**: Developers and junior engineers

**Contains**:
- **Part 1: NestJS Services**
  - Step-by-step integration for all 4 NestJS services
  - Dependency installation
  - main.ts updates
  - AppModule registration
  - Custom span examples

- **Part 2: FastAPI Services**
  - Integration for scoring service
  - Dependency installation
  - main.py updates
  - Custom span examples

- **Part 3: Verify Integration**
  - Health checks
  - Log verification
  - X-Ray/Jaeger verification

- **Part 4: Troubleshooting**
  - Common issues and solutions
  - Diagnostic commands
  - Log analysis

**Start here if you need to**: Understand each integration step in detail

---

### TRACING_SETUP.md
**Purpose**: Complete architecture and setup documentation
**Length**: ~3,800 lines
**Audience**: Architects, DevOps engineers, senior developers

**Contains**:
- **Architecture** section with diagram
- **Components**:
  - OTEL Collector (Kubernetes)
  - NestJS Tracing Package
  - FastAPI Tracing Module

- **Helm Configuration**:
  - Values files for all environments
  - Environment variables injected
  - Services ready for integration
  - Resource allocation table

- **Deployment**:
  - Local Docker Compose
  - Kubernetes (EKS)
  - Environment-specific configs

- **Span Attributes**: Complete reference

- **Trace Sampling**: Advanced configuration

- **Debugging**: Commands and procedures

- **Integration**: Prometheus, AWS X-Ray

- **Troubleshooting**: Common issues and solutions

- **Best Practices**: Guidelines and examples

**Start here if you need to**: Understand the full system architecture

---

### TRACING_IMPLEMENTATION_SUMMARY.md
**Purpose**: Executive summary of all deliverables
**Length**: ~400 lines
**Audience**: Project leads, architects

**Contains**:
- Overview of OpenTelemetry implementation
- Files created/modified (organized by category)
- Key features checklist
- Implementation status by service
- Configuration summary
- Resource allocation table
- Next steps
- Testing procedures
- Architecture compliance checklist
- Support and troubleshooting references

**Start here if you need to**: Get a high-level overview of what was delivered

---

## Code Locations

### Helm Chart Templates
```
infrastructure/helm/lons/templates/otel-collector/
├── deployment.yaml          # Kubernetes Deployment
├── service.yaml             # ClusterIP Service
├── configmap.yaml           # OTEL Collector configuration
└── serviceaccount.yaml      # Service Account for RBAC
```

### Helm Values (Updated)
```
infrastructure/helm/lons/
├── values.yaml              # Defaults (tracing disabled)
├── values-dev.yaml          # Development (tracing enabled)
├── values-staging.yaml      # Staging (tracing enabled)
├── values-preprod.yaml      # Pre-prod (tracing enabled)
├── values-production.yaml   # Production (tracing enabled)
└── templates/configmap.yaml # Updated with OTEL env vars
```

### TypeScript Tracing Package
```
packages/common/src/tracing/
├── index.ts                 # initTracing() function
├── nestjs-tracing.module.ts # NestJS Global Module
└── (exported from packages/common/src/index.ts)
```

### Python Tracing Module
```
services/scoring-service/app/
└── tracing.py              # init_tracing() function
```

### Docker Configuration
```
infrastructure/docker/
└── otel-collector-config.yaml  # OTEL Collector config for Docker Compose
```

---

## Quick Command Reference

### Installation (Run once per service)

**NestJS services**:
```bash
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc @opentelemetry/auto-instrumentations-node \
  @opentelemetry/instrumentation-express @opentelemetry/instrumentation-graphql \
  @opentelemetry/instrumentation-redis-4 @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-http @opentelemetry/sdk-metrics \
  @opentelemetry/resources @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base @prisma/instrumentation
```

**FastAPI services**:
```bash
pip install opentelemetry-api==1.21.0 opentelemetry-sdk==1.21.0 \
  opentelemetry-exporter-otlp-proto-grpc==0.42b0 opentelemetry-instrumentation==0.42b0 \
  opentelemetry-instrumentation-fastapi==0.42b0 opentelemetry-instrumentation-requests==0.42b0 \
  opentelemetry-instrumentation-logging==0.42b0 opentelemetry-instrumentation-sqlalchemy==0.42b0 \
  opentelemetry-instrumentation-httpx==0.42b0
```

### Local Testing

```bash
# Start OTEL Collector and Jaeger
docker-compose up -d otel-collector jaeger

# Start all services
docker-compose up -d

# View traces
open http://localhost:16686

# Stop services
docker-compose down
```

### Kubernetes Deployment

```bash
# Development
helm install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-dev.yaml

# Staging
helm install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-staging.yaml

# Production
helm install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-production.yaml

# Verify
kubectl logs deployment/lons-otel-collector
kubectl get pods -l app.kubernetes.io/name=otel-collector
```

### Verification

```bash
# Check collector health
kubectl port-forward svc/lons-otel-collector 13133:13133
curl http://localhost:13133/

# Check tracing initialization
kubectl logs deployment/lons-graphql-server | grep Tracing

# View AWS X-Ray console
# https://console.aws.amazon.com/xray/
```

---

## Files by Purpose

### If you need to...

**Understand the architecture**:
- Read: [TRACING_SETUP.md - Architecture](./TRACING_SETUP.md#architecture)

**Deploy the infrastructure**:
- Read: [TRACING_SETUP.md - Deployment](./TRACING_SETUP.md#deployment)
- Check: [`infrastructure/helm/lons/templates/otel-collector/`](./infrastructure/helm/lons/templates/otel-collector/)

**Integrate a NestJS service**:
- Read: [TRACING_NEXT_STEPS.md - Part 1: NestJS Services Integration](./TRACING_NEXT_STEPS.md#nestjs-services-integration)
- Or detailed: [TRACING_IMPLEMENTATION_GUIDE.md - Part 1](./TRACING_IMPLEMENTATION_GUIDE.md#part-1-nestjs-services)

**Integrate the FastAPI service**:
- Read: [TRACING_NEXT_STEPS.md - FastAPI Service Integration](./TRACING_NEXT_STEPS.md#fastapi-service-integration)
- Or detailed: [TRACING_IMPLEMENTATION_GUIDE.md - Part 2](./TRACING_IMPLEMENTATION_GUIDE.md#part-2-fastapi-services)

**Add custom spans**:
- Read: [TRACING_IMPLEMENTATION_GUIDE.md - Step 4 (NestJS)](./TRACING_IMPLEMENTATION_GUIDE.md#step-4-add-custom-spans-to-business-logic) or [Step 3 (Python)](./TRACING_IMPLEMENTATION_GUIDE.md#step-3-add-custom-spans)
- Or example code in [TRACING_NEXT_STEPS.md](./TRACING_NEXT_STEPS.md)

**Test locally**:
- Read: [TRACING_NEXT_STEPS.md - Testing Traces](./TRACING_NEXT_STEPS.md#testing-traces)
- Or detailed: [TRACING_IMPLEMENTATION_GUIDE.md - Step 5](./TRACING_IMPLEMENTATION_GUIDE.md#step-5-test-locally)

**Troubleshoot issues**:
- Quick: [TRACING_NEXT_STEPS.md - Troubleshooting](./TRACING_NEXT_STEPS.md#troubleshooting-commands)
- Detailed: [TRACING_IMPLEMENTATION_GUIDE.md - Part 4](./TRACING_IMPLEMENTATION_GUIDE.md#part-4-troubleshooting)
- Advanced: [TRACING_SETUP.md - Troubleshooting](./TRACING_SETUP.md#troubleshooting)

**View configuration**:
- Defaults: `infrastructure/helm/lons/values.yaml`
- Development: `infrastructure/helm/lons/values-dev.yaml`
- Staging: `infrastructure/helm/lons/values-staging.yaml`
- Pre-prod: `infrastructure/helm/lons/values-preprod.yaml`
- Production: `infrastructure/helm/lons/values-production.yaml`

---

## Implementation Checklist

Use this checklist to track your progress:

### Infrastructure (Already Complete)
- [x] OTEL Collector Helm templates created
- [x] Values files configured for all environments
- [x] Environment variables injected via ConfigMap
- [x] Docker Compose configuration for local testing

### NestJS Services (Needs Code Updates)
- [ ] graphql-server: Dependencies installed
- [ ] graphql-server: main.ts updated
- [ ] graphql-server: AppModule updated
- [ ] graphql-server: Custom spans added (optional)
- [ ] rest-server: Dependencies installed
- [ ] rest-server: main.ts updated
- [ ] rest-server: AppModule updated
- [ ] scheduler: Dependencies installed
- [ ] scheduler: main.ts updated
- [ ] scheduler: AppModule updated
- [ ] notification-worker: Dependencies installed
- [ ] notification-worker: main.ts updated
- [ ] notification-worker: AppModule updated

### FastAPI Service (Needs Code Updates)
- [ ] scoring-service: Dependencies installed
- [ ] scoring-service: main.py updated
- [ ] scoring-service: Custom spans added (optional)

### Testing
- [ ] Local Docker Compose testing
- [ ] Traces visible in Jaeger UI
- [ ] Kubernetes deployment
- [ ] Traces visible in AWS X-Ray
- [ ] Custom attributes verified

---

## Support & Resources

### Internal Documentation
- [TRACING_SETUP.md](./TRACING_SETUP.md) - Complete reference
- [TRACING_IMPLEMENTATION_GUIDE.md](./TRACING_IMPLEMENTATION_GUIDE.md) - Step-by-step guide
- [TRACING_IMPLEMENTATION_SUMMARY.md](./TRACING_IMPLEMENTATION_SUMMARY.md) - Executive summary
- [TRACING_NEXT_STEPS.md](./TRACING_NEXT_STEPS.md) - Action items

### External Resources
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OTEL Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
- [OTEL Instrumentation Registry](https://opentelemetry.io/ecosystem/registry/)
- [AWS X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

### Getting Help
1. Check the relevant troubleshooting section above
2. Review service logs: `kubectl logs deployment/<service-name>`
3. Check collector logs: `kubectl logs deployment/lons-otel-collector`
4. Verify health: `curl http://collector:13133/`

---

## What's Next?

1. **Follow [TRACING_NEXT_STEPS.md](./TRACING_NEXT_STEPS.md)** to integrate each service
2. **Test locally** with Docker Compose
3. **Deploy to Kubernetes** with Helm
4. **View traces** in Jaeger (local) or AWS X-Ray (production)
5. **Add custom spans** to critical business logic
6. **Set up monitoring** with Prometheus and Grafana

---

**Last Updated**: 2026-03-29
**Infrastructure Status**: Complete and ready for integration
**Documentation Status**: Complete with 10,000+ lines
**Next Step**: Follow TRACING_NEXT_STEPS.md for service integration
