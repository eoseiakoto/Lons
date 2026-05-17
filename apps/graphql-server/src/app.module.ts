import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EntityServiceModule, AuditService, PlanTierConfigService } from '@lons/entity-service';
import {
  ProcessEngineModule,
  SCREENING_GATE,
  CREDIT_BUREAU_GATEWAY,
  PAYMENT_SERVICE_FOR_MANUAL_PAYMENT,
} from '@lons/process-engine';
import { ScreeningService, CreditBureauService } from '@lons/integration-service';
import { RepaymentServiceModule, PaymentService } from '@lons/repayment-service';
// Sprint 18 (S18-10, S18-3) — new workspace package for portfolio
// metrics + report export. Track A's report-export.resolver and Track
// C's portfolio-metrics need these wired in.
import { AnalyticsServiceModule } from '@lons/analytics-service';
import { NotificationServiceModule } from '@lons/notification-service';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { IntegrationServiceModule } from '@lons/integration-service';
import { RecoveryServiceModule } from '@lons/recovery-service';
import { OverdraftServiceModule } from '@lons/overdraft-service';
import {
  ObservabilityModule,
  QueryComplexityPlugin,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  RedisThrottlerStorage,
  AuditEventInterceptor,
  CorrelationIdMiddleware,
  MetricsInterceptor,
  RedisClientModule,
  PLAN_TIER_CONFIG_SERVICE,
} from '@lons/common';
import { PrismaService } from '@lons/database';

import { ApiKeyResolver } from './graphql/resolvers/api-key.resolver';
import { AuthResolver } from './graphql/resolvers/auth.resolver';
import { TenantResolver } from './graphql/resolvers/tenant.resolver';
import { ProductResolver } from './graphql/resolvers/product.resolver';
import { CustomerResolver } from './graphql/resolvers/customer.resolver';
import { LenderResolver } from './graphql/resolvers/lender.resolver';
import { SubscriptionResolver } from './graphql/resolvers/subscription.resolver';
import { LoanRequestResolver } from './graphql/resolvers/loan-request.resolver';
import { ContractResolver } from './graphql/resolvers/contract.resolver';
import { RepaymentResolver } from './graphql/resolvers/repayment.resolver';
import { SettlementResolver } from './graphql/resolvers/settlement.resolver';
import { CollectionsResolver } from './graphql/resolvers/collections.resolver';
import { AuditResolver } from './graphql/resolvers/audit.resolver';
import { PlatformAuditResolver } from './graphql/resolvers/platform-audit.resolver';
import { IntegrationResolver } from './graphql/resolvers/integration.resolver';
import { WebhookResolver } from './graphql/resolvers/webhook.resolver';
import { FeedbackResolver } from './graphql/resolvers/feedback.resolver';
import { DebugResolver } from './graphql/resolvers/debug.resolver';
import { NotificationMockLogResolver } from './graphql/resolvers/notification-mock-log.resolver';
import { UserResolver } from './graphql/resolvers/user.resolver';
import { RoleResolver } from './graphql/resolvers/role.resolver';
import { SurveyResolver } from './graphql/resolvers/survey.resolver';
import { MessageResolver } from './graphql/resolvers/message.resolver';
import { ScoringResolver } from './graphql/resolvers/scoring.resolver';
import { ScoringAnalyticsResolver } from './graphql/resolvers/scoring-analytics.resolver';
import { PlatformUserResolver } from './graphql/resolvers/platform-user.resolver';
import { TenantInsightsResolver } from './graphql/resolvers/tenant-insights.resolver';
import { ScreeningResolver } from './graphql/resolvers/screening.resolver';
import { PlatformScreeningResolver } from './graphql/resolvers/platform-screening.resolver';
import { PlatformConfigResolver } from './graphql/resolvers/platform-config.resolver';
import { ReportResolver } from './graphql/resolvers/report.resolver';
import { OverdraftResolver } from './graphql/resolvers/overdraft.resolver';
import { BnplResolver } from './graphql/resolvers/bnpl.resolver';
import { FactoringResolver } from './graphql/resolvers/factoring.resolver';
import { PlanTierResolver } from './graphql/resolvers/plan-tier.resolver';
import { InvoiceVerificationResolver } from './graphql/resolvers/invoice-verification.resolver';
import { UsageResolver } from './graphql/resolvers/usage.resolver';
import { BnplCreditLineResolver } from './graphql/resolvers/bnpl-credit-line.resolver';
import { BillingResolver } from './graphql/resolvers/billing.resolver';
import { MicroLoanResolver } from './graphql/resolvers/micro-loan.resolver';
// Sprint 17 (Track A) — EMI integration + scorecard configuration surface.
import { EmiConfigResolver } from './graphql/resolvers/emi-config.resolver';
import { ScorecardResolver } from './graphql/resolvers/scorecard.resolver';
// Sprint 17 (Track B) — customer merge / financial profile / credit summary.
import { CustomerMergeResolver } from './graphql/resolvers/customer-merge.resolver';
import { CustomerFinancialProfileResolver } from './graphql/resolvers/customer-financial-profile.resolver';
import { CustomerCreditSummaryResolver } from './graphql/resolvers/customer-credit-summary.resolver';
// Sprint 18 Track A — admin-portal operational surfaces.
import { LoanRequestReviewResolver } from './graphql/resolvers/loan-request-review.resolver';
import { ContractWriteResolver } from './graphql/resolvers/contract-write.resolver';
import { ReportExportResolver } from './graphql/resolvers/report-export.resolver';
import { SettlementDashboardResolver } from './graphql/resolvers/settlement-dashboard.resolver';
import { ApiKeyManagementResolver } from './graphql/resolvers/api-key-management.resolver';
import { PlanTierDashboardResolver } from './graphql/resolvers/plan-tier-dashboard.resolver';
import { DebugLogService } from './graphql/services/debug-log.service';
import { GraphqlExceptionFilter } from './filters/graphql-exception.filter';
import { SubscriptionModule } from './subscriptions/subscription.module';

