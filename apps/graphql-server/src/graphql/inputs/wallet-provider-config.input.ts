import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsUrl } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import {
  WalletProviderTypeEnum,
  AdapterEnvironmentModeEnum,
} from '../types/wallet-provider-config.type';

@InputType()
export class CreateWalletProviderConfigInput {
  @Field(() => WalletProviderTypeEnum)
  @IsNotEmpty()
  providerType!: WalletProviderTypeEnum;

  @Field(() => AdapterEnvironmentModeEnum)
  @IsNotEmpty()
  environmentMode!: AdapterEnvironmentModeEnum;

  @Field()
  @IsNotEmpty()
  @IsString()
  displayName!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'apiBaseUrl must be a valid URL' })
  apiBaseUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  credentialsSecretRef?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  webhookSigningKeyRef?: string;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Provider-specific configuration JSON' })
  @IsOptional()
  configJson?: Record<string, unknown>;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@InputType()
export class UpdateWalletProviderConfigInput {
  @Field(() => WalletProviderTypeEnum, { nullable: true })
  @IsOptional()
  providerType?: WalletProviderTypeEnum;

  @Field(() => AdapterEnvironmentModeEnum, { nullable: true })
  @IsOptional()
  environmentMode?: AdapterEnvironmentModeEnum;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'apiBaseUrl must be a valid URL' })
  apiBaseUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  credentialsSecretRef?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  webhookSigningKeyRef?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  configJson?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
