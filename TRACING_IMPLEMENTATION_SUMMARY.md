# OpenTelemetry Distributed Tracing Implementation Summary

## Overview

A complete distributed tracing infrastructure has been implemented for the Lōns platform using OpenTelemetry (OTEL), the OTEL Collector, and AWS X-Ray integration. The system supports NestJS services (TypeScript) and FastAPI services (Python).

## Files Created / Modified

### Helm Chart Templates

#### New OTEL Collector Templates
- **Location**: `infrastructure/helm/lons/templates/otel-collector/`
- **Files**:
  - `deployment.yaml` - Kubernetes Deployment for OTEL Collector
  - `service.yaml` - ClusterIP Service for collector access
  - `configmap.yaml` - OTEL Collector configuration (receivers, processors, exporters)
  - `serviceaccount.yaml` - Service account with necessary permissions

**Key Features**:
- Conditional deployment based on `tracing.enabled` flag
- Memory-limited containers with health checks
- Batch processing of spans
- AWS X-Ray and logging exporters
- PodDisruptionBudget for high availability

### Helm Values Files

#### Updated Values Files
1. **`values.yaml`** (defaults)
   - Added `tracing` section with default configuration
   - Collector disabled by default
   - AWS region set to `eu-west-1`
   - Endpoint configured as `http://lons-otel-collector:4317`

2. **`values-dev.yaml`**
   - Tracing enabled
   - 1 replica, minimal resources
   - Debug mode enabled
   - Auto-instrumentation for development

3. **`values-staging.yaml`**
   - Tracing enabled
   - Uses defaults (1 replica)

4. **`values-preprod.yaml`**
   - Tracing enabled
   - 2 replicas for high availability

5. **`values-production.yaml`**
   - Tracing enabled
   - 2 replicas, higher resource limits
   - Production-grade configuration

#### ConfigMap Update
- **File**: `templates/configmap.yaml`
- **Changes**:
  - Added `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
  - Conditional `ENABLE_TRACING` based on `tracing.enabled`
  - Dynamically injects collector URL into all services

### TypeScript Tracing Package

#### NestJS Tracing Module
- **Location**: `packages/common/src/tracing/`
- **Files**:
  - `index.ts` - Main initialization function and configuration interface
  - `nestjs-tracing.module.ts` - NestJS global module for tracing config

**Capabilities**:
- Automatic initialization with `initTracing()` function
- Auto-instrumentation for HTTP, Express, GraphQL, Redis, PostgreSQL, Prisma
- Batch span processing (5s timeout, 512 batch size)
- Metric export (30s interval)
- Graceful shutdown handling (SIGTERM/SIGINT)
- Health check endpoint filtering
- Comprehensive TypeScript types and JSDoc documentation

**Integration**:
- Exported from `packages/common` for use across services
- Can be injected as NestJS module via `TracingModule.forRoot()`
- Supports custom tracing configuration per service

### Python FastAPI Tracing Module

#### FastAPI Tracing Module
- **Location**: `services/scoring-service/app/tracing.py`
- **Features**:
  - Standalone initialization function `init_tracing()`
  - Auto-instrumentation for FastAPI, HTTP clients, logging, SQLAlchemy, HTTPX
  - Graceful error handling for collector connectivity issues
  - Metric and trace export to OTEL Collector
  - Helper function for manual span creation: `get_tracer()`

**Configuration**:
- Environment variables: `ENABLE_TRACING`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ENVIRONMENT`
- Comprehensive docstrings for implementation guidance

### Docker Compose Configuration

#### Local Development
- **File**: `infrastructure/docker/otel-collector-config.yaml`
- **Purpose**: OTEL Collector configuration for local testing
- **Exporters**: Logging (debug) and Jaeger
- **Health check**: Enabled on port 13133
- **Support services**: Integrates with Jaeger UI at `localhost:16686`

### Documentation

#### Setup Documentation
- **File**: `TRACING_SETUP.md`
- **Content**:
  - Architecture overview with diagram
  - Component descriptions (Collector, NestJS, FastAPI)
  - Configuration details for all environments
  - Deployment instructions (local and Kubernetes)
  - Span attributes and trace sampling
  - Integration with Prometheus and AWS X-Ray
  - Debugging and troubleshooting guide
  - Best practices and examples

#### Implementation Guide
- **File**: `TRACING_IMPLEMENTATION_GUIDE.md`
- **Content**:
  - Step-by-step NestJS integration instructions
  - Step-by-step FastAPI integration instructions
  - Dependency installation commands
  - Code examples for main.ts/main.py
  - Custom span examples for business logic
  - Docker Compose setup for local testing
  - Verification and health check procedures
  - Comprehensive troubleshooting section
  - Deployment checklist

## Integration Points

### Environment Variables Injected

