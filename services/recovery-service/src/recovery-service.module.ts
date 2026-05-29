import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { ObservabilityModule } from '@lons/common';

import { RecoveryStrategyService } from './recovery-strategy.service';
import { CollectionsModule } from './collections/collections.module';
import { WriteOffModule } from './write-off/write-off.module';

@Module({
  imports: [PrismaModule, ObservabilityModule, CollectionsModule, WriteOffModule],
  providers: [RecoveryStrategyService],
  exports: [RecoveryStrategyService, CollectionsModule, WriteOffModule],
})
export class RecoveryServiceModule {}
