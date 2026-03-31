import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsDateString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ description: 'External customer ID from the SP system' })
  @IsString()
  externalId!: string;

  @ApiProperty({ description: 'Customer first name' })
  @IsString()
  firstName!: string;

  @ApiProperty({ description: 'Customer last name' })
  @IsString()
  lastName!: string;

  @ApiProperty({ description: 'Phone number (E.164 format)', example: '+233240000000' })
  @IsString()
  phone!: string;

  @ApiProperty({ required: false, description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, description: 'Date of birth (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false, description: 'National ID number' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiProperty({ required: false, description: 'ID document type', enum: ['NATIONAL_ID', 'PASSPORT', 'VOTER_ID', 'DRIVERS_LICENSE'] })
  @IsOptional()
  @IsString()
  idType?: string;
}
