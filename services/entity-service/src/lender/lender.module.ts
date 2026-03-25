import { Module } from '@nestjs/common';

import { LenderService } from './lender.service';

@Module({
  providers: [LenderService],
  exports: [LenderService],
})
export class LenderModule {}
