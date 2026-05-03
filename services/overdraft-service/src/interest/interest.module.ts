import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { CreditLineCacheModule } from '../cache/credit-line-cache.module';
import { InterestService } from './interest.service';

@Module({
  imports: [PrismaModule, EventBusModule, CreditLineCacheModule],
  providers: [InterestService],
  exports: [InterestService],
})
export class InterestModule {}
