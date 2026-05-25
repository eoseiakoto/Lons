import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, IsDate } from 'class-validator';

@InputType()
export class AuditLogFilterInput {
  @IsOptional()
  @IsUUID()
  @Field(() => String, { nullable: true })
  actorId?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  action?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  @Field(() => String, { nullable: true })
  resourceId?: string;

  @IsOptional()
  @IsDate()
  @Field(() => Date, { nullable: true })
  fromDate?: Date;

  @IsOptional()
  @IsDate()
  @Field(() => Date, { nullable: true })
  toDate?: Date;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  accessType?: string;
}
