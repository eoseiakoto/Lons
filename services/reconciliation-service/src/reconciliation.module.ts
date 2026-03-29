import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [PrismaModule, EventBusModule, ObservabilityModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationServiceModule {}
