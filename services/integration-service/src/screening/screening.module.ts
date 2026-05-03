import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { MockScreeningAdapter } from './mock-screening.adapter';
import { ComplyAdvantageAdapter } from './complyadvantage.adapter';
import { ScreeningAdapterResolver } from './screening-adapter.resolver';
import { ScreeningService } from './screening.service';

@Module({
  imports: [PrismaModule, EventBusModule, ConfigModule],
  providers: [
    MockScreeningAdapter,
    {
      provide: ComplyAdvantageAdapter,
      useFactory: (configService: ConfigService) => new ComplyAdvantageAdapter(configService),
      inject: [ConfigService],
    },
    ScreeningAdapterResolver,
    ScreeningService,
  ],
  exports: [ScreeningService, ScreeningAdapterResolver],
})
export class ScreeningModule {}
