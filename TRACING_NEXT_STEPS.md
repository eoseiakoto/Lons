# OpenTelemetry Tracing - Next Steps

This document provides the exact commands and steps to integrate distributed tracing into each service.

## Quick Start

All infrastructure is ready. Services need to be updated to use the tracing packages.

## NestJS Services Integration

### 1. GraphQL Server (`apps/graphql-server`)

**Step 1: Install dependencies**
```bash
cd apps/graphql-server
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/instrumentation-express \
  @opentelemetry/instrumentation-graphql \
  @opentelemetry/instrumentation-redis-4 \
  @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base \
  @prisma/instrumentation
```

**Step 2: Update `src/main.ts`**

Add this at the very top (before any other imports):

```typescript
import { initTracing } from '@lons/common/tracing';

initTracing({
  serviceName: 'graphql-server',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV,
  enabled: process.env.ENABLE_TRACING === 'true',
});

// Rest of imports and code...
```

**Step 3: Register TracingModule in `src/app.module.ts`**

```typescript
import { TracingModule } from '@lons/common/tracing';

@Module({
  imports: [
    TracingModule.forRoot({
      serviceName: 'graphql-server',
      enabled: process.env.ENABLE_TRACING === 'true',
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

**Step 4: Add custom spans (optional but recommended)**

In critical services (e.g., loan request service):

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

// In your service class
private tracer = trace.getTracer('loan-request-service');

async createLoanRequest(request: CreateLoanRequestDto) {
  const span = this.tracer.startSpan('create_loan_request');
  try {
    span.setAttribute('customer_id', request.customerId);
    // ... business logic
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

---

### 2. REST Server (`apps/rest-server`)

Repeat the same steps as GraphQL server but with:
- Service name: `'rest-server'`
- Same dependencies installation
- Same main.ts updates

---

### 3. Scheduler (`apps/scheduler`)

Repeat the same steps as GraphQL server but with:
- Service name: `'scheduler'`
- Same dependencies installation
- Same main.ts updates

---

### 4. Notification Worker (`apps/notification-worker`)

Repeat the same steps as GraphQL server but with:
- Service name: `'notification-worker'`
- Same dependencies installation
- Same main.ts updates

---

## FastAPI Service Integration

### Scoring Service (`services/scoring-service`)

**Step 1: Install dependencies**

```bash
cd services/scoring-service
pip install \
  opentelemetry-api==1.21.0 \
  opentelemetry-sdk==1.21.0 \
  opentelemetry-exporter-otlp-proto-grpc==0.42b0 \
  opentelemetry-instrumentation==0.42b0 \
  opentelemetry-instrumentation-fastapi==0.42b0 \
  opentelemetry-instrumentation-requests==0.42b0 \
  opentelemetry-instrumentation-logging==0.42b0 \
  opentelemetry-instrumentation-sqlalchemy==0.42b0 \
  opentelemetry-instrumentation-httpx==0.42b0
```

Or update `requirements.txt` with:

```
opentelemetry-api==1.21.0
opentelemetry-sdk==1.21.0
opentelemetry-exporter-otlp-proto-grpc==0.42b0
opentelemetry-instrumentation==0.42b0
opentelemetry-instrumentation-fastapi==0.42b0
opentelemetry-instrumentation-requests==0.42b0
opentelemetry-instrumentation-logging==0.42b0
opentelemetry-instrumentation-sqlalchemy==0.42b0
opentelemetry-instrumentation-httpx==0.42b0
```

**Step 2: Update `app/main.py`**

Add at the very beginning:

```python
from app.tracing import init_tracing
from fastapi import FastAPI

# Initialize tracing FIRST
init_tracing(service_name="scoring-service", service_version="1.0.0")

# Now create app
app = FastAPI(title="Scoring Service")

# Initialize tracing for app
init_tracing(app=app, service_name="scoring-service", service_version="1.0.0")

# Rest of app code...
```

**Step 3: Add custom spans (optional but recommended)**

```python
from app.tracing import get_tracer
from opentelemetry.trace import Status, StatusCode

tracer = get_tracer("scoring-engine")

def calculate_credit_score(customer_data: dict) -> float:
    with tracer.start_as_current_span("credit_score_calculation") as span:
        try:
            span.set_attribute("customer_id", customer_data.get("id"))

            # Score calculation logic
            score = ml_model.predict(features)

            span.set_attribute("score", score)
            span.set_status(Status(StatusCode.OK))
            return score
        except Exception as e:
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise
```

---

## Verification Steps

### 1. Local Testing with Docker Compose

**Add to docker-compose.yml**:

```yaml
otel-collector:
  image: otel/opentelemetry-collector-contrib:0.96.0
  command: ["--config=/etc/otel/config.yaml"]
  ports:
    - "4317:4317"  # OTLP gRPC
    - "4318:4318"  # OTLP HTTP
    - "8888:8888"  # Prometheus
    - "13133:13133"  # Health check
  volumes:
    - ./infrastructure/docker/otel-collector-config.yaml:/etc/otel/config.yaml
  depends_on:
    - jaeger
  environment:
    - GOGC=80

jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # UI
    - "14250:14250"  # Collector gRPC
```

**Commands**:

```bash
# Start services
docker-compose up -d otel-collector jaeger

# Build and start services
docker-compose up -d

# Check logs for tracing initialization
docker-compose logs graphql-server | grep Tracing
docker-compose logs scoring-service | grep Tracing

# View traces
open http://localhost:16686

# Cleanup
docker-compose down
```

---

### 2. Kubernetes Testing

**Deploy with tracing enabled**:

```bash
# Development
helm install lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-dev.yaml \
  --namespace lons \
  --create-namespace

# Or upgrade existing
helm upgrade lons ./infrastructure/helm/lons \
  -f ./infrastructure/helm/lons/values-dev.yaml \
  --namespace lons
```

**Verification commands**:

```bash
# Check collector is running
kubectl get pods -n lons -l app.kubernetes.io/name=otel-collector
# Should show 1 pod in Running state

# Check collector logs
kubectl logs -n lons deployment/lons-otel-collector

# Check environment variables injected
kubectl exec -n lons deployment/lons-graphql-server -- env | grep -E "ENABLE_TRACING|OTEL"

# Send test request
kubectl port-forward -n lons svc/lons-graphql-server 3000:3000 &
curl http://localhost:3000/health

# Check X-Ray console in AWS
# Navigate to: https://console.aws.amazon.com/xray/home
# Look for service map and traces
```

---

## Testing Traces

### Generate Sample Traces

**GraphQL**:
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ healthCheck { status } }"
  }'
```

**REST**:
```bash
curl -X GET http://localhost:3001/health
```

**Scoring**:
```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_123",
    "income": 50000,
    "credit_score": 700
  }'
```

### View in Jaeger (Local)

1. Open http://localhost:16686
2. Select service from dropdown (graphql-server, rest-server, etc.)
3. Click "Find Traces"
4. Click on trace to see details
5. Expand spans to see attributes

### View in AWS X-Ray (Kubernetes)

1. Go to https://console.aws.amazon.com/xray/home
2. Click "Service map" to see service dependencies
3. Click "Traces" to see individual requests
4. Filter by service, status, or other attributes

---

## Troubleshooting Commands

### Check Collector Health

```bash
# Local
curl http://localhost:13133/

# Kubernetes
kubectl port-forward -n lons svc/lons-otel-collector 13133:13133
curl http://localhost:13133/
```

### Check Collector Metrics

```bash
# Local
curl http://localhost:8888/metrics

# Kubernetes
kubectl port-forward -n lons svc/lons-otel-collector 8888:8888
curl http://localhost:8888/metrics | grep otel
```

### View Collector Logs

```bash
# Local
docker-compose logs otel-collector

# Kubernetes
kubectl logs -n lons deployment/lons-otel-collector -f
```

### Check Service Startup

```bash
# Look for tracing initialization message
docker-compose logs graphql-server | grep "\[Tracing\]"

# Should see:
# [Tracing] Initialized for graphql-server → http://otel-collector:4317 (development)
```

### Check Network Connectivity

```bash
# From service container to collector
docker-compose exec graphql-server sh
wget -v http://otel-collector:4317
# Should return connection refused (expected for gRPC)

# Or use nc
nc -zv otel-collector 4317
```

---

## Deployment Checklist

- [ ] All NestJS services updated with `initTracing()` in main.ts
- [ ] FastAPI services updated with `init_tracing()` in main.py
- [ ] Dependencies installed in all services
- [ ] Tests pass: `npm test` / `pytest`
- [ ] Build succeeds: `npm run build` / `python -m pytest`
- [ ] Docker images build successfully
- [ ] Local docker-compose testing successful (traces in Jaeger)
- [ ] Helm chart deploys successfully
- [ ] Kubernetes pods running: `kubectl get pods -l app.kubernetes.io/name=otel-collector`
- [ ] Collector health check passes: `curl http://collector:13133/`
- [ ] Test request produces trace in X-Ray
- [ ] Custom spans visible in trace details

---

## Rollback Plan

If issues arise, tracing can be disabled without code changes:

```bash
# Kubernetes: Disable collector
helm upgrade lons ./infrastructure/helm/lons \
  --set tracing.enabled=false

# Or local: Set env variable
export ENABLE_TRACING=false
docker-compose up
```

Services will start without tracing and continue to function normally.

---

## Support

Detailed documentation:
- **Setup**: `TRACING_SETUP.md`
- **Implementation**: `TRACING_IMPLEMENTATION_GUIDE.md`
- **Summary**: `TRACING_IMPLEMENTATION_SUMMARY.md`

For issues:
1. Check `TRACING_SETUP.md` > "Troubleshooting"
2. Check `TRACING_IMPLEMENTATION_GUIDE.md` > "Part 4: Troubleshooting"
3. Review collector logs: `kubectl logs deployment/lons-otel-collector`
4. Verify environment variables: `kubectl get configmap lons-config -o yaml`
