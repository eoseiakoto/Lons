import { InputType, Field } from '@nestjs/graphql';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import {
  WalletProviderTypeEnum,
  AdapterEnvironmentModeEnum,
} from '../types/wallet-provider-config.type';

@InputType()
export class CreateWalletProviderConfigInput {
  @IsNotEmpty()
  @IsEnum(WalletProviderTypeEnum)
  @Field(() => WalletProviderTypeEnum)
  providerType!: WalletProviderTypeEnum;

  @IsNotEmpty()
  @IsEnum(AdapterEnvironmentModeEnum)
  @Field(() => AdapterEnvironmentModeEnum)
  environmentMode!: AdapterEnvironmentModeEnum;

  @IsNotEmpty()
  @IsString()
  @Field()
  displayName!: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'apiBaseUrl must be a valid URL' })
  @Field({ nullable: true })
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  credentialsSecretRef?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  webhookSigningKeyRef?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Provider-specific configuration JSON' })
  configJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true, defaultValue: false })
  isDefault?: boolean;
}

@InputType()
export class UpdateWalletProviderConfigInput {
  @IsOptional()
  @IsEnum(WalletProviderTypeEnum)
  @Field(() => WalletProviderTypeEnum, { nullable: true })
  providerType?: WalletProviderTypeEnum;

  @IsOptional()
  @IsEnum(AdapterEnvironmentModeEnum)
  @Field(() => AdapterEnvironmentModeEnum, { nullable: true })
  environmentMode?: AdapterEnvironmentModeEnum;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'apiBaseUrl must be a valid URL' })
  @Field({ nullable: true })
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  credentialsSecretRef?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  webhookSigningKeyRef?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  configJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isDefault?: boolean;
}
