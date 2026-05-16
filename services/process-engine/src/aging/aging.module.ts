import { Module } from '@nestjs/common';

import { AgingService } from './aging.service';
import { AgingActionService } from './aging-action.service';

@Module({
  // Sprint 16 (S16-11 + S16-12) — bucket configs loaded from DB at
  // run-time, action matrix dispatched via AgingActionService.
  providers: [AgingService, AgingActionService],
  exports: [AgingService, AgingActionService],
})
export class AgingModule {}
