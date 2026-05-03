import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEmail, MinLength, IsIn } from 'class-validator';

@InputType()
export class CreatePlatformUserInput {
  @Field()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  password!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @IsIn(['platform_admin', 'platform_support'])
  role!: string;
}
