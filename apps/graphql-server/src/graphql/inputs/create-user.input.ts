import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEmail, MinLength } from 'class-validator';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreateUserInput {
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
  @Field()
  roleId!: string;
}

@InputType()
export class UpdateUserInput {
  @IsOptional()
  @IsEmail()
  @Field({ nullable: true })
  email?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  roleId?: string;
}
