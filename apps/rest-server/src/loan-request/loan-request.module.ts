import { Module } from '@nestjs/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { EntityServiceModule } from '@lons/entity-service';
import { LoanRequestController } from './loan-request.controller';

@Module({
  imports: [ProcessEngineModule, EntityServiceModule],
  controllers: [LoanRequestController],
})
export class LoanRequestModule {}
