/**
 * OpenTelemetry distributed tracing initialization for NestJS services.
 *
 * Usage:
 * 1. Import and call initTracing() BEFORE any other imports in main.ts
 * 2. Pass configuration with service name and enable flag
 *
 * Example:
 * ```
 * import { initTracing } from '@lons/common/tracing';
 *
 * initTracing({
 *   serviceName: 'graphql-server',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 *   enabled: process.env.ENABLE_TRACING === 'true',
 * });
 *
 * // Now import other modules...
 * import { NestFactory } from '@nestjs/core';
 * ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PrismaInstrumentation } from '@prisma/instrumentation';

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  collectorUrl?: string;
  enabled?: boolean;
}

/**
 * Initialize OpenTelemetry SDK for NestJS services.
 *
 * @param config Tracing configuration
 * @returns NodeSDK instance or null if disabled
 *
 * Features:
 * - Automatic instrumentation for HTTP, Express, GraphQL, Redis, PostgreSQL
 * - Prisma ORM instrumentation
 * - Batch span processing with configurable batch size
 * - Metric export (30s interval)
 * - Graceful shutdown handling
 * - Ignores health check endpoints
 */
export function initTracing(config: TracingConfig): NodeSDK | null {
  if (config.enabled === false) {
    console.log(`[Tracing] Disabled for ${config.serviceName}`);
    return null;
  }

  const collectorUrl =
    config.collectorUrl ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4317';
  const environment = config.environment || process.env.NODE_ENV || 'development';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.namespace': 'lons',
  });

  const traceExporter = new OTLPTraceExporter({
    url: collectorUrl,
  });

  const metricExporter = new OTLPMetricExporter({
    url: collectorUrl,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 1024,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
      }),
    ],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      intervalMillis: 30000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingPaths: [
            '/health',
            '/health/ready',
            '/health/live',
            '/metrics',
            '/-/healthy',
            '/-/ready',
          ],
          ignoreOutgoingUrls: [
            /localhost:4317/,
            /localhost:4318/,
            /localhost:8888/,
          ],
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-graphql': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-redis-4': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
  console.log(
    `[Tracing] Initialized for ${config.serviceName} → ${collectorUrl} (${environment})`
  );

  // Graceful shutdown
  const shutdownHandler = () => {
    sdk
      .shutdown()
      .then(() => console.log('[Tracing] Shut down successfully'))
      .catch((err) => console.error('[Tracing] Shutdown error', err))
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  return sdk;
}

export { NodeSDK };
