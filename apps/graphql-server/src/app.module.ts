import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EntityServiceModule, AuditService } from '@lons/entity-service';
import { ProcessEngineModule, SCREENING_GATE } from '@lons/process-engine';
import { ScreeningService } from '@lons/integration-service';
import { RepaymentServiceModule } from '@lons/repayment-service';
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
