import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsEmail, IsIn } from 'class-validator';

@InputType()
export class UpdatePlatformUserInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['platform_admin', 'platform_support'])
  role?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'suspended'])
  status?: string;
}
