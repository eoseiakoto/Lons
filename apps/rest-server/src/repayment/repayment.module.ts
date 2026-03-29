import { Module } from '@nestjs/common';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { RepaymentController } from './repayment.controller';

@Module({
  imports: [RepaymentServiceModule],
  controllers: [RepaymentController],
})
export class RepaymentModule {}
