import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { SettlementService } from './settlement.service';

@Module({
  imports: [PrismaModule, EventBusModule, ObservabilityModule],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementServiceModule {}
