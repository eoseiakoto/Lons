import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { CreditLineModule } from '../credit-line/credit-line.module';

import { OverdraftAgingService } from './overdraft-aging.service';

@Module({
  imports: [PrismaModule, EventBusModule, CreditLineModule],
  providers: [OverdraftAgingService],
  exports: [OverdraftAgingService],
})
export class OverdraftAgingModule {}
