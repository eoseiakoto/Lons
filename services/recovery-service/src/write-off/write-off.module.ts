import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { WriteOffService } from './write-off.service';
import { CollectionsModule } from '../collections/collections.module';

/**
 * S19-8 — write-off approval workflow. Depends on CollectionsModule
 * for the state machine (transitions case → write_off_pending /
 * written_off / escalated).
 */
@Module({
  imports: [PrismaModule, EventBusModule, CollectionsModule],
  providers: [WriteOffService],
  exports: [WriteOffService],
})
export class WriteOffModule {}
