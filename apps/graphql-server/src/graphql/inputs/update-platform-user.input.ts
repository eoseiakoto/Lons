import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsEmail, IsIn } from 'class-validator';

@InputType()
export class UpdatePlatformUserInput {
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
  @IsIn(['platform_admin', 'platform_support'])
  @Field({ nullable: true })
  role?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'suspended'])
  @Field({ nullable: true })
  status?: string;
}
