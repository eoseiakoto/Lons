# OpenTelemetry Tracing Implementation Guide

This guide provides step-by-step instructions for integrating distributed tracing into each service in the Lōns platform.

## Prerequisites

- OpenTelemetry Helm chart deployed (see `TRACING_SETUP.md`)
- Service running on Kubernetes or Docker Compose
- Environment variables configured per environment

## Part 1: NestJS Services

This applies to:
- `graphql-server`
- `rest-server`
- `scheduler`
- `notification-worker`

### Step 1: Install Dependencies

```bash
cd apps/graphql-server  # or rest-server, scheduler, etc.

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

### Step 2: Update main.ts

Make the tracing initialization the **very first** import before everything else:

```typescript
// main.ts

import { initTracing } from '@lons/common/tracing';

// MUST be called before any other imports/code
initTracing({
  serviceName: 'graphql-server',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV,
  enabled: process.env.ENABLE_TRACING === 'true',
});

// Now safe to import the rest
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);

  logger.log(`Server running on port ${PORT}`);
}

bootstrap().catch((error) => {
  logger.error('Bootstrap failed:', error);
  process.exit(1);
});
```

### Step 3: Register TracingModule in AppModule

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TracingModule } from '@lons/common/tracing';
import { GraphQLModule } from '@nestjs/graphql';
// ... other imports

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Register tracing module with config
    TracingModule.forRoot({
      serviceName: 'graphql-server',
      enabled: process.env.ENABLE_TRACING === 'true',
    }),

    GraphQLModule.forRoot({
      autoSchemaFile: 'schema.gql',
      // ... other config
    }),

    // ... other modules
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

### Step 4: Add Custom Spans to Business Logic

For critical operations, add manual span creation:

```typescript
// src/services/loan-request.service.ts

