import { Module } from '@nestjs/common';

import { ScheduleService } from './schedule.service';
import { ScheduleRecalculationService } from './schedule-recalculation.service';

@Module({
  providers: [ScheduleService, ScheduleRecalculationService],
  exports: [ScheduleService, ScheduleRecalculationService],
})
export class ScheduleModule {}
