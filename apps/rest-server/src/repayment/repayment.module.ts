import { Module } from '@nestjs/common';
import { RepaymentController } from './repayment.controller';

@Module({ controllers: [RepaymentController] })
export class RepaymentModule {}
