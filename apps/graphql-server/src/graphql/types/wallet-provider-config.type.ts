import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { PageInfo } from './page-info.type';

export enum WalletProviderTypeEnum {
  MOCK = 'MOCK',
  MTN_MOMO = 'MTN_MOMO',
  MPESA = 'MPESA',
  AIRTEL_MONEY = 'AIRTEL_MONEY',
  GENERIC = 'GENERIC',
}

registerEnumType(WalletProviderTypeEnum, {
  name: 'WalletProviderType',
  description: 'Type of wallet provider integration',
});

export enum AdapterEnvironmentModeEnum {
  SANDBOX = 'SANDBOX',
  PRODUCTION = 'PRODUCTION',
}

registerEnumType(AdapterEnvironmentModeEnum, {
  name: 'AdapterEnvironmentMode',
  description: 'Environment mode for adapter (sandbox or production)',
});

@ObjectType()
export class WalletProviderConfigType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field(() => WalletProviderTypeEnum)
  providerType!: WalletProviderTypeEnum;

  @Field(() => AdapterEnvironmentModeEnum)
  environmentMode!: AdapterEnvironmentModeEnum;

  @Field()
  displayName!: string;

  @Field({ nullable: true })
  apiBaseUrl?: string;

  @Field({ nullable: true })
  credentialsSecretRef?: string;

  @Field({ nullable: true })
  webhookSigningKeyRef?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  configJson?: Record<string, unknown>;

  @Field()
  isActive!: boolean;

  @Field()
  isDefault!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field({ nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class WalletProviderConfigEdge {
  @Field(() => WalletProviderConfigType)
  node!: WalletProviderConfigType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class WalletProviderConfigConnection {
  @Field(() => [WalletProviderConfigEdge])
  edges!: WalletProviderConfigEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}

@ObjectType()
export class ConnectionTestResult {
  @Field()
  success!: boolean;

  @Field()
  latencyMs!: number;

  @Field({ nullable: true })
  errorMessage?: string;
}
