import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RotateApiKeyDto {
  @ApiProperty({
    description: 'ID of the API key to rotate.',
    example: 'ak-550e8400e29b41d4a716446655440000',
  })
  @IsString()
  apiKeyId!: string;

  @ApiPropertyOptional({
    description: 'Grace period in hours before the old key expires. Range 0–168 (7 days). Defaults to 24.',
    default: 24,
    minimum: 0,
    maximum: 168,
    example: 24,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168) // max 7 days
  gracePeriodHours?: number;
}
