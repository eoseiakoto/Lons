import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';

@InputType('CreateNotificationTemplateInput')
export class CreateNotificationTemplateInput {
  @Field()
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  eventType: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @IsEnum(['sms', 'email', 'push', 'in_app'])
  channel: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  templateBody: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}
