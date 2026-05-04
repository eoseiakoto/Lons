import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { OverdraftAgingModule } from '@lons/overdraft-service';

import { InterestAccrualJob } from './jobs/interest-accrual.job';
import { AgingJob } from './jobs/aging.job';
import { ReconciliationJob } from './jobs/reconciliation.job';
import { AuditPartitionManager } from './jobs/audit-partition-manager';
import { MessageRetentionJob } from './jobs/message-retention.job';
import { CoolingOffExpiryJob } from './jobs/cooling-off-expiry.job';
import { BnplInstallmentJob } from './jobs/bnpl-installment.job';
import { BnplAutoCollectJob } from './jobs/bnpl-auto-collect.job';
import { InvoiceAgingJob } from './jobs/invoice-aging.job';
import { InvoiceOfferExpiryJob } from './jobs/invoice-offer-expiry.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
    ProcessEngineModule,
    SettlementServiceModule,
    ReconciliationServiceModule,
    OverdraftAgingModule,
  ],
  providers: [
    InterestAccrualJob,
    AgingJob,
    ReconciliationJob,
    AuditPartitionManager,
    MessageRetentionJob,
    CoolingOffExpiryJob,
    BnplInstallmentJob,
    BnplAutoCollectJob,
    InvoiceAgingJob,
    InvoiceOfferExpiryJob,
  ],
})
export class SchedulerModule {}