All services automatically receive:
- `ENABLE_TRACING`: "true" when `tracing.enabled: true`, otherwise env var value
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Collector service URL (default: `http://lons-otel-collector:4317`)

### Services Ready for Integration

**NestJS Services** (awaiting main.ts updates):
- `apps/graphql-server`
- `apps/rest-server`
- `apps/scheduler`
- `apps/notification-worker`

**Python Services** (awaiting main.py updates):
- `services/scoring-service`

### Kubernetes Resources Created

When `tracing.enabled: true`, Helm creates:
- 1 Deployment (OTELCollector)
- 1 Service (OTELCollector, ClusterIP)
- 1 ConfigMap (OTELCollector config)
- 1 ServiceAccount (OTELCollector)
- 1 PodDisruptionBudget (high availability)

## Configuration Summary

### Resource Allocation by Environment

| Environment | Replicas | CPU Request | Memory Request | CPU Limit | Memory Limit |
|---|---|---|---|---|---|
| Development | 1 | 50m | 128Mi | 250m | 256Mi |
| Staging | 1 | 100m | 256Mi | 500m | 512Mi |
| Pre-prod | 2 | 100m | 256Mi | 500m | 512Mi |
| Production | 2 | 250m | 512Mi | 1000m | 1Gi |

### Collector Endpoints

- **gRPC OTLP**: `:4317` (primary receiver)
- **HTTP OTLP**: `:4318` (fallback receiver)
- **Prometheus Metrics**: `:8888`
- **Health Check**: `:13133`

### Processing Pipeline

```
Receivers (gRPC/HTTP)
    ↓
Memory Limiter (512 MiB)
    ↓
Batch Processor (5s, 512 batch size)
    ↓
Attributes Processor (adds metadata)
    ↓
Exporters:
  - AWS X-Ray
  - Logging (console)
  - OTLP (optional Jaeger/Tempo)
```

## Next Steps for Implementation

1. **Update NestJS main.ts files**
   - Add `initTracing()` as first import in all NestJS services
   - Install dependencies listed in TRACING_IMPLEMENTATION_GUIDE.md

2. **Update FastAPI main.py**
   - Add `init_tracing()` to scoring service
   - Install Python dependencies

3. **Add custom spans**
   - Identify critical business logic paths
   - Add manual spans using `trace.getTracer()` (NestJS) or `get_tracer()` (Python)

4. **Local testing**
   - Use docker-compose with OTEL Collector and Jaeger
   - Verify traces in Jaeger UI
   - Check environment variable injection

5. **Kubernetes deployment**
   - Deploy with `helm install` using appropriate values file
   - Verify collector health: `kubectl logs deployment/lons-otel-collector`
   - Check X-Ray console for traces

6. **Advanced features** (post-MVP)
   - Implement tail-based sampling for high-traffic services
   - Set up Prometheus metrics dashboards
   - Configure alerting based on span attributes

## Testing the Setup

### Local Docker Compose

```bash
# Start services with OTEL Collector
docker-compose up -d otel-collector jaeger

# Send a request to a service
curl -X GET http://localhost:3000/health

# View trace in Jaeger
open http://localhost:16686
```

### Kubernetes

```bash
# Deploy with tracing enabled
helm install lons ./infrastructure/helm/lons -f ./infrastructure/helm/lons/values-dev.yaml

# Check collector is running
kubectl get pods -l app.kubernetes.io/name=otel-collector

# View logs
kubectl logs deployment/lons-otel-collector

# Port-forward to local machine
kubectl port-forward svc/lons-otel-collector 4317:4317

# Send test request
curl -X GET http://localhost:3000/health

# Check AWS X-Ray console
```

## Architecture Compliance

This implementation follows the Lōns platform architecture:

✅ **Event-driven**: Traces track event flow through system
✅ **Multi-tenant**: Service namespace isolation via `service.namespace=lons`
✅ **Microservices**: Independent collector deployment, service-level instrumentation
✅ **Security**: No PII in spans (handled by masking utilities)
✅ **Observability**: Integrated with AWS X-Ray, Prometheus metrics, logging
✅ **Kubernetes-native**: Helm templating, resource management, health checks
✅ **Production-ready**: High availability, graceful degradation, comprehensive docs

## Support and Troubleshooting

See `TRACING_SETUP.md` sections:
- "Debugging Traces"
- "Integration with Monitoring"
- "Troubleshooting"

See `TRACING_IMPLEMENTATION_GUIDE.md` sections:
- "Part 3: Verify Integration"
- "Part 4: Troubleshooting"

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OTEL Collector Docs](https://opentelemetry.io/docs/collector/)
- [AWS X-Ray Integration](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html)
- [NestJS Instrumentation](https://opentelemetry.io/docs/instrumentation/js/libraries/express/)
- [FastAPI Instrumentation](https://opentelemetry.io/docs/instrumentation/python/libraries/fastapi/)
