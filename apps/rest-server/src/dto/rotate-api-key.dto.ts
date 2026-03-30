import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RotateApiKeyDto {
  @ApiProperty({ description: 'ID of the API key to rotate' })
  @IsString()
  apiKeyId!: string;

  @ApiProperty({
    required: false,
    default: 24,
    description: 'Grace period in hours before old key expires (default 24)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168) // max 7 days
  gracePeriodHours?: number;
}
