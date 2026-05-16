import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { ScheduleModule } from './schedule/schedule.module';
import { PaymentModule } from './payment/payment.module';
import { EarlySettlementModule } from './early-settlement/early-settlement.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
    ScheduleModule,
    PaymentModule,
    // Sprint 16 (S16-9) — read-only early settlement quote generator.
    EarlySettlementModule,
  ],
  exports: [ScheduleModule, PaymentModule, EarlySettlementModule],
})
export class RepaymentServiceModule {}
