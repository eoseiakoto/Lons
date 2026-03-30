"""
OpenTelemetry distributed tracing initialization for the scoring service (FastAPI).

This module provides centralized tracing setup for the scoring service with:
- OTLP gRPC/HTTP export to OpenTelemetry Collector
- Auto-instrumentation for FastAPI, requests, logging
- Metric export (30s interval)
- Graceful error handling if collector is unavailable

Usage:
    from app.tracing import init_tracing
    from fastapi import FastAPI

    app = FastAPI()
    init_tracing(app=app, service_name="scoring-service")

    # Now use the app normally
    @app.get("/health")
    def health():
        return {"status": "ok"}
"""

import os
from typing import Optional
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.api.metrics import get_meter_provider


def init_tracing(
    app: Optional[FastAPI] = None,
    service_name: str = "scoring-service",
    service_version: str = "1.0.0",
) -> bool:
    """
    Initialize OpenTelemetry tracing for FastAPI application.

    Features:
    - OTLP gRPC export to OpenTelemetry Collector
    - Automatic instrumentation of FastAPI, HTTP requests, logging
    - Metric export at 30-second intervals
    - Graceful degradation if collector unavailable
    - Health check endpoints excluded from tracing

    Args:
        app: FastAPI application instance (optional, for auto-instrumentation)
        service_name: Name of the service for trace identification
        service_version: Version of the service

    Returns:
        bool: True if tracing successfully initialized, False if disabled or error
    """
    enabled = os.getenv("ENABLE_TRACING", "false").lower() == "true"
    if not enabled:
        print(f"[Tracing] Disabled for {service_name}")
        return False

    try:
        collector_url = os.getenv(
            "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"
        )
        environment = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development"))

        # Create resource with service metadata
        resource = Resource.create(
            {
                SERVICE_NAME: service_name,
                SERVICE_VERSION: service_version,
                "deployment.environment": environment,
                "service.namespace": "lons",
            }
        )

        # Configure trace exporter (OTLP gRPC)
        trace_exporter = OTLPSpanExporter(endpoint=collector_url, insecure=True)
        trace_provider = TracerProvider(resource=resource)
        trace_provider.add_span_processor(
            BatchSpanProcessor(
                trace_exporter,
                max_queue_size=1024,
                max_export_batch_size=512,
                schedule_delay_millis=5000,
            )
        )
        trace.set_tracer_provider(trace_provider)

        # Configure metric exporter (OTLP gRPC)
        metric_exporter = OTLPMetricExporter(endpoint=collector_url, insecure=True)
        metric_reader = PeriodicExportingMetricReader(
            metric_exporter, interval_millis=30000
        )
        metric_provider = MeterProvider(
            resource=resource, metric_readers=[metric_reader]
        )
        # Note: Use the standard API if available in newer versions
        try:
            from opentelemetry.api.metrics import set_meter_provider
            set_meter_provider(metric_provider)
        except ImportError:
            pass

        # Auto-instrument FastAPI app if provided
        if app:
            FastAPIInstrumentor.instrument_app(
                app,
                excluded_urls="health,health/ready,health/live,metrics",
            )

        # Auto-instrument HTTP clients and logging
        RequestsInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
        LoggingInstrumentor().instrument(set_logging_format=True)

        # Attempt to instrument SQLAlchemy if present
        try:
            SQLAlchemyInstrumentor().instrument()
        except Exception:
            # SQLAlchemy may not be installed; gracefully continue
            pass

        print(
            f"[Tracing] Initialized for {service_name} v{service_version} "
            f"→ {collector_url} ({environment})"
        )
        return True

    except Exception as e:
        print(f"[Tracing] Failed to initialize: {e}")
        print(
            "[Tracing] Continuing without tracing. Check OTEL_EXPORTER_OTLP_ENDPOINT."
        )
        return False


def get_tracer(name: str = "app") -> trace.Tracer:
    """
    Get a tracer instance for manual span creation.

    Args:
        name: Module/component name for tracer identification

    Returns:
        Tracer instance

    Example:
        tracer = get_tracer("scoring-engine")
        with tracer.start_as_current_span("score_calculation") as span:
            span.set_attribute("customer_id", customer_id)
            # ... scoring logic
    """
    return trace.get_tracer(name)
