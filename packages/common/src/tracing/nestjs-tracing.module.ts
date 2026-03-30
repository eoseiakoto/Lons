/**
 * NestJS Global Module for Tracing Configuration
 *
 * This module provides tracing configuration as a provider that can be
 * injected into services that need to access tracing settings.
 *
 * Usage in app.module.ts:
 * ```
 * import { TracingModule } from '@lons/common/tracing';
 *
 * @Module({
 *   imports: [
 *     TracingModule.forRoot({
 *       serviceName: 'graphql-server',
 *       enabled: process.env.ENABLE_TRACING === 'true',
 *     }),
 *     // ... other modules
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * Then inject in services:
 * ```
 * constructor(@Inject('TRACING_CONFIG') private tracingConfig: TracingConfig) {}
 * ```
 */

import { Module, Global, DynamicModule, Inject, Optional } from '@nestjs/common';
import { TracingConfig } from './index';

@Global()
@Module({})
export class TracingModule {
  /**
   * Register global tracing configuration.
   *
   * @param config Tracing configuration (serviceName, enabled, etc.)
   * @returns DynamicModule that provides TRACING_CONFIG
   */
  static forRoot(config: TracingConfig): DynamicModule {
    return {
      module: TracingModule,
      providers: [
        {
          provide: 'TRACING_CONFIG',
          useValue: config,
        },
      ],
      exports: ['TRACING_CONFIG'],
    };
  }
}
