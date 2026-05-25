import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class UpdateTenantInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  planTier?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  status?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Structured tenant settings (validated against TenantSettingsSchema)' })
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  timezone?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  defaultCurrency?: string;

  @IsOptional()
  @IsEmail()
  @Field({ nullable: true })
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  address?: string;
}
