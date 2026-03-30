import { Module } from '@nestjs/common';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { EntityServiceModule } from '@lons/entity-service';
import { RepaymentController } from './repayment.controller';

@Module({
  imports: [RepaymentServiceModule, EntityServiceModule],
  controllers: [RepaymentController],
})
export class RepaymentModule {}
