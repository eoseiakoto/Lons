const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 1000;

type SlimLogger = {
  warn: (msg: string, context?: unknown) => void;
};

/**
 * Metrics interface accepted by the slow-query middleware.
 * Matches the MetricsService.observePrismaQuery signature so callers can pass
 * MetricsService directly without adaptation.
 */
type SlimMetrics = {
  observePrismaQuery: (model: string, operation: string, duration: number) => void;
};

/**
 * Creates a Prisma `$use` middleware that:
 * - Measures query execution time.
 * - Logs a warning when execution exceeds the threshold
 *   (SLOW_QUERY_THRESHOLD_MS env var, default 1000 ms).
 * - Records the duration in the `prisma_query_duration_seconds` histogram
 *   when MetricsService is provided.
 *
 * Usage:
 *   prismaClient.$use(createSlowQueryMiddleware(logger, metricsService));
 */
export function createSlowQueryMiddleware(
  logger: SlimLogger,
  metrics?: SlimMetrics,
) {
  const threshold =
    parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '', 10) ||
    DEFAULT_SLOW_QUERY_THRESHOLD_MS;

  return async (params: any, next: (params: any) => Promise<any>): Promise<any> => {
    const model: string = params.model ?? 'unknown';
    const action: string = params.action ?? 'unknown';
    const start = Date.now();

    const result = await next(params);

    const durationMs = Date.now() - start;
    const durationSecs = durationMs / 1000;

    if (metrics) {
      metrics.observePrismaQuery(model, action, durationSecs);
    }

    if (durationMs > threshold) {
      logger.warn(`Slow Prisma query detected`, {
        model,
        operation: action,
        durationMs,
        thresholdMs: threshold,
      });
    }

    return result;
  };
}
