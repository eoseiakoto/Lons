import { Module } from '@nestjs/common';

import { PaymentService } from './payment.service';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  // Sprint 16 (S16-7): PaymentService now triggers schedule recalc on
  // early/advance payments. ScheduleModule exports the recalc service.
  imports: [ScheduleModule],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
