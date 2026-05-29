import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { ObservabilityModule } from '@lons/common';

import { RecoveryStrategyService } from './recovery-strategy.service';
import { CollectionsModule } from './collections/collections.module';

@Module({
  imports: [PrismaModule, ObservabilityModule, CollectionsModule],
  providers: [RecoveryStrategyService],
  exports: [RecoveryStrategyService, CollectionsModule],
})
export class RecoveryServiceModule {}
