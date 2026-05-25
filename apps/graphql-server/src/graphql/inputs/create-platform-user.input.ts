import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEmail, MinLength, IsIn } from 'class-validator';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreatePlatformUserInput {
  @IsNotEmpty()
  @IsEmail()
  @Field()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  @Field()
  password!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['platform_admin', 'platform_support'])
  @Field()
  role!: string;
}
