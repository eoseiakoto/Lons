# OpenTelemetry Distributed Tracing Setup

This document describes the distributed tracing infrastructure for the Lōns platform using OpenTelemetry (OTEL) and AWS X-Ray.

## Architecture

```
┌──────────────────────┐       ┌──────────────────────┐
│  NestJS Services     │       │  FastAPI Services    │
│ (GraphQL, REST, etc) │       │  (Scoring Service)   │
└──────────────┬───────┘       └──────────────┬───────┘
               │                              │
               └──────────────┬───────────────┘
                              │
                   OTLP gRPC (Port 4317)
                   OTLP HTTP (Port 4318)
                              │
                    ┌─────────▼──────────┐
                    │  OTEL Collector    │
                    │  (Kubernetes Pod)  │
                    └─────────┬──────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
            AWS X-Ray    Logging    Prometheus
              (OTLP)     (Console)   (Metrics)
```

## Components

### 1. OpenTelemetry Collector (Kubernetes)

**Location**: `infrastructure/helm/lons/templates/otel-collector/`

The OTEL Collector runs as a Kubernetes Deployment with:
- **Replicas**:
  - Development: 1
  - Staging: 1 (default)
  - Pre-production: 2
  - Production: 2
- **Ports**:
  - 4317: OTLP gRPC (primary receiver)
  - 4318: OTLP HTTP (fallback receiver)
  - 8888: Prometheus metrics
  - 13133: Health check
- **Processors**:
  - **Memory Limiter**: Protects against out-of-memory conditions
  - **Batch**: Batches spans for efficient export (5s timeout, 512 batch size)
  - **Attributes**: Adds environment, service namespace, and deployment metadata
- **Exporters**:
  - **AWS X-Ray**: Primary production exporter
  - **Logging**: Console logging for debug
  - **OTLP**: Local Jaeger/Tempo integration (if configured)

### 2. NestJS Tracing Package

**Location**: `packages/common/src/tracing/`

TypeScript module for NestJS services initialization:

#### Usage

In your service's `main.ts` (MUST be first import):

```typescript
import { initTracing } from '@lons/common/tracing';

initTracing({
  serviceName: 'graphql-server',
  serviceVersion: '1.0.0',
  environment: 'production',
  enabled: process.env.ENABLE_TRACING === 'true',
});

// Now import other modules
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

#### Auto-Instrumentation

The package automatically instruments:
- **HTTP**: Incoming/outgoing requests (excludes health checks)
- **Express**: Request/response handling
- **GraphQL**: Apollo Server queries and mutations
- **Redis**: BullMQ message queue operations
- **PostgreSQL**: Prisma ORM database queries
- **Node.js**: Built-in Node.js modules

#### Configuration

Via `TracingConfig` interface:

```typescript
interface TracingConfig {
  serviceName: string;          // Required: service name
  serviceVersion?: string;      // Optional: defaults to '1.0.0'
  environment?: string;         // Optional: defaults to NODE_ENV
  collectorUrl?: string;        // Optional: defaults to env var or localhost:4317
  enabled?: boolean;            // Optional: defaults to true if env var ENABLE_TRACING is not 'false'
}
```

### 3. FastAPI Tracing Module

**Location**: `services/scoring-service/app/tracing.py`

Python module for FastAPI services initialization:

#### Usage

In your FastAPI `main.py`:

```python
from fastapi import FastAPI
from app.tracing import init_tracing

app = FastAPI()

