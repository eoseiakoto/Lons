import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsService {
  // HTTP metrics
  readonly httpRequestsTotal: promClient.Counter<string>;
  readonly httpRequestDuration: promClient.Histogram<string>;
  readonly httpRequestErrors: promClient.Counter<string>;

  // Business counters
  readonly loanApplicationsTotal: promClient.Counter<string>;
  readonly disbursementAmountTotal: promClient.Counter<string>;
  readonly repaymentAmountTotal: promClient.Counter<string>;

  // Prisma metrics
  readonly prismaQueryDuration: promClient.Histogram<string>;

  constructor() {
    // Collect default Node.js metrics (gc, cpu, memory, etc.)
    promClient.collectDefaultMetrics();

    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestErrors = new promClient.Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_code'],
    });

    this.loanApplicationsTotal = new promClient.Counter({
      name: 'loan_applications_total',
      help: 'Total number of loan applications submitted',
      labelNames: ['tenant_id', 'product_type'],
    });

    this.disbursementAmountTotal = new promClient.Counter({
      name: 'disbursement_amount_total',
      help: 'Total disbursed amount (in minor currency units)',
      labelNames: ['tenant_id', 'currency'],
    });

    this.repaymentAmountTotal = new promClient.Counter({
      name: 'repayment_amount_total',
      help: 'Total repayment amount received (in minor currency units)',
      labelNames: ['tenant_id', 'currency'],
    });

    this.prismaQueryDuration = new promClient.Histogram({
      name: 'prisma_query_duration_seconds',
      help: 'Duration of Prisma database queries in seconds',
      labelNames: ['model', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    });
  }

  // ─── Named convenience helpers ───────────────────────────────────────────────

  /**
   * Increment http_requests_total for the given method/route/statusCode.
   */
  incrementHttpRequests(method: string, route: string, statusCode: number | string): void {
    this.httpRequestsTotal
      .labels({ method, route, status: String(statusCode) })
      .inc();
  }

  /**
   * Observe a request duration (in seconds) for the given method/route.
   */
  observeHttpDuration(method: string, route: string, duration: number): void {
    this.httpRequestDuration.labels({ method, route }).observe(duration);
  }

  /**
   * Observe a Prisma query duration (in seconds) for the given model/operation.
   */
  observePrismaQuery(model: string, operation: string, duration: number): void {
    this.prismaQueryDuration.labels({ model, operation }).observe(duration);
  }

  // ─── Generic helpers (used by slow-query middleware via name) ────────────────

  /**
   * Increment a named counter metric with the given labels.
   */
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const metric = this.getMetricByName(name);
    if (metric instanceof promClient.Counter) {
      metric.labels(labels).inc();
    }
  }

  /**
   * Observe a value for a named histogram metric with the given labels.
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    const metric = this.getMetricByName(name);
    if (metric instanceof promClient.Histogram) {
      metric.labels(labels).observe(value);
    }
  }

  /** Expose the prom-client registry for the /metrics endpoint. */
  getRegistry(): promClient.Registry {
    return promClient.register;
  }

  private getMetricByName(
    name: string,
  ): promClient.Counter<string> | promClient.Histogram<string> | undefined {
    const map: Record<string, promClient.Counter<string> | promClient.Histogram<string>> = {
      http_requests_total: this.httpRequestsTotal,
      http_request_duration_seconds: this.httpRequestDuration,
      http_request_errors_total: this.httpRequestErrors,
      loan_applications_total: this.loanApplicationsTotal,
      disbursement_amount_total: this.disbursementAmountTotal,
      repayment_amount_total: this.repaymentAmountTotal,
      prisma_query_duration_seconds: this.prismaQueryDuration,
    };
    return map[name];
  }
}
