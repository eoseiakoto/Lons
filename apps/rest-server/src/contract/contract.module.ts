import { Module } from '@nestjs/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { EntityServiceModule } from '@lons/entity-service';
import { ContractController } from './contract.controller';

@Module({
  imports: [ProcessEngineModule, RepaymentServiceModule, EntityServiceModule],
  controllers: [ContractController],
})
export class ContractModule {}
