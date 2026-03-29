import { Module } from '@nestjs/common';

import { LoggerModule } from './logger.module';
import { MetricsModule } from './metrics.module';
import { TracingModule } from './tracing.module';
import { HealthController } from './health.controller';

@Module({
  imports: [LoggerModule, MetricsModule, TracingModule],
  controllers: [HealthController],
  exports: [LoggerModule, MetricsModule, TracingModule],
})
export class ObservabilityModule {}
