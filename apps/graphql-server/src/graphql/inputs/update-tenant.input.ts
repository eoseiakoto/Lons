import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class UpdateTenantInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  planTier?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  status?: string;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Structured tenant settings (validated against TenantSettingsSchema)' })
  @IsOptional()
  settings?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  timezone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  supportEmail?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  supportPhone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  address?: string;
}
