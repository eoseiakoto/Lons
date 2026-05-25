import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';

@InputType('CreateNotificationTemplateInput')
export class CreateNotificationTemplateInput {
  @IsNotEmpty()
  @IsUUID()
  @Field()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  @Field({ nullable: true })
  productId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Field()
  eventType: string;

  @IsNotEmpty()
  @IsString()
  @IsEnum(['sms', 'email', 'push', 'in_app'])
  @Field()
  channel: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  templateBody: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Field({ nullable: true })
  language?: string;
}
