import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsBoolean, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'HTTPS URL to receive event POSTs. Must be reachable from Lōns servers.',
    example: 'https://example.com/hooks/lons',
    format: 'uri',
  })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: 'List of event types to subscribe to. Use `*` (alone) to subscribe to every event.',
    example: ['contract.state_changed', 'repayment.received'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional({
    description: 'Whether the webhook is active immediately. Defaults to true.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
