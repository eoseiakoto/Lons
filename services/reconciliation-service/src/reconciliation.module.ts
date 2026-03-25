import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationServiceModule {}
