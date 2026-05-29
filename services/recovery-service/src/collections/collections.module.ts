import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { CollectionsStateMachine } from './collections-state-machine';
import { CollectionsCaseService } from './collections-case.service';
import { CollectionsAutoCreateListener } from './collections-auto-create.listener';

/**
 * S19-5..9 — collections workflow module. Bundles the state machine,
 * case CRUD service, and event listeners. Imported by:
 *   - apps/graphql-server (resolvers)
 *   - apps/scheduler (BrokenPtpJob, future auto-escalation job)
 *
 * The listener is registered in providers so NestJS's
 * @nestjs/event-emitter discovers its @OnEvent handlers at boot.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    CollectionsStateMachine,
    CollectionsCaseService,
    CollectionsAutoCreateListener,
  ],
  exports: [CollectionsStateMachine, CollectionsCaseService],
})
export class CollectionsModule {}