# Initialize tracing (MUST be before route definitions)
init_tracing(app=app, service_name="scoring-service", service_version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/score")
def score(data: dict):
    # Tracing is automatic here
    return {"score": calculate_score(data)}
```

#### Auto-Instrumentation

The module automatically instruments:
- **FastAPI**: Request/response handling
- **HTTP Clients**: `requests` and `httpx` libraries
- **Logging**: Python standard logging
- **SQLAlchemy**: Database operations (if installed)

#### Configuration

Environment variables:
- `ENABLE_TRACING`: Set to `"true"` to enable (default: `"false"`)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Collector endpoint (default: `http://localhost:4317`)
- `ENVIRONMENT`: Deployment environment (default: `development`)

## Helm Configuration

### Values Files

Tracing configuration is controlled via Helm values in each environment file:

#### Default (`values.yaml`)

```yaml
tracing:
  enabled: false
  collector:
    replicaCount: 1
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 512Mi
  aws:
    region: eu-west-1
  endpoint: "http://lons-otel-collector:4317"
  debug: false
```

#### Development (`values-dev.yaml`)

```yaml
tracing:
  enabled: true
  collector:
    replicaCount: 1
    resources:
      requests:
        cpu: 50m
        memory: 128Mi
      limits:
        cpu: 250m
        memory: 256Mi
  debug: true
```

#### Staging (`values-staging.yaml`)

```yaml
tracing:
  enabled: true
```

#### Pre-production (`values-preprod.yaml`)

```yaml
tracing:
  enabled: true
  collector:
    replicaCount: 2
```

#### Production (`values-production.yaml`)

```yaml
tracing:
  enabled: true
  collector:
    replicaCount: 2
    resources:
      requests:
        cpu: 250m
        memory: 512Mi
      limits:
        cpu: 1000m
        memory: 1Gi
```

### Environment Variables

The ConfigMap automatically injects:
- `ENABLE_TRACING`: Set to `"true"` when `tracing.enabled: true`
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Collector service URL

## Deployment

### Local Development (Docker Compose)

Add to `docker-compose.yml`:

```yaml
otel-collector:
  image: otel/opentelemetry-collector-contrib:0.96.0
  ports:
    - "4317:4317"  # OTLP gRPC
    - "4318:4318"  # OTLP HTTP
    - "8888:8888"  # Prometheus metrics
    - "13133:13133"  # Health check
  volumes:
    - ./infrastructure/docker/otel-collector-config.yaml:/etc/otel/config.yaml
  environment:
    - GOGC=80
```

### Kubernetes (EKS)

Deploy with Helm:

```bash
# Development
helm install lons ./infrastructure/helm/lons -f ./infrastructure/helm/lons/values-dev.yaml

# Staging
helm install lons ./infrastructure/helm/lons -f ./infrastructure/helm/lons/values-staging.yaml

# Production
helm install lons ./infrastructure/helm/lons -f ./infrastructure/helm/lons/values-production.yaml
```

The Helm chart will:
1. Create OTEL Collector Deployment with ConfigMap
2. Expose Collector service internally (ClusterIP)
3. Inject `OTEL_EXPORTER_OTLP_ENDPOINT` into all service ConfigMaps
4. Set `ENABLE_TRACING` environment variable based on `tracing.enabled`

## Span Attributes

All spans automatically include:

### Service metadata
- `service.name`: Service identifier (e.g., `graphql-server`)
- `service.version`: Service version (e.g., `1.0.0`)
- `service.namespace`: Always `lons`
- `deployment.environment`: Environment (dev/staging/preprod/production)

### Request metadata (HTTP)
- `http.method`: HTTP method (GET, POST, etc.)
- `http.url`: Request URL
- `http.status_code`: Response status code
- `http.client_ip`: Client IP address

### Database metadata (Prisma/PostgreSQL)
- `db.system`: `postgresql`
- `db.name`: Database name
- `db.statement`: SQL query (PII redacted)
- `db.operation`: Operation type (select, insert, etc.)

### Message queue metadata (BullMQ)
- `messaging.system`: `redis`
- `messaging.destination`: Queue name
- `messaging.operation`: Operation type

## Trace Sampling

For production deployments, configure sampling in the OTEL Collector ConfigMap:

```yaml
processors:
  tail_sampling:
    policies:
      - name: error_spans
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow_traces
        type: latency
        latency:
          threshold_ms: 1000
      - name: probabilistic
        type: probabilistic
        probabilistic:
          sampling_percentage: 10  # 10% sampling for non-error traces
```

## Debugging Traces

### View logs
```bash
kubectl logs -f deployment/lons-otel-collector -n default
```

### Check collector health
```bash
kubectl port-forward svc/lons-otel-collector 13133:13133
curl http://localhost:13133/
```

### Metrics endpoint
```bash
kubectl port-forward svc/lons-otel-collector 8888:8888
curl http://localhost:8888/metrics
```

## Integration with Monitoring

### Prometheus Metrics
The collector exposes Prometheus metrics on port 8888. Configure ServiceMonitor:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: lons-otel-collector
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: otel-collector
  endpoints:
    - port: metrics
      interval: 30s
```

### AWS X-Ray Integration
Spans are automatically exported to AWS X-Ray for visual tracing and performance analysis. Configure IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

## Best Practices

### 1. Always initialize tracing first
```typescript
// ✅ CORRECT: Before any other imports
import { initTracing } from '@lons/common/tracing';
initTracing({ serviceName: 'graphql-server', enabled: process.env.ENABLE_TRACING === 'true' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// ❌ INCORRECT: Other imports first
import { NestFactory } from '@nestjs/core';
import { initTracing } from '@lons/common/tracing';
```

### 2. Add custom spans for business logic
```typescript
import { get_tracer } from '@lons/common/tracing';

const tracer = get_tracer('scoring-engine');

async function calculateScore(data: any) {
  const span = tracer.startSpan('score_calculation');
  try {
    span.setAttribute('customer_id', data.customerId);
    span.setAttribute('data_points', data.metrics.length);

    const score = await runScoringLogic(data);

    span.setAttribute('score', score);
    span.setStatus({ code: SpanStatusCode.OK });
    return score;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

### 3. Exclude verbose endpoints
The collector automatically excludes from tracing:
- `/health`, `/health/ready`, `/health/live`
- `/metrics`
- `/-/healthy`, `/-/ready`

Add more exclusions in ConfigMap if needed.

### 4. Handle graceful shutdown
Both NestJS and FastAPI implementations include graceful shutdown handlers:
- Listen for `SIGTERM` and `SIGINT` signals
- Flush remaining spans before process exit
- Log shutdown events

## Troubleshooting

### Spans not appearing in X-Ray

**Check 1**: Verify tracing is enabled
```bash
kubectl get configmap lons-config -o yaml | grep ENABLE_TRACING
```

**Check 2**: Verify collector connectivity
```bash
kubectl logs deployment/lons-graphql-server | grep Tracing
```

**Check 3**: Check collector for errors
```bash
kubectl logs deployment/lons-otel-collector
```

### High memory usage in collector

Increase memory limit in values file:

```yaml
tracing:
  collector:
    resources:
      limits:
        memory: 1Gi  # Increase from default 512Mi
```

### Network connectivity issues

Ensure collector service is reachable:

```bash
kubectl run -it --image=busybox test -- sh
wget -O- http://lons-otel-collector:4317
```

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OTEL Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
- [OTEL Instrumentation Registry](https://opentelemetry.io/ecosystem/registry/)
- [AWS X-Ray Integration](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html)
