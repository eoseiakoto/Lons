import { InputType, Field } from '@nestjs/graphql';
import { IsDate, IsOptional, IsString, IsUUID } from 'class-validator';

@InputType()
export class PlatformAuditLogFilterInput {
  @IsOptional()
  @IsUUID()
  @Field(() => String, { nullable: true })
  tenantId?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  actorType?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  action?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  resourceType?: string;

  @IsOptional()
  @IsDate()
  @Field(() => Date, { nullable: true })
  dateFrom?: Date;

  @IsOptional()
  @IsDate()
  @Field(() => Date, { nullable: true })
  dateTo?: Date;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  search?: string;
}
