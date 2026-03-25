import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';

import { InterestAccrualJob } from './jobs/interest-accrual.job';
import { AgingJob } from './jobs/aging.job';
import { ReconciliationJob } from './jobs/reconciliation.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EventBusModule,
    ProcessEngineModule,
    SettlementServiceModule,
    ReconciliationServiceModule,
  ],
  providers: [InterestAccrualJob, AgingJob, ReconciliationJob],
})
export class SchedulerModule {}
