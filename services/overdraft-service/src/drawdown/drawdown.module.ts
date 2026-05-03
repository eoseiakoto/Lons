import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { CreditLineCacheModule } from '../cache/credit-line-cache.module';
import { DrawdownService } from './drawdown.service';

@Module({
  imports: [PrismaModule, EventBusModule, CreditLineCacheModule],
  providers: [DrawdownService],
  exports: [DrawdownService],
})
export class DrawdownModule {}