import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class LoanRequestService {
  private tracer = trace.getTracer('loan-request-service');

  async createLoanRequest(request: CreateLoanRequestDto) {
    const span = this.tracer.startSpan('create_loan_request');

    try {
      // Add attributes to span
      span.setAttribute('customer_id', request.customerId);
      span.setAttribute('product_type', request.productType);
      span.setAttribute('amount_requested', request.amount);

      // Perform operation
      const loanRequest = await this.prisma.loanRequest.create({
        data: {
          customerId: request.customerId,
          productType: request.productType,
          amount: new Decimal(request.amount),
          status: 'PENDING',
        },
      });

      span.setAttribute('loan_request_id', loanRequest.id);
      span.setStatus({ code: SpanStatusCode.OK });

      return loanRequest;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async calculateScore(data: any) {
    const span = this.tracer.startSpan('calculate_credit_score');
    const ctx = trace.setSpan(trace.context.active(), span);

    try {
      return await trace.context.with(ctx, async () => {
        span.setAttribute('data_points_count', Object.keys(data).length);

        const score = await this.scoringService.calculateScore(data);

        span.setAttribute('score', score);
        span.setStatus({ code: SpanStatusCode.OK });

        return score;
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }
}
```

### Step 5: Test Locally (Docker Compose)

Add to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # ... existing services

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    command: ["--config=/etc/otel/config.yaml"]
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
      - "8888:8888"  # Prometheus metrics
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
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411

  graphql-server:
    build:
      context: .
      dockerfile: apps/graphql-server/Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      ENABLE_TRACING: "true"
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
      # ... other env vars
    depends_on:
      - otel-collector
      - postgres
      - redis
```

Then run:

```bash
docker-compose up -d
# Navigate to http://localhost:16686 to view traces in Jaeger UI
```

## Part 2: FastAPI Services

This applies to:
- `scoring-service`

### Step 1: Install Dependencies

```bash
cd services/scoring-service

pip install \
  opentelemetry-api \
  opentelemetry-sdk \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-requests \
  opentelemetry-instrumentation-logging \
  opentelemetry-instrumentation-sqlalchemy \
  opentelemetry-instrumentation-httpx
```

Or update `requirements.txt`:

```txt
# OpenTelemetry
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

### Step 2: Update main.py

Initialize tracing before defining routes:

```python
# app/main.py

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from app.tracing import init_tracing
import logging

# Initialize tracing FIRST (before creating app)
init_tracing(
    service_name="scoring-service",
    service_version="1.0.0"
)

# Now create and configure app
app = FastAPI(title="Scoring Service")

# Configure logging after tracing init
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize tracing for FastAPI app
init_tracing(
    app=app,
    service_name="scoring-service",
    service_version="1.0.0"
)

# Define routes
@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}

@app.post("/score")
def calculate_score(request: dict):
    """Calculate credit score."""
    try:
        logger.info(f"Calculating score for {request.get('customer_id')}")
        score = run_scoring_logic(request)
        return {"score": score}
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        raise HTTPException(status_code=500, detail="Scoring failed")

@app.on_event("startup")
async def startup():
    logger.info("Scoring service started")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Scoring service shutting down")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Step 3: Add Custom Spans

```python
# app/scoring_engine.py

from opentelemetry import trace
from opentelemetry.trace import SpanKind, Status, StatusCode

tracer = trace.get_tracer(__name__)

def calculate_credit_score(customer_data: dict) -> float:
    """Calculate credit score with tracing."""
    with tracer.start_as_current_span(
        "credit_score_calculation",
        kind=SpanKind.INTERNAL
    ) as span:
        try:
            span.set_attribute("customer_id", customer_data.get("id"))
            span.set_attribute("data_points", len(customer_data))

            # Span 1: Data validation
            with tracer.start_as_current_span("validate_data") as validation_span:
                if not validate_customer_data(customer_data):
                    validation_span.set_status(Status(StatusCode.ERROR))
                    raise ValueError("Invalid customer data")
                validation_span.set_status(Status(StatusCode.OK))

            # Span 2: Feature engineering
            with tracer.start_as_current_span("feature_engineering") as fe_span:
                features = extract_features(customer_data)
                fe_span.set_attribute("feature_count", len(features))

            # Span 3: Model inference
            with tracer.start_as_current_span("model_inference") as model_span:
                score = ml_model.predict(features)
                model_span.set_attribute("score", score)

            # Span 4: Post-processing
            with tracer.start_as_current_span("post_processing") as pp_span:
                final_score = apply_business_rules(score)
                pp_span.set_attribute("final_score", final_score)

            span.set_attribute("result", final_score)
            span.set_status(Status(StatusCode.OK))
            return final_score

        except Exception as e:
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise
```

### Step 4: Environment Configuration

Create `.env` for local development:

```bash
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
ENVIRONMENT=development
SERVICE_VERSION=1.0.0
```

### Step 5: Test Locally

```bash
# Assuming docker-compose is running
cd services/scoring-service
pip install -r requirements.txt
python -m app.main

# In another terminal
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "cust_123", "income": 50000}'

# View traces at http://localhost:16686
```

## Part 3: Verify Integration

### Health Checks

```bash
# Check OTEL Collector health
kubectl port-forward svc/lons-otel-collector 13133:13133
curl http://localhost:13133/

# Should return HTTP 200
```

### Log Verification

Check service logs for tracing initialization:

```bash
kubectl logs deployment/lons-graphql-server | grep Tracing
# Expected output:
# [Tracing] Initialized for graphql-server → http://lons-otel-collector:4317 (production)

kubectl logs deployment/lons-scoring-service | grep Tracing
# Expected output:
# [Tracing] Initialized for scoring-service v1.0.0 → http://lons-otel-collector:4317 (production)
```

### Verify in X-Ray Console

1. Go to AWS X-Ray Console
2. Check Service Map to see all connected services
3. Click on individual services to view traces
4. Check trace details for custom attributes

## Part 4: Troubleshooting

### Issue: Spans not appearing

**Check 1**: Verify environment variables
```bash
kubectl exec deployment/lons-graphql-server -- env | grep OTEL
# Should see:
# ENABLE_TRACING=true
# OTEL_EXPORTER_OTLP_ENDPOINT=http://lons-otel-collector:4317
```

**Check 2**: Verify collector is running
```bash
kubectl get pods -l app.kubernetes.io/name=otel-collector
# Should see 1-2 pods running depending on environment
```

**Check 3**: Check collector logs
```bash
kubectl logs deployment/lons-otel-collector | tail -50
```

**Check 4**: Verify network connectivity
```bash
kubectl run -it --image=busybox test -- sh
wget -v http://lons-otel-collector:4317
```

### Issue: High memory usage

Increase memory limit:

```bash
# Edit values file
tracing:
  collector:
    resources:
      limits:
        memory: 1Gi
```

### Issue: Missing instrumentation

Verify instrumentation packages are imported early in startup:

```typescript
// ✅ CORRECT: At very top of main.ts
import { initTracing } from '@lons/common/tracing';
initTracing({ ... });

// ❌ INCORRECT: After other imports
import { NestFactory } from '@nestjs/core';
import { initTracing } from '@lons/common/tracing';
```

## Deployment Checklist

- [ ] All NestJS services updated with tracing initialization
- [ ] Scoring service updated with tracing initialization
- [ ] Custom spans added to critical business logic paths
- [ ] Dependencies installed in package.json/requirements.txt
- [ ] main.ts and main.py updated before app startup
- [ ] Environment variables configured in all values files
- [ ] Helm chart deployed with tracing enabled
- [ ] Logs verified showing tracing initialization
- [ ] Jaeger/X-Ray console shows traces
- [ ] Custom attributes visible in trace details
- [ ] Health checks passing

## Next Steps

1. **Advanced Sampling**: Implement tail-based sampling for high-volume services
2. **Metrics**: Enable Prometheus metrics export for custom business metrics
3. **Alerts**: Set up alerts for slow traces or error rate spikes
4. **Dashboards**: Create Grafana dashboards from exported metrics
5. **Analysis**: Use trace data for performance optimization

See `TRACING_SETUP.md` for more details on advanced topics.
