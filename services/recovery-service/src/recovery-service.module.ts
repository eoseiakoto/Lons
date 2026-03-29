import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { ObservabilityModule } from '@lons/common';

import { RecoveryStrategyService } from './recovery-strategy.service';

@Module({
  imports: [PrismaModule, ObservabilityModule],
  providers: [RecoveryStrategyService],
  exports: [RecoveryStrategyService],
})
export class RecoveryServiceModule {}
