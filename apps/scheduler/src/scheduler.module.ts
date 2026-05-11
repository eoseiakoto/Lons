import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule, RedisClientModule } from '@lons/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { OverdraftAgingModule } from '@lons/overdraft-service';
import { AuditModule } from '@lons/entity-service';

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
import { RecourseGraceExpiryJob } from './jobs/recourse-grace-expiry.job';
import { SubscriptionInvoiceJob } from './jobs/subscription-invoice.job';
import { UsageInvoiceJob } from './jobs/usage-invoice.job';

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
    // S13B-1: AuditService is needed by jobs that perform state transitions
    // (offer expiry, recourse grace expiry, cooling-off, BNPL auto-collect)
    // so each system-actor write produces an audit-log entry.
    AuditModule,
    // Sprint 14 (S14-13) — DisbursementFeeService inside the billing
    // module reads the monthly disbursement counter from Redis to pick
    // a volume discount bracket.
    RedisClientModule.forRoot(),
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
    RecourseGraceExpiryJob,
    // Sprint 14 (S14-12, S14-13) — billing cron jobs.
    SubscriptionInvoiceJob,
    UsageInvoiceJob,
  ],
})
export class SchedulerModule {}
