import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { APP_FILTER } from '@nestjs/core';
import { EntityServiceModule } from '@lons/entity-service';
import { ProcessEngineModule } from '@lons/process-engine';
import { RepaymentServiceModule } from '@lons/repayment-service';
import { NotificationServiceModule } from '@lons/notification-service';
import { SettlementServiceModule } from '@lons/settlement-service';
import { ReconciliationServiceModule } from '@lons/reconciliation-service';
import { IntegrationServiceModule } from '@lons/integration-service';
import { RecoveryServiceModule } from '@lons/recovery-service';

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
import { GraphqlExceptionFilter } from './filters/graphql-exception.filter';

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
    }),
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
    {
      provide: APP_FILTER,
      useClass: GraphqlExceptionFilter,
    },
  ],
})
export class AppModule {}
