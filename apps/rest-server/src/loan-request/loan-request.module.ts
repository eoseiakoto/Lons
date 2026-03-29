import { Module } from '@nestjs/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { LoanRequestController } from './loan-request.controller';

@Module({
  imports: [ProcessEngineModule],
  controllers: [LoanRequestController],
})
export class LoanRequestModule {}
