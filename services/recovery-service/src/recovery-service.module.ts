import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { RecoveryStrategyService } from './recovery-strategy.service';

@Module({
  imports: [PrismaModule],
  providers: [RecoveryStrategyService],
  exports: [RecoveryStrategyService],
})
export class RecoveryServiceModule {}
