import { Module } from '@nestjs/common';
import { LoanRequestController } from './loan-request.controller';

@Module({ controllers: [LoanRequestController] })
export class LoanRequestModule {}
