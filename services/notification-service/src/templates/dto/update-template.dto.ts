import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsUUID, IsEnum, IsBoolean, MaxLength } from 'class-validator';

@InputType('UpdateNotificationTemplateInput')
export class UpdateNotificationTemplateInput {
  @IsNotEmpty()
  @IsUUID()
  @Field()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  @Field({ nullable: true })
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Field({ nullable: true })
  eventType?: string;

  @IsOptional()
  @IsString()
  @IsEnum(['sms', 'email', 'push', 'in_app'])
  @Field({ nullable: true })
  channel?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  templateBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Field({ nullable: true })
  language?: string;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isActive?: boolean;
}
