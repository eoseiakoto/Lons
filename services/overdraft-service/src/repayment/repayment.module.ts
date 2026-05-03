import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { CreditLineCacheModule } from '../cache/credit-line-cache.module';
import { RepaymentService } from './repayment.service';

@Module({
  imports: [PrismaModule, EventBusModule, CreditLineCacheModule],
  providers: [RepaymentService],
  exports: [RepaymentService],
})
export class OverdraftRepaymentModule {}