const queryComplexityPlugin = new QueryComplexityPlugin({ maxDepth: 10, maxCost: 1000 });

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      subscriptions: {
        'graphql-ws': true,
      },
      plugins: [queryComplexityPlugin as any],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 200 }],
      storage: new RedisThrottlerStorage(),
    }),
    ObservabilityModule,
    // Sprint 14 (S14-9) — shared Redis client (PlanTierConfig cache,
    // QuotaTracking counters). Must come before EntityServiceModule so
    // the REDIS_CLIENT provider is resolvable.
    RedisClientModule.forRoot(),
    SubscriptionModule,
    EntityServiceModule,
    ProcessEngineModule,
    RepaymentServiceModule,
    NotificationServiceModule,
    SettlementServiceModule,
    ReconciliationServiceModule,
    IntegrationServiceModule,
    RecoveryServiceModule,
    OverdraftServiceModule,
    // Sprint 18 — portfolio metrics (S18-10) + report export (S18-3).
    AnalyticsServiceModule,
  ],
  providers: [
    ApiKeyResolver,
    AuthResolver,
    TenantResolver,
    ProductResolver,
    CustomerResolver,
    LenderResolver,
    SubscriptionResolver,
    LoanRequestResolver,
    ContractResolver,
    RepaymentResolver,
    SettlementResolver,
    CollectionsResolver,
    AuditResolver,
    PlatformAuditResolver,
    IntegrationResolver,
    WebhookResolver,
    FeedbackResolver,
    DebugResolver,
    NotificationMockLogResolver,
    UserResolver,
    RoleResolver,
    SurveyResolver,
    MessageResolver,
    ScoringResolver,
    ScoringAnalyticsResolver,
    PlatformUserResolver,
    TenantInsightsResolver,
    ScreeningResolver,
    PlatformScreeningResolver,
    ReportResolver,
    OverdraftResolver,
    BnplResolver,
    FactoringResolver,
    PlatformConfigResolver,
    PlanTierResolver,
    InvoiceVerificationResolver,
    UsageResolver,
    // Sprint 15 (S15-1, S15-2) — BNPL credit line GraphQL surface.
    BnplCreditLineResolver,
    // Sprint 15 (S15-BILL-1) — billing invoice GraphQL surface (closes
    // BA findings F-S14-B2 + F-S14-B3 from the Sprint 14 review).
    BillingResolver,
    // Sprint 16 (S16-6) — micro-loan credit-limit audit query.
    MicroLoanResolver,
    // Sprint 17 Track A — EMI integration + scorecard configuration.
    EmiConfigResolver,
    ScorecardResolver,
    // Sprint 17 Track B — customer merge / financial profile / credit summary.
    CustomerMergeResolver,
    CustomerFinancialProfileResolver,
    CustomerCreditSummaryResolver,
    // Sprint 18 Track A — admin-portal operational surfaces.
    LoanRequestReviewResolver,
    ContractWriteResolver,
    ReportExportResolver,
    SettlementDashboardResolver,
    ApiKeyManagementResolver,
    PlanTierDashboardResolver,
    // Sprint 14 (S14-9) — bind the PLAN_TIER_CONFIG_SERVICE injection
    // token used by @RequiresPlan's guard. Keeps @lons/common free of
    // an entity-service dependency.
    {
      provide: PLAN_TIER_CONFIG_SERVICE,
      useExisting: PlanTierConfigService,
    },
    DebugLogService,
    {
      provide: APP_FILTER,
      useClass: GraphqlExceptionFilter,
    },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
    {
      provide: SCREENING_GATE,
      useExisting: ScreeningService,
    },
    // Sprint 17 S17-3 — bind process-engine's CreditBureauFeatureExtractor
    // against integration-service's CreditBureauService without
    // process-engine taking a runtime dependency on integration-service
    // (would close the cycle, since integration-service already imports
    // process-engine for repayment events).
    {
      provide: CREDIT_BUREAU_GATEWAY,
      useExisting: CreditBureauService,
    },
    // Sprint 18 S18-2 — ContractWriteOperationsService is decoupled
    // from @lons/repayment-service via a structural interface +
    // symbol token. Bind it here so recordManualPayment can dispatch
    // to the real PaymentService rather than failing fast with
    // "PaymentService unavailable".
    {
      provide: PAYMENT_SERVICE_FOR_MANUAL_PAYMENT,
      useExisting: PaymentService,
    },
    {
      provide: 'AUDIT_SERVICE',
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService],
    },
    { provide: APP_INTERCEPTOR, useClass: AuditEventInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes('*');
  }
}
