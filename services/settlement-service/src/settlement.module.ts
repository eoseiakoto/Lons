import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { SettlementService } from './settlement.service';

@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementServiceModule {}
