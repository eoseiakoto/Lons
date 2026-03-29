import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EntityServiceModule, AuditService } from '@lons/entity-service';
import { ProcessEngineModule } from '@lons/process-engine';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { NotificationServiceModule } from '@lons/notification-service';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { IntegrationServiceModule } from '@lons/integration-service';
import { RecoveryServiceModule } from '@lons/recovery-service';
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
import { IntegrationResolver } from './graphql/resolvers/integration.resolver';
import { WebhookResolver } from './graphql/resolvers/webhook.resolver';
import { FeedbackResolver } from './graphql/resolvers/feedback.resolver';
import { DebugResolver } from './graphql/resolvers/debug.resolver';
import { NotificationMockLogResolver } from './graphql/resolvers/notification-mock-log.resolver';
import { SurveyResolver } from './graphql/resolvers/survey.resolver';
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
      context: ({ req }: { req: Request }) => ({ req }),
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
    IntegrationResolver,
    WebhookResolver,
    FeedbackResolver,
    DebugResolver,
    NotificationMockLogResolver,
    SurveyResolver,
    DebugLogService,
    {
      provide: APP_FILTER,
      useClass: GraphqlExceptionFilter,
    },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
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
