import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@lons/database';
import {
  EventBusModule,
  ObservabilityModule,
  RedisClientModule,
  WalletAdaptersModule,
} from '@lons/common';
import { ProcessEngineModule } from '@lons/process-engine';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { OverdraftAgingModule } from '@lons/overdraft-service';
import { AuditModule } from '@lons/entity-service';
import { NotificationServiceModule } from '@lons/notification-service';
// FIX-BA-4 — EmiDataSyncJob is the business-logic worker; the scheduler
// wraps it in a @Cron-decorated job below. Without this import,
// `EmiDataSyncJob` is unreachable from the scheduler app and the EMI
// sync is dead code.
import { EmiDataModule } from '@lons/integration-service';
// S19-9 — broken-PTP scheduler needs the collections state machine.
import { RecoveryServiceModule } from '@lons/recovery-service';

import { InterestAccrualJob } from './jobs/interest-accrual.job';
import { BrokenPtpJob } from './jobs/broken-ptp.job';
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
import { AutoDeductionJob } from './jobs/auto-deduction.job';
import { AutoDeductionRetryJob } from './jobs/auto-deduction-retry.job';
import { SettlementJob } from './jobs/settlement.job';
import { PaymentReminderJob } from './jobs/payment-reminder.job';
import { EmiSyncJob } from './jobs/emi-sync.job';

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
    // Sprint 15 (S15-4, S15-8) — shared wallet adapters for the new
    // generic AutoDeductionJob. Defaults to mock; live mode wires real
    // adapters in Phase 5.
    WalletAdaptersModule.register(),
    // Sprint 16 (S16-10) — payment reminder scheduler needs
    // NotificationService to dispatch SMS / email reminders.
    NotificationServiceModule,
    // FIX-BA-4 — exposes EmiDataSyncJob + EmiIntegrationConfigService
    // so the cron wrapper can iterate active configs per tenant.
    EmiDataModule,
    // S19-9 — CollectionsStateMachine for the broken-PTP scheduler.
    RecoveryServiceModule,
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
    // Sprint 15 (S15-4, S15-5) — generic auto-deduction for Micro-Loan
    // + Overdraft installments + the half-hourly retry pass.
    AutoDeductionJob,
    AutoDeductionRetryJob,
    // Sprint 15 FIX-11 — SettlementJob was implemented but never wired
    // (the `@Cron('0 3 * * *')` decorator only fires for providers Nest
    // actually constructs). Registering here so daily settlement runs.
    SettlementJob,
    // Sprint 16 (S16-10) — generic payment reminder scheduler.
    PaymentReminderJob,
    // FIX-BA-4 — EMI snapshot sweep (every 30 min). Iterates active
    // tenants and active EMI integration configs and dispatches the
    // worker `EmiDataSyncJob` for each.
    EmiSyncJob,
    // S19-9 — hourly broken-PTP detection sweep across all tenants.
    BrokenPtpJob,
  ],
})
export class SchedulerModule {}
