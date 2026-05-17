import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { PipelineStepLoggerService } from './pipeline-step-logger.service';

/**
 * Sprint 18 — S18-7. Standalone module so other services (and Track A's
 * GraphQL resolvers) can import just the logger without pulling in the
 * full retry / orchestration stack.
 */
@Module({
  imports: [PrismaModule],
  providers: [PipelineStepLoggerService],
  exports: [PipelineStepLoggerService],
})
export class PipelineStepLoggerModule {}
