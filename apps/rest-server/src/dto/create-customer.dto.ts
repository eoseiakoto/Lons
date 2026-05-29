import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsDateString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    description: 'External customer ID from the Service Provider system. Used for cross-system reconciliation.',
    example: 'sp-ext-78421',
  })
  @IsString()
  externalId!: string;

  @ApiProperty({
    description: 'Customer first name (given name).',
    example: 'Akua',
  })
  @IsString()
  firstName!: string;

  @ApiProperty({
    description: 'Customer last name (family name).',
    example: 'Mensah',
  })
  @IsString()
  lastName!: string;

  @ApiProperty({
    description: 'Phone number in E.164 format. Encrypted at rest (CLAUDE.md §Security).',
    example: '+233241234567',
  })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Email address. Encrypted at rest when combined with identifying fields.',
    example: 'akua.mensah@example.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Date of birth as ISO 8601 calendar date (YYYY-MM-DD). Encrypted at rest.',
    example: '1992-03-15',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    description: 'National ID number. Encrypted at rest and never logged in plaintext.',
    example: 'GHA-123456789-0',
  })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({
    description: 'Type of national ID document.',
    enum: ['NATIONAL_ID', 'PASSPORT', 'VOTER_ID', 'DRIVERS_LICENSE'],
    example: 'NATIONAL_ID',
  })
  @IsOptional()
  @IsString()
  idType?: string;
}
