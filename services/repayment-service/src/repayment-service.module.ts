import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { ScheduleModule } from './schedule/schedule.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [PrismaModule, EventBusModule, ObservabilityModule, ScheduleModule, PaymentModule],
  exports: [ScheduleModule, PaymentModule],
})
export class RepaymentServiceModule {}
