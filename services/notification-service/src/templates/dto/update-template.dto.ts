import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';

@InputType('UpdateNotificationTemplateInput')
export class UpdateNotificationTemplateInput {
  @Field()
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsEnum(['sms', 'email', 'push', 'in_app'])
  channel?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  templateBody?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @Field({ nullable: true })
  @IsOptional()
  isActive?: boolean;
}
