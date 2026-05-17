import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { PipelineStepLoggerModule } from './pipeline-step-logger.module';
import { PipelineRetryService } from './pipeline-retry.service';
import { PipelineRetryWorker } from './pipeline-retry.worker';
import { PIPELINE_RETRY_QUEUE } from './pipeline-step-registry';

/**
 * Sprint 18 — S18-12. Wires the BullMQ `pipeline-step-retry` queue +
 * worker + retry service. The composition root (graphql-server,
 * rest-server) must register `BullModule.forRoot(...)` once for Redis
 * connection details — this module only registers the queue.
 *
 * The worker depends on the originating pipeline services
 * (ScoringService, ApprovalService, etc.) via @Optional() injection.
 * In the production composition root those modules are imported
 * alongside this one through `ProcessEngineModule`.
 */
@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    PipelineStepLoggerModule,
    BullModule.registerQueue({ name: PIPELINE_RETRY_QUEUE }),
  ],
  providers: [PipelineRetryService, PipelineRetryWorker],
  exports: [PipelineRetryService, PipelineStepLoggerModule],
})
export class PipelineRetryModule {}
