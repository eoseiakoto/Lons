import { Injectable, LoggerService as NestLoggerService, Optional } from '@nestjs/common';
import * as winston from 'winston';

import { maskPII } from '../masking/pii-masker';
import { getCorrelationId, getTenantId } from './correlation-id.context';

export const LOGGER_SERVICE_NAME = 'LOGGER_SERVICE_NAME';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly winston: winston.Logger;

  constructor(@Optional() private readonly serviceName: string = 'lons') {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [new winston.transports.Console()],
    });
  }

  private buildMeta(context?: string): Record<string, unknown> {
    return {
      service: this.serviceName,
      correlationId: getCorrelationId(),
      tenantId: getTenantId(),
      context,
    };
  }

  private safeMask(data: unknown): unknown {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return maskPII(data as Record<string, unknown>);
    }
    return data;
  }

  log(message: string, context?: string): void;
  log(message: string, data?: unknown, context?: string): void;
  log(message: string, dataOrContext?: unknown, context?: string): void {
    const [data, ctx] = this.resolveArgs(dataOrContext, context);
    this.winston.info(message, { ...this.buildMeta(ctx), data: this.safeMask(data) });
  }

  error(message: string, trace?: string, context?: string): void;
  error(message: string, data?: unknown, trace?: string, context?: string): void;
  error(message: string, traceOrData?: unknown, traceOrContext?: string, context?: string): void {
    // Support both (msg, trace?, ctx?) and (msg, data?, trace?, ctx?)
    if (typeof traceOrData === 'string' || traceOrData === undefined) {
      this.winston.error(message, {
        ...this.buildMeta(traceOrContext),
        trace: traceOrData,
      });
    } else {
      this.winston.error(message, {
        ...this.buildMeta(context),
        data: this.safeMask(traceOrData),
        trace: traceOrContext,
      });
    }
  }

  warn(message: string, context?: string): void;
  warn(message: string, data?: unknown, context?: string): void;
  warn(message: string, dataOrContext?: unknown, context?: string): void {
    const [data, ctx] = this.resolveArgs(dataOrContext, context);
    this.winston.warn(message, { ...this.buildMeta(ctx), data: this.safeMask(data) });
  }

  debug(message: string, context?: string): void;
  debug(message: string, data?: unknown, context?: string): void;
  debug(message: string, dataOrContext?: unknown, context?: string): void {
    const [data, ctx] = this.resolveArgs(dataOrContext, context);
    this.winston.debug(message, { ...this.buildMeta(ctx), data: this.safeMask(data) });
  }

  verbose(message: string, context?: string): void;
  verbose(message: string, data?: unknown, context?: string): void;
  verbose(message: string, dataOrContext?: unknown, context?: string): void {
    const [data, ctx] = this.resolveArgs(dataOrContext, context);
    this.winston.verbose(message, { ...this.buildMeta(ctx), data: this.safeMask(data) });
  }

  /**
   * Determine whether the second argument is context string or data payload.
   * If second arg is a string and third is undefined, treat second as context.
   */
  private resolveArgs(
    dataOrContext: unknown,
    context: string | undefined,
  ): [unknown, string | undefined] {
    if (typeof dataOrContext === 'string' && context === undefined) {
      return [undefined, dataOrContext];
    }
    return [dataOrContext, context];
  }
}
