import { Module } from '@nestjs/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { ContractController } from './contract.controller';

@Module({
  imports: [ProcessEngineModule, RepaymentServiceModule],
  controllers: [ContractController],
})
export class ContractModule {}
