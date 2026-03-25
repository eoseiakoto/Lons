import { Module } from '@nestjs/common';

import { InterestAccrualService } from './interest-accrual.service';

@Module({
  providers: [InterestAccrualService],
  exports: [InterestAccrualService],
})
export class InterestAccrualModule {}
